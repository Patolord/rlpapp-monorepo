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
