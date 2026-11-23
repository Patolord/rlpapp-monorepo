/**
 * Cadastro em campo sem sinal: confere o item digitado ou lido contra a cópia
 * do catálogo guardada no celular. Segue a mesma ordem do servidor
 * (`convex/model/inventory/captureMatching.ts`): código de barras, SKU, mesmo
 * nome + variação + unidade; o resto são "parecidos". Na sincronização o
 * servidor decide de novo, com o catálogo atualizado.
 */

export type CaptureCatalogItem = {
  _id: string;
  name: string;
  variantLabel: string | null;
  sku: string | null;
  barcode: string | null;
  unit: string | null;
  category: string | null;
};

export type CaptureMatchReason = "barcode" | "sku" | "identity";

export type CaptureMatchResult<T extends CaptureCatalogItem> = {
  exact: { item: T; reason: CaptureMatchReason } | null;
  similar: T[];
};

/** Texto para comparar nomes (igual ao `normalizeText` do backend): sem acento, minúsculas, só letras e números. */
export function normalizeCaptureText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Mesmas regras do backend (`normalizeBarcode` e `normalizeSku` em catalog.ts).
function normalizeBarcode(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normalizeSku(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function normalizeUnit(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function haystack(item: CaptureCatalogItem): string {
  return normalizeCaptureText(
    [item.name, item.variantLabel, item.sku, item.barcode, item.category].filter(Boolean).join(" ")
  );
}

/** Pontuação simples: quantas palavras da busca aparecem (prefixo) no item. */
function score(words: string[], text: string): number {
  if (words.length === 0) return 0;
  const tokens = text.split(" ");
  let hits = 0;
  for (const word of words) {
    if (tokens.some((token) => token.startsWith(word))) hits += 1;
  }
  return hits / words.length;
}

export function matchCapturedItem<T extends CaptureCatalogItem>(
  catalog: readonly T[],
  query: { code?: string | null; name?: string | null; variantLabel?: string | null; unit?: string | null },
  limit = 6
): CaptureMatchResult<T> {
  const barcode = normalizeBarcode(query.code);
  if (barcode) {
    const byBarcode = catalog.find((item) => item.barcode && normalizeBarcode(item.barcode) === barcode);
    if (byBarcode) return { exact: { item: byBarcode, reason: "barcode" }, similar: [] };
    const sku = normalizeSku(query.code);
    const bySku = catalog.find((item) => item.sku && normalizeSku(item.sku) === sku);
    if (bySku) return { exact: { item: bySku, reason: "sku" }, similar: [] };
  }

  const name = normalizeCaptureText(query.name);
  if (!name) return { exact: null, similar: [] };
  const variant = normalizeCaptureText(query.variantLabel);
  const unit = normalizeUnit(query.unit);

  const exactItem = catalog.find(
    (item) =>
      normalizeCaptureText(item.name) === name &&
      normalizeCaptureText(item.variantLabel) === variant &&
      (!unit || normalizeUnit(item.unit) === unit)
  );

  const words = normalizeCaptureText([query.name, query.variantLabel].filter(Boolean).join(" "))
    .split(" ")
    .filter(Boolean);
  const similar = catalog
    .filter((item) => item !== exactItem)
    .map((item) => ({ item, score: score(words, haystack(item)), sameName: normalizeCaptureText(item.name) === name }))
    .filter((entry) => entry.sameName || entry.score >= 0.5)
    .sort((a, b) => Number(b.sameName) - Number(a.sameName) || b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item);

  return {
    exact: exactItem ? { item: exactItem, reason: "identity" } : null,
    similar,
  };
}
