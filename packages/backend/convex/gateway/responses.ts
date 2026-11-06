// Respostas JSON e erros da API HTTP /api/v1 (ver v1.ts).

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "NOT_CONFIGURED"
  | "FUNCTION_ERROR"
  | "INTERNAL_ERROR";

export const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  UNAUTHORIZED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  CONFLICT: 409,
  VALIDATION_ERROR: 400,
  RATE_LIMITED: 429,
  NOT_CONFIGURED: 503,
  FUNCTION_ERROR: 400,
  INTERNAL_ERROR: 500,
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

export function json(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

export function errorResponse(
  code: ApiErrorCode,
  message: string,
  details?: unknown,
  extraHeaders?: Record<string, string>
): Response {
  return json(
    { error: { code, message, ...(details !== undefined ? { details } : {}) } },
    STATUS_BY_CODE[code],
    extraHeaders
  );
}

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: unknown,
    public readonly headers?: Record<string, string>
  ) {
    super(message);
  }
}
