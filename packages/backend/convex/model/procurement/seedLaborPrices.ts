import type { Doc, Id } from "../../_generated/dataModel";
import { normalizeText } from "../../lib/compras/procurement";

/** One entry of the RLP Takeoff bundled catalog (`catalog.seed.json`). */
export type SeedLaborEntry = { name: string; laborPrice: number };

export type SeedLaborMatch = {
  materialId: Id<"materials">;
  materialName: string;
  seedName: string;
  laborPriceCents: number;
};

export type SeedLaborPlan = {
  matches: SeedLaborMatch[];
  /** Seed names whose entries disagree on the labour price; never applied. */
  ambiguous: string[];
  /** Materials that matched a seed entry but already have a labour price. */
  alreadySet: number;
};

/**
 * Keys a material can be known by in the seed: the family name alone and the
 * family followed by its variant ("Damper Corta Fogo" + "dim. 600x600 mm").
 */
function materialKeys(
  material: Pick<Doc<"materials">, "name" | "variantLabel">
): string[] {
  const keys = [normalizeText(material.name)];
  const variant = material.variantLabel?.trim();
  if (variant) keys.unshift(normalizeText(`${material.name} ${variant}`));
  return keys.filter(Boolean);
}

/**
 * Which materials get a labour price from the bundled seed: the ones whose
 * normalized name (with or without the variant) equals a seed entry with
 * labour > 0. Materials that already have one are kept unless `overwrite`.
 */
export function planSeedLaborPrices(
  materials: ReadonlyArray<
    Pick<Doc<"materials">, "_id" | "name" | "variantLabel" | "laborPriceCents">
  >,
  entries: ReadonlyArray<SeedLaborEntry>,
  options: { overwrite?: boolean } = {}
): SeedLaborPlan {
  const bySeedKey = new Map<string, { name: string; cents: number }>();
  const ambiguousKeys = new Set<string>();
  for (const entry of entries) {
    if (!(entry.laborPrice > 0)) continue;
    const key = normalizeText(entry.name);
    if (!key) continue;
    const cents = Math.round(entry.laborPrice * 100);
    const previous = bySeedKey.get(key);
    if (previous && previous.cents !== cents) ambiguousKeys.add(key);
    if (!previous) bySeedKey.set(key, { name: entry.name, cents });
  }

  const matches: SeedLaborMatch[] = [];
  let alreadySet = 0;
  for (const material of materials) {
    const key = materialKeys(material).find(
      (candidate) => bySeedKey.has(candidate) && !ambiguousKeys.has(candidate)
    );
    if (!key) continue;
    if (material.laborPriceCents !== undefined && !options.overwrite) {
      alreadySet++;
      continue;
    }
    const seed = bySeedKey.get(key)!;
    if (material.laborPriceCents === seed.cents) continue;
    matches.push({
      materialId: material._id,
      materialName: material.variantLabel
        ? `${material.name} — ${material.variantLabel}`
        : material.name,
      seedName: seed.name,
      laborPriceCents: seed.cents,
    });
  }

  const ambiguous = [...ambiguousKeys].map((key) => bySeedKey.get(key)!.name);
  return { matches, ambiguous, alreadySet };
}
