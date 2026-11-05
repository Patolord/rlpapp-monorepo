/** Live input: lowercase, remove whitespace, keep Clerk-safe username chars. */
export function sanitizeUsernameInput(value: string): string {
  return value.toLowerCase().replace(/\s/g, "").replace(/[^a-z0-9._-]/g, "");
}

/** Submit: trim then sanitize. */
export function normalizeUsername(value: string): string {
  return sanitizeUsernameInput(value.trim());
}

/** First letter uppercase, rest untouched. */
export function capitalizeFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Display: first letter uppercase (the stored/login value stays lowercase for Clerk). */
export function formatUsername(value: string): string {
  return capitalizeFirst(value);
}

/**
 * Display name: users created from a username (sem nome no Clerk) ficaram com o
 * nome todo em minúsculas; na tela a inicial vai em maiúscula.
 */
export function formatDisplayName(value: string): string {
  return capitalizeFirst(value);
}

/**
 * Sugestão de login a partir do nome: "João Silva" → "joao.silva" (sem acentos,
 * só caracteres aceitos pelo Clerk). Partes vazias são ignoradas.
 */
export function suggestUsername(firstName: string, lastName: string): string {
  return [firstName, lastName]
    .map((part) =>
      sanitizeUsernameInput(part.trim().normalize("NFD").replace(/[̀-ͯ]/g, ""))
    )
    .filter(Boolean)
    .join(".");
}
