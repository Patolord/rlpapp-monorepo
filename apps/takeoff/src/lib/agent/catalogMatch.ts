/**
 * Looser catalog matching for the agent. The strict search (every word must match) finds
 * nothing when a drawing names a brand or model the company does not buy, and the agent then
 * created off-catalog lines next to an equivalent material ("Evaporadora Daikin FTH09" while the
 * catalog has "Ar Condicionado Hi-Wall — Midea 9.000 BTU/h"). Here each word that matches the
 * start of a word of the material counts, so the equivalents rank first by how much they share.
 */
import type { CatalogEntry } from "../catalog";
import { foldName } from "../text";

const STOP_WORDS = new Set([
  "a",
  "o",
  "e",
  "x",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "em",
  "com",
  "sem",
  "para",
  "por",
  "un",
  "pc",
]);

/** Names drawings use for what the catalog calls otherwise. */
const SYNONYMS: Record<string, string> = { vrv: "vrf" };

/** The words of a name or query: folded, "9.000" read as "9000", short and filler words out. */
export function catalogWords(text: string): string[] {
  return foldName(text)
    .replace(/(\d)[.,](?=\d{3}(?!\d))/g, "$1")
    .split(/[^a-z0-9/]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    .map((w) => SYNONYMS[w] ?? w);
}

export interface RankedEntry {
  entry: CatalogEntry;
  /** Words of the query found in the material's name or group. */
  matched: number;
  /** Words in the query. */
  of: number;
}

/**
 * Catalog entries sharing at least one word with the query, the most shared first (then the
 * shorter name, the more generic material). Empty when the query has no usable word.
 */
export function rankCatalog(
  entries: readonly CatalogEntry[],
  query: string,
  limit: number,
): RankedEntry[] {
  const words = [...new Set(catalogWords(query))];
  if (words.length === 0) return [];
  const out: RankedEntry[] = [];
  for (const entry of entries) {
    const hay = ` ${catalogWords(`${entry.name} ${entry.group}`).join(" ")}`;
    const matched = words.filter((w) => hay.includes(` ${w}`)).length;
    if (matched > 0) out.push({ entry, matched, of: words.length });
  }
  out.sort((a, b) => b.matched - a.matched || a.entry.name.length - b.entry.name.length);
  return out.slice(0, limit);
}
