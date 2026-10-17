/**
 * Extrai o token de uma leitura de QR. Aceita a URL impressa na etiqueta
 * (.../q/TOKEN) ou o token puro.
 */
export function parseQrToken(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/\/q\/([^/?#]+)/i);
  if (match?.[1]) return decodeURIComponent(match[1]);
  return trimmed;
}

/**
 * Normaliza um código digitado à mão: tokens são gerados em caixa alta e sem
 * espaços, então corrigimos os erros mais comuns de digitação.
 */
export function normalizeTypedToken(raw: string): string {
  return parseQrToken(raw).replace(/\s+/g, "").toUpperCase();
}
