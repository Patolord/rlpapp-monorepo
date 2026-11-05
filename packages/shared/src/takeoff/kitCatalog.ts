/**
 * Kit components and the purchasing catalog: the order a kit lists its materials in (copper,
 * insulation, cable, each by ascending size) and the name the app gives a catalog material.
 * Used by the dashboard's kit form and by the factory presets' tests.
 */
import type { KitComponent } from "./kits";

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

/** How the desktop app names a catalog material: "family — variant", or the family alone. */
export const catalogProductName = (m: { name: string; variant?: string | null }): string =>
  m.variant?.trim() ? `${m.name} — ${m.variant.trim()}` : m.name;
