/**
 * Destino interno para depois do login (`?redirect=`), ou null. Resolve o valor
 * como o navegador faria, contra uma origem fixa, e só aceita o que continua na
 * mesma origem: "//host", "/\host" e variantes com tab/quebra de linha
 * ("/\t/host", que o parser de URL reduz a "//host") são outro site.
 */
export function internalRedirect(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  const base = "https://internal.invalid";
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return null;
  }
  if (url.origin !== base || url.pathname.startsWith("//")) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
