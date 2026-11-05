/**
 * Kit components and the purchasing catalog: the order a kit lists its materials in (copper,
 * insulation, cable, each by ascending size) and the match of a component to a catalog material
 * by its code, name or family and size. Shared by the backend ("Vincular ao catálogo" over the
 * company kits) and the dashboard's kit form.
 */
import { type KitComponent, normalizeKitSku } from "./kits";

/** Accent- and case-insensitive text with single spaces. */
const fold = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** The material families a line-set kit is made of; everything else is "outro". */
export type KitFamily = "cobre" | "isolamento" | "cabo" | "outro";

const FAMILY_RANK: Record<KitFamily, number> = { cobre: 0, isolamento: 1, cabo: 2, outro: 3 };

// fittings are copper too, but not the tube
const COPPER_FITTING = /\b(joelho|curva|luva|uniao|reducao|conexao|conexoes|te|tee|cotovelo)\b/;

/** Which family a material name belongs to ("Tubulação de Cobre 1/4"" → cobre). */
export function kitFamily(name: string): KitFamily {
  const f = fold(name);
  if (/\b(isolamento|isolante|polipex|elastomer|elastomerico|armaflex|esponjoso)/.test(f)) {
    return "isolamento";
  }
  if (/^cabo\b|\bcabo pp/.test(f)) return "cabo";
  if (/\bcobre\b/.test(f) && !COPPER_FITTING.test(f)) return "cobre";
  return "outro";
}

