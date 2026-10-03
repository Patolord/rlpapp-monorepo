/**
 * Última conta (id Clerk) que entrou neste aparelho. Permite a navegação do
 * PWA de campo continuar sem rede, quando o Clerk não pode ser consultado.
 * Só o id é guardado — nunca token. Sair da conta apaga o registro.
 */
const LAST_USER_ID_KEY = "rlp-last-user-id";

export function rememberLastUserId(userId: string | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (userId) localStorage.setItem(LAST_USER_ID_KEY, userId);
    else localStorage.removeItem(LAST_USER_ID_KEY);
  } catch {
    // Sem localStorage não há fallback offline.
  }
}

export function recallLastUserId(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(LAST_USER_ID_KEY);
  } catch {
    return null;
  }
}
