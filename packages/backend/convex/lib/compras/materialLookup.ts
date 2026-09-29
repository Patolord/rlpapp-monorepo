import { normalizeText } from "./procurement";

export const MAX_LOOKUP_QUERY_LENGTH = 200;

// Normalized (lowercase, no accents). Longer phrases first so "qual e" wins over "qual".
const FILLER_PHRASES = [
  "descricao completa",
  "nome completo",
  "por favor",
  "me diga",
  "me passa",
  "me da",
  "me de",
  "qual e",
  "qual o",
  "qual a",
  "qual",
  "descricao",
  "codigo",
  "nome",
  "material",
  "daquela",
  "daquele",
  "aquela",
  "aquele",
  "dessa",
  "desse",
];

const LEADING_CONNECTORS = new Set([
  "de", "da", "do", "das", "dos", "o", "a", "os", "as", "e",
]);

const STOPWORDS = new Set([
  ...LEADING_CONNECTORS,
  "com", "para", "em", "sem", "no", "na",
]);

/** "Me dá o nome completo do Isolamento de Duto?" → "isolamento de duto". */
export function normalizeLookupQuery(raw: string): string {
  const normalized = normalizeText(raw);
  let stripped = ` ${normalized} `;
  for (const phrase of FILLER_PHRASES) {
    while (stripped.includes(` ${phrase} `)) {
      stripped = stripped.replace(` ${phrase} `, " ");
    }
  }
  const words = stripped.trim().split(" ").filter(Boolean);
  while (words.length > 0 && LEADING_CONNECTORS.has(words[0]!)) words.shift();
  return words.join(" ") || normalized;
}

/** Extracts an SKU like "MAT-0234" / "mat 234" and returns the forms to try. */
export function extractSkuCandidates(raw: string): string[] {
  const match = /\bmat[-\s]?(\d+)\b/i.exec(raw);
  if (!match) return [];
  const digits = match[1]!;
  return [...new Set([`MAT-${digits}`, `MAT-${digits.padStart(6, "0")}`])];
}

function significantTokens(query: string): string[] {
  const tokens = query.split(" ").filter(Boolean);
  const significant = tokens.filter((token) => !STOPWORDS.has(token));
  return significant.length > 0 ? significant : tokens;
}

function tokenMatches(token: string, haystack: string[]): boolean {
  const singular = token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token;
  return haystack.some(
    (word) =>
      word === token ||
      word === singular ||
      (token.length >= 3 && word.startsWith(token))
  );
}

/** Fraction (0..1) of the query's significant tokens found in the candidate text. */
export function tokenCoverage(query: string, candidateText: string): number {
  const tokens = significantTokens(query);
  if (tokens.length === 0) return 0;
  const haystack = normalizeText(candidateText).split(" ");
  const hits = tokens.filter((token) => tokenMatches(token, haystack)).length;
  return hits / tokens.length;
}

export function describeMaterial(material: {
  name: string;
  variantLabel?: string;
  spec?: string;
}): string {
  return [material.name, material.variantLabel?.trim(), material.spec?.trim()]
    .filter(Boolean)
    .join(" — ");
}
