import { ConvexError } from "convex/values";
import { toast } from "sonner";

/** Extrai mensagem legível de erros (Convex, Error ou desconhecido). */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError) {
    if (typeof error.data === "string") return error.data;
    // erros com código ({ code, message }), como os do orçamento do desktop
    const message = (error.data as { message?: unknown } | null)?.message;
    return typeof message === "string" && message ? message : fallback;
  }
  if (error instanceof Error && error.message) {
    // Convex prefixa erros de servidor; mantém só a parte útil
    const match = error.message.match(/Uncaught Error: (.*?)(?:\n| at )/);
    return match?.[1] ?? error.message;
  }
  return fallback;
}

/**
 * Executa uma ação async com feedback padrão de toast.
 * Retorna true em sucesso (para fechar dialogs/resetar forms no caller).
 */
export async function runWithToast(
  action: () => Promise<unknown>,
  successMessage: string,
  errorFallback: string
): Promise<boolean> {
  try {
    await action();
    toast.success(successMessage);
    return true;
  } catch (error) {
    toast.error(getErrorMessage(error, errorFallback));
    return false;
  }
}