/** Inches of the first tube size in a name: `1/4"`, `1.1/8"`, `1 1/8 pol`, `1"`; undefined if none. */
export function inchSize(name: string): number | undefined {
  const frac = /(?:(\d+)[.\s-])?(\d+)\/(\d+)/.exec(name);
  if (frac) {
    const den = Number(frac[3]);
    if (den > 0) return (frac[1] ? Number(frac[1]) : 0) + Number(frac[2]) / den;
  }
  const whole = /(?:^|\s)(\d+)\s*(?:"|''|”|pol\b)/i.exec(name);
  return whole ? Number(whole[1]) : undefined;
}

/** Conductors and section (mm²) of a cable: "Cabo PP 5 x 1,5 mm²" → { conductors: 5, section: 1.5 }. */
export function cableSize(name: string): { conductors: number; section: number } | undefined {
  const m = /(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)/i.exec(name);
  if (!m) return undefined;
  return { conductors: Number(m[1]), section: Number((m[2] ?? "").replace(",", ".")) };
}

/** Wall thickness (mm) of an insulation: "Espessura 09 mm", "x 9mm"; undefined if none. */
export function insulationThickness(name: string): number | undefined {
  const m = /(\d+(?:[.,]\d+)?)\s*mm\b/i.exec(name);
  return m?.[1] ? Number(m[1].replace(",", ".")) : undefined;
}

/** Comparable size within a family ("bitola"): inches for tubes and insulation, mm² for cables. */
function sizeKey(family: KitFamily, name: string): number | undefined {
  if (family === "cobre" || family === "isolamento") return inchSize(name);
  if (family === "cabo") {
    const c = cableSize(name);
    // by section, then by number of conductors
    return c ? c.section * 1000 + c.conductors : undefined;
  }
  return undefined;
}

/**
 * The kit's components in budget order: copper tubes, then insulation, then cables, each by
 * ascending size; the other materials after them in the order they were. Stable, and returns the
 * same array when the order does not change.
 */
export function sortKitComponents<C extends Pick<KitComponent, "name">>(components: C[]): C[] {
  const keyed = components.map((c, i) => {
    const family = kitFamily(c.name);
    return {
      c,
      i,
      rank: FAMILY_RANK[family],
      size: sizeKey(family, c.name) ?? Number.POSITIVE_INFINITY,
    };
  });
  keyed.sort((a, b) =>
    a.rank !== b.rank
      ? a.rank - b.rank
      : a.rank < FAMILY_RANK.outro && a.size !== b.size
        ? a.size - b.size
        : a.i - b.i,
  );
  return keyed.every((k, j) => k.i === j) ? components : keyed.map((k) => k.c);
}

/** What the match needs of a catalog material (the takeoff catalog item's shape). */
export interface KitCatalogMaterial {
  sku: string | null;
  /** Family name ("Tubulação de Cobre"). */
  name: string;
  variant: string | null;
  /** "family — variant — spec". */
  description: string;
  status: "draft" | "active" | "archived";
}

/** How the desktop app names a catalog material: "family — variant", or the family alone. */
export const catalogProductName = (m: Pick<KitCatalogMaterial, "name" | "variant">): string =>
  m.variant?.trim() ? `${m.name} — ${m.variant.trim()}` : m.name;

export type KitCatalogMatch<M extends KitCatalogMaterial> =
  /** One material: link the component to it. `by` says how it was found. */
  | { kind: "match"; material: M; by: "sku" | "name" | "size" }
  /** Several materials of the same family and size: someone has to pick. */
  | { kind: "ambiguous"; candidates: M[] }
  | { kind: "none" };

const STOP = new Set(["de", "da", "do", "das", "dos", "e", "com", "para", "em", "x", "mm", "pol"]);

/** Words of a name (no numbers or connectors), to break a tie between same-size materials. */
const words = (s: string): Set<string> =>
  new Set(
    fold(s)
      .replace(/[^a-z0-9 ]/g, " ")
      .split(" ")
      .filter((w) => w.length > 1 && !/\d/.test(w) && !STOP.has(w)),
  );

/** The candidates that share the most words with the name. */
function closest<M extends KitCatalogMaterial>(name: string, candidates: M[]): M[] {
  const want = words(name);
  let best: M[] = [];
  let top = -1;
  for (const m of candidates) {
    const have = words(`${m.name} ${m.variant ?? ""} ${m.description}`);
    let score = 0;
    for (const w of want) if (have.has(w)) score++;
    if (score > top) {
      top = score;
      best = [m];
    } else if (score === top) best.push(m);
  }
  return best;
}

/**
 * The catalog material a kit component stands for: the one with its code; else the one named
 * exactly like it; else, for copper, insulation and cable, the only one of the same family and
 * size (and thickness, for insulation), preferring active materials over drafts and then the
 * one sharing the most words with the name. Archived materials and materials without a code
 * are never picked.
 */
export function matchKitComponent<M extends KitCatalogMaterial>(
  component: Pick<KitComponent, "name" | "sku">,
  catalog: readonly M[],
): KitCatalogMatch<M> {
  const pool = catalog.filter((m) => m.status !== "archived" && normalizeKitSku(m.sku));
  const sku = normalizeKitSku(component.sku);
  if (sku) {
    const bySku = pool.find((m) => normalizeKitSku(m.sku) === sku);
    if (bySku) return { kind: "match", material: bySku, by: "sku" };
  }

  const name = fold(component.name);
  const named = pool.filter(
    (m) =>
      fold(catalogProductName(m)) === name ||
      fold(m.description) === name ||
      fold(`${m.name} ${m.variant ?? ""}`) === name,
  );
  if (named.length === 1 && named[0]) return { kind: "match", material: named[0], by: "name" };

  const family = kitFamily(component.name);
  const size = sizeKey(family, component.name);
  if (family === "outro" || size === undefined) {
    return named.length > 1 ? { kind: "ambiguous", candidates: named } : { kind: "none" };
  }
  let same = pool.filter((m) => {
    const text = `${catalogProductName(m)} ${m.description}`;
    return kitFamily(m.name) === family && sizeKey(family, text) === size;
  });
  if (family === "isolamento" && same.length > 1) {
    const mm = insulationThickness(component.name);
    if (mm !== undefined) {
      const thick = same.filter(
        (m) => insulationThickness(`${catalogProductName(m)} ${m.description}`) === mm,
      );
      if (thick.length > 0) same = thick;
    }
  }
  if (same.length > 1) {
    const active = same.filter((m) => m.status === "active");
    if (active.length > 0) same = active;
  }
  if (same.length > 1) same = closest(component.name, same);
  if (same.length === 1 && same[0]) return { kind: "match", material: same[0], by: "size" };
  return same.length > 1 ? { kind: "ambiguous", candidates: same } : { kind: "none" };
}

/** A component after linking: the material's code and its name as the app shows it. */
export function linkKitComponent<C extends KitComponent>(
  component: C,
  material: KitCatalogMaterial,
): C {
  const sku = normalizeKitSku(material.sku);
  return { ...component, name: catalogProductName(material), ...(sku ? { sku } : {}) };
}
