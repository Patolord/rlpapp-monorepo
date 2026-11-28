import type { HttpRouter } from "convex/server";
import { internal } from "../_generated/api";
import { env, httpAction } from "../_generated/server";
import {
  agentCorsHeaders,
  createAnthropicUsageTeeStream,
  extractUsageFromJsonResponse,
  MAX_PROXY_REQUEST_BYTES,
  sanitizeAnthropicRequestBody,
} from "../model/procurement/takeoffAgentPolicy";
import { json } from "./responses";

/**
 * Anthropic Messages streaming proxy for the built-in AI agent of RLP Takeoff:
 *
 *   POST /takeoff/agent/messages
 *
 * The desktop app points `@ai-sdk/anthropic` (`baseURL: <convex site>/takeoff/agent`)
 * here with the signed-in user's short ES256 JWT (`Authorization: Bearer ...`).
 * Convex verifies the JWT automatically via `auth.config.ts`, then this handler:
 * 1. checks `takeoff.agente`, kill switch, monthly budgets and turn cap via
 *    `internal.takeoffAgent.authorizeTurn`;
 * 2. enforces company model, effort, `max_tokens` and allowed top-level fields;
 * 3. forwards to Anthropic `/v1/messages` with `ANTHROPIC_API_KEY`;
 * 4. tees the SSE stream chunk-by-chunk, parsing usage + tool names and
 *    committing `internal.takeoffAgent.recordCall` BEFORE closing or cancelling
 *    the stream so the Convex isolate never tears down before the ledger writes.
 */

const MESSAGES_PATH = "/takeoff/agent/messages";
const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";

function anthropicErrorResponse(
  status: number,
  type: string,
  message: string,
  cors: Record<string, string>
): Response {
  return json(
    {
      type: "error",
      error: { type, message },
    },
    status,
    cors
  );
}

const handlePreflight = httpAction(async (_ctx, request) => {
  return new Response(null, {
    status: 204,
    headers: agentCorsHeaders(request),
  });
});

