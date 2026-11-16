import { errorMessage } from "@rlpapp/shared/errors";
import { toast } from "sonner";

/**
 * Extrai mensagem legível de erros: `ConvexError({ code, message })` do
 * backend, `Error` comum (dev) ou desconhecido (ver @rlpapp/shared/errors).
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  return errorMessage(error, fallback);
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
