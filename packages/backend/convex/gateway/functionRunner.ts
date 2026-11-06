import type { ActionCtx } from "../_generated/server";
import { mintToken, type AuthenticatedCaller, type RequestAudit } from "./callerAuth";
import { READ_ONLY_MESSAGE, preflight, type FunctionKind } from "./functionCatalog";
import { translateFunctionError, type ConvexFunctionResult } from "./functionErrors";
import { ApiError, json } from "./responses";

// Execução de uma função em nome do dono do token, via Functions API do deployment.

export function deploymentUrl(): string {
  const url = process.env.CONVEX_CLOUD_URL;
  if (!url) throw new ApiError("INTERNAL_ERROR", "CONVEX_CLOUD_URL is not set");
  return url.replace(/\/+$/, "");
}

export async function runFunction(
  ctx: ActionCtx,
  caller: AuthenticatedCaller,
  kind: FunctionKind,
  path: string,
  args: Record<string, unknown>,
  audit: RequestAudit
): Promise<Response> {
  audit.functionPath = path;
  const readOnly = caller.token.permission === "read_only";
  if (readOnly && (kind === "mutation" || kind === "action")) {
    throw new ApiError("UNAUTHORIZED", READ_ONLY_MESSAGE, { function: path });
  }

  const checked = await preflight(ctx, caller, kind, path, args, readOnly);
  if ("response" in checked) return checked.response;

  // `/run` aceita qualquer tipo. Sem entrada no catálogo o gateway não sabe o
  // que `path` é, então para tokens somente leitura força o endpoint de
  // query: o Convex se recusa a executar mutation/action ali, e isso vira o
  // erro de somente leitura abaixo. Tokens de acesso total mantêm `/api/run`.
  if (readOnly && kind === "run") {
    kind = "query";
  }

  const { token } = await mintToken(caller);
  const endpoint =
    kind === "run"
      ? `${deploymentUrl()}/api/run/${path.replace(":", "/")}`
      : `${deploymentUrl()}/api/${kind}`;
  const body = kind === "run" ? { args, format: "json" } : { path, args, format: "json" };

  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  let result: ConvexFunctionResult;
  try {
    result = (await upstream.json()) as ConvexFunctionResult;
  } catch {
    throw new ApiError("INTERNAL_ERROR", `Unexpected response from deployment (${upstream.status})`);
  }

  if (result.status === "success") {
    return json({ data: result.value ?? null });
  }

  return await translateFunctionError(ctx, caller, {
    result,
    upstreamStatus: upstream.status,
    path,
    readOnly,
  });
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Request body must be a JSON object.");
  }
}

export function readArgs(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError("VALIDATION_ERROR", "`args` must be a JSON object.");
  }
  return value as Record<string, unknown>;
}
