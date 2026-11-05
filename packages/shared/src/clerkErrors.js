const LOGIN_ERROR_MESSAGES = {
    form_identifier_not_found: "Usuário não encontrado.",
    form_password_incorrect: "Senha incorreta.",
    form_invalid_identifier: "Usuário inválido.",
    form_identifier_invalid: "Usuário inválido.",
    form_param_format_invalid: "Usuário inválido.",
    too_many_attempts: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    session_exists: "Já existe outra conta conectada neste dispositivo. Recarregue a página ou reabra o app.",
};
const INVALID_IDENTIFIER_PATTERN = /identifier is invalid/i;
function getFirstClerkError(error) {
    if (typeof error !== "object" || error === null || !("errors" in error)) {
        return undefined;
    }
    const errors = error.errors;
    if (!Array.isArray(errors) || errors.length === 0) {
        return undefined;
    }
    return errors[0];
}
/**
 * Clerk recusa um segundo login quando este navegador/app já tem sessão, mesmo
 * que a tela ainda não saiba disso. Se a sessão é do usuário digitado, devolve
 * o id para retomá-la. Nunca retoma a sessão de outra pessoa (computador
 * compartilhado): nesse caso, ou se nada for encontrado, devolve null.
 */
export async function findExistingClerkSessionId(error, client, username) {
    if (getFirstClerkError(error)?.code !== "session_exists" || !client) {
        return null;
    }
    try {
        const { sessions } = await client.reload();
        return (sessions.find((session) => session.user?.username === username)?.id ??
            null);
    }
    catch {
        return null;
    }
}
/** Maps Clerk sign-in errors to Portuguese messages. */
export function getClerkLoginErrorMessage(error, fallback = "Erro ao fazer login.") {
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
