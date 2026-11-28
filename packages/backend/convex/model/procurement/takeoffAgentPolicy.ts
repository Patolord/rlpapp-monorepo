import {
  findTakeoffAgentModel,
  type TakeoffAgentSettings,
} from "@rlpapp/shared/takeoff/agentModels";

/**
 * Pure request-policy and SSE usage parser for the built-in Takeoff AI proxy
 * (`gateway/takeoffAgentProxy.ts`). Keeping this pure makes body enforcement
 * and SSE parsing straightforward to test without network calls.
 */

/** Hard ceiling for incoming Messages API requests (keeps HTTP action RAM well under 64 MiB). */
export const MAX_PROXY_REQUEST_BYTES = 10 * 1024 * 1024;

/** Maximum concurrent in-flight upstream requests allowed per run. */
export const MAX_IN_FLIGHT_CALLS_PER_RUN = 2;

const ALLOWED_CORS_ORIGINS = new Set([
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "http://localhost:1420",
  "http://127.0.0.1:1420",
  "http://localhost:1425",
  "http://127.0.0.1:1425",
]);

/**
 * CORS headers for the Tauri desktop webview and local Vite dev server.
 * Requests without an Origin header (native/server-side) do not need ACAO.
 */
export function agentCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  const allowedOrigin =
    origin && ALLOWED_CORS_ORIGINS.has(origin) ? origin : null;
  return {
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, anthropic-version, anthropic-beta, x-api-key, x-takeoff-run-id",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** Whitelisted top-level fields forwarded to Anthropic `/v1/messages`. */
const ALLOWED_BODY_KEYS = [
  "messages",
  "system",
  "tools",
  "tool_choice",
  "stream",
  "temperature",
  "top_p",
  "top_k",
  "stop_sequences",
  "metadata",
  "thinking",
  "output_config",
] as const;

export type SanitizedAnthropicBodyResult =
  | {
      ok: true;
      body: Record<string, unknown>;
      imageCount: number;
      stream: boolean;
    }
  | {
      ok: false;
      message: string;
    };

/** Count base64/URL image blocks inside an Anthropic `messages` payload. */
export function countMessageImages(messages: unknown): number {
  if (!Array.isArray(messages)) return 0;
  let count = 0;
  const walkBlock = (block: unknown): void => {
    if (!block || typeof block !== "object") return;
    const rec = block as Record<string, unknown>;
    if (rec.type === "image") {
      count++;
      return;
    }
    if (rec.type === "tool_result" && Array.isArray(rec.content)) {
      for (const nested of rec.content) walkBlock(nested);
    }
  };
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const content = (msg as Record<string, unknown>).content;
    if (Array.isArray(content)) {
      for (const block of content) walkBlock(block);
    }
  }
  return count;
}

/**
 * Enforces company policy on an Anthropic Messages API request body:
 * - rejects non-objects or missing `messages` array;
 * - drops unknown top-level keys;
 * - forces `model` from company settings;
 * - clamps `max_tokens` to `settings.maxTokensPerTurn`;
 * - sets `output_config.effort` from company settings when supported by the model.
 */
export function sanitizeAnthropicRequestBody(
  raw: unknown,
  settings: TakeoffAgentSettings
): SanitizedAnthropicBodyResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, message: "O corpo da requisição deve ser um objeto JSON." };
  }
  const src = raw as Record<string, unknown>;
  if (!Array.isArray(src.messages) || src.messages.length === 0) {
    return { ok: false, message: "A lista de mensagens está ausente ou vazia." };
  }

  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_BODY_KEYS) {
    if (src[key] !== undefined) out[key] = src[key];
  }

  out.model = settings.model;

  const requestedMaxTokens =
    typeof src.max_tokens === "number" &&
    Number.isFinite(src.max_tokens) &&
    src.max_tokens > 0
      ? Math.floor(src.max_tokens)
      : settings.maxTokensPerTurn;
  out.max_tokens = Math.min(requestedMaxTokens, settings.maxTokensPerTurn);

  const modelSpec = findTakeoffAgentModel(settings.model);
  if (modelSpec?.supportsEffort) {
    const existingOutputConfig =
      out.output_config &&
      typeof out.output_config === "object" &&
      !Array.isArray(out.output_config)
        ? (out.output_config as Record<string, unknown>)
        : {};
    out.output_config = { ...existingOutputConfig, effort: settings.effort };
  }

  const stream = out.stream === true;
  const imageCount = countMessageImages(out.messages);

  return { ok: true, body: out, imageCount, stream };
}

export interface ParsedAnthropicUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  stopReason: string | undefined;
  toolsCalled: string[];
}

function readNum(obj: Record<string, unknown>, key: string): number | undefined {
  const val = obj[key];
  return typeof val === "number" && Number.isFinite(val) && val >= 0
    ? Math.floor(val)
    : undefined;
}

/**
 * Incremental SSE usage parser for Anthropic Messages streams.
 * Feeds UTF-8 chunks as they pass through the streaming proxy without retaining
 * the response body in memory.
 */
export class AnthropicSseUsageParser {
  private readonly decoder = new TextDecoder();
  private buffer = "";
  private inputTokens = 0;
  private outputTokens = 0;
  private cacheReadTokens = 0;
  private cacheCreationTokens = 0;
  private stopReason: string | undefined;
  private readonly tools = new Set<string>();