const handleMessages = httpAction(async (ctx, request) => {
  const cors = agentCorsHeaders(request);

  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return anthropicErrorResponse(
      503,
      "api_error",
      "A chave da Anthropic (ANTHROPIC_API_KEY) não está configurada no servidor.",
      cors
    );
  }

  // Reject declared oversized bodies before reading into memory.
  const declaredLen = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLen) && declaredLen > MAX_PROXY_REQUEST_BYTES) {
    return anthropicErrorResponse(
      413,
      "invalid_request_error",
      `A requisição excede o limite de ${Math.round(MAX_PROXY_REQUEST_BYTES / (1024 * 1024))} MB.`,
      cors
    );
  }

  const rawBytes = new Uint8Array(await request.arrayBuffer());
  const requestBytes = rawBytes.byteLength;
  if (requestBytes > MAX_PROXY_REQUEST_BYTES) {
    return anthropicErrorResponse(
      413,
      "invalid_request_error",
      `A requisição excede o limite de ${Math.round(MAX_PROXY_REQUEST_BYTES / (1024 * 1024))} MB.`,
      cors
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(new TextDecoder().decode(rawBytes));
  } catch {
    return anthropicErrorResponse(
      400,
      "invalid_request_error",
      "O corpo da requisição não é um JSON válido.",
      cors
    );
  }

  const runIdHeader = request.headers.get("x-takeoff-run-id")?.trim() || undefined;
  const auth = await ctx.runMutation(internal.takeoffAgent.authorizeTurn, {
    runId: runIdHeader,
  });

  if (!auth.ok) {
    const errorType =
      auth.status === 401
        ? "authentication_error"
        : auth.status === 403
          ? "permission_error"
          : auth.status === 429
            ? "rate_limit_error"
            : "invalid_request_error";
    return anthropicErrorResponse(auth.status, errorType, auth.message, cors);
  }

  const startedAt = Date.now();
  const sanitized = sanitizeAnthropicRequestBody(parsedBody, auth.settings);
  if (!sanitized.ok) {
    // Release the in-flight slot immediately if body validation failed.
    await ctx.runMutation(internal.takeoffAgent.recordCall, {
      runId: auth.runId,
      userId: auth.userId,
      month: auth.month,
      turn: auth.turn,
      model: auth.settings.model,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      requestBytes,
      imageCount: 0,
      toolsCalled: [],
      durationMs: Date.now() - startedAt,
      status: "error",
      errorMessage: sanitized.message,
    });
    return anthropicErrorResponse(
      400,
      "invalid_request_error",
      sanitized.message,
      cors
    );
  }

  const upstreamBase = (env.ANTHROPIC_BASE_URL?.trim() || DEFAULT_ANTHROPIC_BASE_URL).replace(
    /\/+$/,
    ""
  );
  const upstreamUrl = `${upstreamBase}/v1/messages`;
  const upstreamHeaders: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version":
      request.headers.get("anthropic-version") ?? DEFAULT_ANTHROPIC_VERSION,
  };
  const beta = request.headers.get("anthropic-beta");
  if (beta) upstreamHeaders["anthropic-beta"] = beta;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify(sanitized.body),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? `Falha ao conectar à Anthropic: ${error.message}`
        : "Falha ao conectar à Anthropic.";
    await ctx.runMutation(internal.takeoffAgent.recordCall, {
      runId: auth.runId,
      userId: auth.userId,
      month: auth.month,
      turn: auth.turn,
      model: auth.settings.model,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      requestBytes,
      imageCount: sanitized.imageCount,
      toolsCalled: [],
      durationMs: Date.now() - startedAt,
      status: "error",
      errorMessage: message,
    });
    return anthropicErrorResponse(502, "api_error", message, cors);
  }

  // Pass upstream non-2xx responses (429 rate limit, 529 overloaded, 400 refusal) through.
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    await ctx.runMutation(internal.takeoffAgent.recordCall, {
      runId: auth.runId,
      userId: auth.userId,
      month: auth.month,
      turn: auth.turn,
      model: auth.settings.model,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      requestBytes,
      imageCount: sanitized.imageCount,
      toolsCalled: [],
      durationMs: Date.now() - startedAt,
      status: "error",
      errorMessage: `Anthropic HTTP ${upstream.status}: ${text.slice(0, 240)}`,
    });
    return new Response(text, {
      status: upstream.status,
      headers: {
        ...cors,
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  // Non-streaming JSON response path.
  const contentType = upstream.headers.get("content-type") ?? "";
  if (!sanitized.stream || !upstream.body || !contentType.includes("text/event-stream")) {
    const text = await upstream.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    const usage = extractUsageFromJsonResponse(parsed);
    await ctx.runMutation(internal.takeoffAgent.recordCall, {
      runId: auth.runId,
      userId: auth.userId,
      month: auth.month,
      turn: auth.turn,
      model: auth.settings.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheCreationTokens: usage.cacheCreationTokens,
      requestBytes,
      imageCount: sanitized.imageCount,
      toolsCalled: usage.toolsCalled,
      durationMs: Date.now() - startedAt,
      status: "ok",
      stopReason: usage.stopReason,
    });
    return new Response(text, {
      status: upstream.status,
      headers: {
        ...cors,
        "Content-Type": contentType || "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "x-takeoff-run-id": auth.runId,
      },
    });
  }

  // Streaming SSE response path: tee chunks to AnthropicSseUsageParser and
  // commit the usage ledger row before the stream closes or cancels.
  const stream = createAnthropicUsageTeeStream(
    upstream.body,
    async ({ status, usage, errorMessage }) => {
      try {
        await ctx.runMutation(internal.takeoffAgent.recordCall, {
          runId: auth.runId,
          userId: auth.userId,
          month: auth.month,
          turn: auth.turn,
          model: auth.settings.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadTokens: usage.cacheReadTokens,
          cacheCreationTokens: usage.cacheCreationTokens,
          requestBytes,
          imageCount: sanitized.imageCount,
          toolsCalled: usage.toolsCalled,
          durationMs: Date.now() - startedAt,
          status,
          stopReason: usage.stopReason,
          errorMessage,
        });
      } catch (err) {
        console.error("takeoffAgentProxy: failed to commit ledger row", err);
      }
    }
  );

  return new Response(stream, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store",
      "x-takeoff-run-id": auth.runId,
    },
  });
});

export function registerTakeoffAgentRoutes(http: HttpRouter): void {
  http.route({
    path: MESSAGES_PATH,
    method: "POST",
    handler: handleMessages,
  });
  http.route({
    path: MESSAGES_PATH,
    method: "OPTIONS",
    handler: handlePreflight,
  });
}
