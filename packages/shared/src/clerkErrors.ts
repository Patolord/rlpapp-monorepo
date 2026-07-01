type ClerkErrorLike = {
  code?: string;
  message?: string;
  longMessage?: string;
};

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  form_identifier_not_found: "Usuário não encontrado.",
  form_password_incorrect: "Senha incorreta.",
  form_invalid_identifier: "Usuário inválido.",
  form_identifier_invalid: "Usuário inválido.",
  form_param_format_invalid: "Usuário inválido.",
  too_many_attempts:
    "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
};

const INVALID_IDENTIFIER_PATTERN = /identifier is invalid/i;

function getFirstClerkError(error: unknown): ClerkErrorLike | undefined {
  if (typeof error !== "object" || error === null || !("errors" in error)) {
    return undefined;
  }
  const errors = (error as { errors: unknown }).errors;
  if (!Array.isArray(errors) || errors.length === 0) {
    return undefined;
  }
  return errors[0] as ClerkErrorLike;
}

/** Maps Clerk sign-in errors to Portuguese messages. */
export function getClerkLoginErrorMessage(
  error: unknown,
  fallback = "Erro ao fazer login."
): string {
  const clerkError = getFirstClerkError(error);
  if (!clerkError) {
    return fallback;
  }

  const mapped = LOGIN_ERROR_MESSAGES[clerkError.code ?? ""];
  if (mapped) {
    return mapped;
  }

  const text = clerkError.longMessage ?? clerkError.message ?? "";
  if (INVALID_IDENTIFIER_PATTERN.test(text)) {
    return "Usuário inválido.";
  }

  return text || fallback;
}