  push(chunk: Uint8Array): void {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    this.drain(false);
  }

  finish(): ParsedAnthropicUsage {
    this.buffer += this.decoder.decode();
    this.drain(true);
    return this.snapshot();
  }

  snapshot(): ParsedAnthropicUsage {
    return {
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      cacheReadTokens: this.cacheReadTokens,
      cacheCreationTokens: this.cacheCreationTokens,
      stopReason: this.stopReason,
      toolsCalled: [...this.tools],
    };
  }

  private drain(flush: boolean): void {
    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newlineIndex + 1);
      this.handleLine(line);
      newlineIndex = this.buffer.indexOf("\n");
    }
    if (flush && this.buffer.length > 0) {
      this.handleLine(this.buffer.replace(/\r$/, ""));
      this.buffer = "";
    }
  }

  private handleLine(line: string): void {
    if (!line.startsWith("data:")) return;
    const raw = line.slice(5).trim();
    if (!raw || raw === "[DONE]") return;
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (!payload || typeof payload !== "object") return;
    const event = payload as Record<string, unknown>;
    const type = event.type;

    if (type === "message_start" && event.message && typeof event.message === "object") {
      const msg = event.message as Record<string, unknown>;
      if (msg.usage && typeof msg.usage === "object") {
        this.applyUsage(msg.usage as Record<string, unknown>);
      }
      return;
    }

    if (
      type === "content_block_start" &&
      event.content_block &&
      typeof event.content_block === "object"
    ) {
      const block = event.content_block as Record<string, unknown>;
      if (block.type === "tool_use" && typeof block.name === "string" && block.name.trim()) {
        this.tools.add(block.name.trim());
      }
      return;
    }

    if (type === "message_delta") {
      if (event.delta && typeof event.delta === "object") {
        const sr = (event.delta as Record<string, unknown>).stop_reason;
        if (typeof sr === "string" && sr) this.stopReason = sr;
      }
      if (event.usage && typeof event.usage === "object") {
        this.applyUsage(event.usage as Record<string, unknown>);
      }
    }
  }

  private applyUsage(usage: Record<string, unknown>): void {
    const input = readNum(usage, "input_tokens");
    const output = readNum(usage, "output_tokens");
    const cacheRead = readNum(usage, "cache_read_input_tokens");
    const cacheCreation = readNum(usage, "cache_creation_input_tokens");
    if (input !== undefined) this.inputTokens = input;
    if (output !== undefined) this.outputTokens = output;
    if (cacheRead !== undefined) this.cacheReadTokens = cacheRead;
    if (cacheCreation !== undefined) this.cacheCreationTokens = cacheCreation;
  }
}

/** Extract usage & tool names from a non-streaming Anthropic Messages JSON response. */
export function extractUsageFromJsonResponse(raw: unknown): ParsedAnthropicUsage {
  const empty: ParsedAnthropicUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    stopReason: undefined,
    toolsCalled: [],
  };
  if (!raw || typeof raw !== "object") return empty;
  const obj = raw as Record<string, unknown>;
  const usage =
    obj.usage && typeof obj.usage === "object"
      ? (obj.usage as Record<string, unknown>)
      : {};
  const tools = new Set<string>();
  if (Array.isArray(obj.content)) {
    for (const block of obj.content) {
      if (
        block &&
        typeof block === "object" &&
        (block as Record<string, unknown>).type === "tool_use" &&
        typeof (block as Record<string, unknown>).name === "string"
      ) {
        const name = ((block as Record<string, unknown>).name as string).trim();
        if (name) tools.add(name);
      }
    }
  }
  return {
    inputTokens: readNum(usage, "input_tokens") ?? 0,
    outputTokens: readNum(usage, "output_tokens") ?? 0,
    cacheReadTokens: readNum(usage, "cache_read_input_tokens") ?? 0,
    cacheCreationTokens: readNum(usage, "cache_creation_input_tokens") ?? 0,
    stopReason: typeof obj.stop_reason === "string" ? obj.stop_reason : undefined,
    toolsCalled: [...tools],
  };
}

/**
 * Tees an upstream Anthropic SSE `ReadableStream` chunk-by-chunk while parsing
 * token usage and tool names. Invokes `onFinish` exactly once — BEFORE closing
 * the downstream controller or resolving `cancel()` — so callers can commit
 * ledger rows before the runtime tears down the request.
 */
export function createAnthropicUsageTeeStream(
  upstreamBody: ReadableStream<Uint8Array>,
  onFinish: (result: {
    status: "ok" | "aborted" | "error";
    usage: ParsedAnthropicUsage;
    errorMessage?: string;
  }) => Promise<void>
): ReadableStream<Uint8Array> {
  const reader = upstreamBody.getReader();
  const parser = new AnthropicSseUsageParser();
  let finished = false;

  const finalize = async (
    status: "ok" | "aborted" | "error",
    errorMessage?: string
  ): Promise<void> => {
    if (finished) return;
    finished = true;
    await onFinish({ status, usage: parser.finish(), errorMessage });
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          await finalize("ok");
          controller.close();
          return;
        }
        if (value) {
          parser.push(value);
          controller.enqueue(value);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await finalize("error", msg);
        controller.error(err);
      }
    },
    async cancel() {
      try {
        await reader.cancel();
      } catch {
        // Ignore upstream cancellation error.
      }
      await finalize("aborted");
    },
  });
}
