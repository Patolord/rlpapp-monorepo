import { errorMessage } from "@rlpapp/shared/errors";

/**
 * Extrai mensagem legível de erros: `ConvexError({ code, message })` do
 * backend, `Error` comum (dev) ou desconhecido (ver @rlpapp/shared/errors).
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  return errorMessage(error, fallback);
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
