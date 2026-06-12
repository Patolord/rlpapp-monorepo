import { ConvexError } from "convex/values";

/** Extrai mensagem legível de erros (Convex, Error ou desconhecido). */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError) {
    return typeof error.data === "string" ? error.data : fallback;
  }
  if (error instanceof Error && error.message) {
    // Convex prefixa erros de servidor; mantém só a parte útil
    const match = error.message.match(/Uncaught Error: (.*?)(?:\n| at )/);
    return match?.[1] ?? error.message;
  }
  return fallback;
}

/** Extrai mensagem dos erros estruturados do Clerk ({ errors: [{ message }] }). */
export function getClerkErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "errors" in error &&
    Array.isArray((error as { errors: unknown }).errors)
  ) {
    const first = (error as { errors: { message?: unknown }[] }).errors[0];
    if (first && typeof first.message === "string") {
      return first.message;
    }
  }
  return getErrorMessage(error, fallback);
}
