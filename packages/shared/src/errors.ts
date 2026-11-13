/**
 * Erros que o backend devolve aos apps: `ConvexError({ code, message })`.
 *
 * `Error` comum vira "Server Error" em produção (o Convex redige a mensagem),
 * então toda recusa que o usuário pode causar sai como ConvexError com um
 * destes códigos e a mensagem em pt-BR. Web, native, desktop, MCP e a API
 * `/api/v1` leem o mesmo formato com `appErrorData` / `errorMessage`.
 */

/** Recusas de regra de negócio (lib/domainErrors.ts no backend). */
export const DOMAIN_ERROR_CODES = ["NOT_FOUND", "ALREADY_EXISTS", "RULE_VIOLATION"] as const;
export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

/** Recusas de acesso (lib/accessErrors.ts no backend). */
export type AccessErrorCode = "UNAUTHENTICATED" | "FORBIDDEN";

/**
 * Formato de todo erro estruturado. Fluxos com códigos próprios (orçamento do
 * desktop, propostas de material) usam o mesmo formato com outros códigos.
 */
export type AppErrorData = {
  code: string;
  message: string;
  [key: string]: unknown;
};

function dataOf(error: unknown): unknown {
  return typeof error === "object" && error !== null && "data" in error
    ? (error as { data: unknown }).data
    : undefined;
}

/** Dados `{ code, message }` de um ConvexError; null para qualquer outro erro. */
export function appErrorData(error: unknown): AppErrorData | null {
  const data = dataOf(error);
  if (typeof data !== "object" || data === null) return null;
  const { code, message } = data as { code?: unknown; message?: unknown };
  if (typeof code !== "string" || typeof message !== "string") return null;
  return data as AppErrorData;
}

/** Código do erro estruturado, ou null. */
export function errorCode(error: unknown): string | null {
  return appErrorData(error)?.code ?? null;
}

/**
 * Mensagem legível de qualquer falha: a do ConvexError (objeto ou texto), a de
 * um `Error` comum sem o prefixo "Uncaught Error:" que o Convex põe em dev, ou
 * o `fallback`.
 */
export function errorMessage(error: unknown, fallback: string): string {
  const structured = appErrorData(error);
  if (structured?.message) return structured.message;
  const data = dataOf(error);
  if (typeof data === "string" && data) return data;
  if (error instanceof Error && error.message) {
    const match = error.message.match(/Uncaught (?:ConvexError|Error): (.*?)(?:\n| at |$)/);
    return match?.[1] || error.message;
  }
  return fallback;
}
