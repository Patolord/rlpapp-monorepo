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

const SIGN_UP_ERROR_MESSAGES: Record<string, string> = {
  form_identifier_exists: "Este login já está em uso. Escolha outro.",
  form_username_invalid_length: "O login precisa ter entre 4 e 64 caracteres.",
  form_username_invalid_character:
    "O login só pode ter letras minúsculas, números, ponto, hífen e sublinhado.",
  form_password_length_too_short: "A senha precisa ter pelo menos 8 caracteres.",
  form_password_pwned:
    "Esta senha apareceu em vazamentos de dados. Escolha outra, mais difícil de adivinhar.",
  form_password_not_strong_enough: "A senha é fraca demais. Use mais caracteres ou combine letras, números e símbolos.",
  form_password_size_in_bytes_exceeded: "A senha é longa demais.",
  ticket_invalid: "Este convite não é válido. Peça um novo convite ao administrador.",
  ticket_expired: "Este convite expirou. Peça um novo convite ao administrador.",
  invitation_already_accepted: "Este convite já foi usado. Entre com seu login e senha.",
  too_many_attempts: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
};

/** Maps Clerk sign-up (invitation) errors to Portuguese messages. */
export function getClerkSignUpErrorMessage(
  error: unknown,
  fallback = "Erro ao criar a conta."
): string {
  const clerkError = getFirstClerkError(error);
  if (!clerkError) {
    return fallback;
  }
  const mapped = SIGN_UP_ERROR_MESSAGES[clerkError.code ?? ""];
  if (mapped) {
    return mapped;
  }
  return clerkError.longMessage ?? clerkError.message ?? fallback;
}
