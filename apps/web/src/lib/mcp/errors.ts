import { ConvexError } from "convex/values";

const ALLOWED_MESSAGES = new Set([
  "Not authenticated",
  "Acesso restrito à área de engenharia",
  "Usuário desativado",
  "Insufficient permissions",
  "User not found in database",
]);

export function sanitizeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Request failed";
  if (ALLOWED_MESSAGES.has(message)) return message;
  if (message.startsWith("ArgumentValidationError")) {
    return "Invalid request";
  }
  console.error("MCP tool error", error);
  return "Unable to complete request";
}

/**
 * Mensagem de erro para as ferramentas derivadas do catálogo. Diferente de
 * `sanitizeErrorMessage`, devolve o texto que a própria função lançou — é o
 * mesmo que o app mostraria num toast para o mesmo usuário, e é o que permite
 * ao agente se corrigir ("Obra de destino não encontrada", "Token de agente
 * somente leitura", erros de validação de argumentos). Em produção o Convex já
 * redige `throw new Error(...)` para "Server Error"; só `ConvexError` passa.
 */
export function describeToolError(error: unknown): string {
  if (error instanceof ConvexError) {
    const data: unknown = error.data;
    if (typeof data === "string") return data;
    if (data && typeof data === "object" && "message" in data) {
      const message = (data as { message?: unknown }).message;
      if (typeof message === "string") return message;
    }
    return error.message;
  }
  const raw = error instanceof Error ? error.message : String(error);
  const withoutRequestId = raw.replace(
    /^\[Request ID: ([^\]]+)\] Server Error\n?/,
    ""
  );
  const firstLines: string[] = [];
  for (const line of withoutRequestId.split("\n")) {
    if (/^\s+at\s/.test(line)) break;
    firstLines.push(line);
  }
  const cleaned = firstLines
    .join("\n")
    .replace(/^Uncaught (?:ConvexError|Error|TypeError|RangeError|\w+Error):\s*/, "")
    .replace(/^ArgumentValidationError:\s*/, "Invalid arguments: ")
    .trim();
  if (cleaned) return cleaned;
  const requestId = raw.match(/^\[Request ID: ([^\]]+)\]/)?.[1];
  return requestId
    ? `The function failed with a redacted server error (request ID ${requestId}). Check the Convex logs.`
    : "Unable to complete request";
}
