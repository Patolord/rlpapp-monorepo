import type { Item } from "./types";
import { baseMaterialLabel } from "./weights";

/**
 * What a budget line tells the company catalog about its material, beyond the name: the
 * product within the family (variant), its dimensions and a free-text spec. Purchasing matches
 * a proposal to an existing material by family + unit + variant + dimensions, so a duct grille
 * "Grelha de insuflamento 400x200" and a copper tube `Tubo de cobre 1/2"` must arrive split into
 * family and size, or every size would become a family of its own (and nothing would match).
 */
export interface ProposalMaterial {
  name: string;
  variantLabel?: string;
  spec?: string;
  dimensions?: {
    widthMm?: number;
    heightMm?: number;
    diameterMm?: number;
  };
}

const INCH_MM = 25.4;
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * A tube size in inches as the budgets write it: `1/4`, `1`, `1.1/8` (1 1/8), `1 1/8`, `1-1/8`.
 * Undefined when the text is not a size.
 */
export function inchesToMm(size: string): number | undefined {
  const m = /^(?:(\d+)[.\s-])?(\d+)\/(\d+)$/.exec(size.trim());
  if (m) {
    const whole = m[1] ? Number(m[1]) : 0;
    const den = Number(m[3]);
    if (den === 0) return undefined;
    return round2((whole + Number(m[2]) / den) * INCH_MM);
  }
  const plain = /^(\d+)$/.exec(size.trim());
  return plain ? round2(Number(plain[1]) * INCH_MM) : undefined;
}

/** Leftovers around a dimension cut out of a name ("Grelha - 400x200 mm" → "Grelha"). */
const tidy = (name: string) =>
  name
    .replace(/\(\s*\)/g, "")
    .replace(/\s+(?:dim\.?|dimens(?:ão|ões|oes)?)\s*$/i, "")
    .replace(/[\s,;:–—-]+$/u, "")
    .replace(/^[\s,;:–—-]+/u, "")
    .replace(/\s{2,}/g, " ")
    .trim();

/** Family and size of a material named after its size (tubes, grilles, dampers, round ducts). */
export function splitMaterialName(raw: string): ProposalMaterial {
  const name = raw.trim();

  // catalog naming: "Exaustor — Sicflux SONORA 18 — motor 220V" (family — variant — spec)
  const parts = name.split(" — ").map((p) => p.trim());
  if (parts.length >= 2 && parts[0] && parts[1]) {
    const spec = parts.slice(2).join(" — ");
    return { name: parts[0], variantLabel: parts[1], ...(spec ? { spec } : {}) };
  }

  // a size in inches at the end: `Tubo de cobre 1.1/8"`
  // lazy family: a mixed size ("1 1/8") is the size, not "…cobre 1" + "1/8"
  const inch = /^(.*?\S)\s+((?:\d+[.\s-])?\d+\/\d+|\d+)\s*(?:"|''|”|pol\.?)$/iu.exec(name);
  if (inch) {
    const mm = inchesToMm(inch[2]);
    // never a 0 dimension: the server refuses it (0", 0/8")
    if (mm !== undefined && mm > 0) {
      return {
        name: tidy(inch[1]),
        variantLabel: `${inch[2].replace(/\s+|-/g, ".")}"`,
        dimensions: { diameterMm: mm },
      };
    }
  }

  // width × height in mm: "Grelha de insuflamento 400x200", "Damper ... dim. 400 x 300 mm"
  const rect =
    /(\d{2,4}(?:[.,]\d+)?)\s*[x×X*]\s*(\d{2,4}(?:[.,]\d+)?)\s*(?:mm)?(?=$|[\s)\],;])/u.exec(name);
  if (rect) {
    const width = Number(rect[1].replace(",", "."));
    const height = Number(rect[2].replace(",", "."));
    const family = tidy(name.slice(0, rect.index) + name.slice(rect.index + rect[0].length));
    if (family && width > 0 && height > 0) {
      return { name: family, dimensions: { widthMm: width, heightMm: height } };
    }
  }

  // a diameter in mm: "Duto circular Ø 200", "Colarinho ø200mm"
  const round =
    /(?:Ø|ø|⌀|diâm(?:etro)?\.?)\s*(\d{2,4}(?:[.,]\d+)?)\s*(?:mm)?(?=$|[\s)\],;])/iu.exec(name);
  if (round) {
    const diameter = Number(round[1].replace(",", "."));
    const family = tidy(name.slice(0, round.index) + name.slice(round.index + round[0].length));
    if (family && diameter > 0) return { name: family, dimensions: { diameterMm: diameter } };
  }

  return { name };
}

/** Name, variant, dimensions and spec of an unlinked budget line, for a material proposal. */
export function proposalMaterial(item: Item, unit: string): ProposalMaterial {
  const material = splitMaterialName(item.name);
  const notes: string[] = [];
  if (material.spec) notes.push(material.spec);
  if (item.baseMaterial && item.kgPerUnit) {
    const kg = item.kgPerUnit.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
    notes.push(`${kg} kg/${unit} (${baseMaterialLabel(item.baseMaterial)})`);
  }
  if (item.vrf) notes.push(`VRF ${item.vrf.brand} ${item.vrf.hp} HP`);
  const spec = notes.join("; ");
  return { ...material, spec: spec || undefined };
}
