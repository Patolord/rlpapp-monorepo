import type { Doc, Id } from "../../_generated/dataModel";
import { normalizeText } from "../../lib/compras/procurement";
import { takeoffUnit } from "./takeoffCatalog";

/** One entry of the RLP Takeoff bundled catalog (`catalog.seed.json`). */
export type SeedLaborEntry = { name: string; unit: string; laborPrice: number };

export type SeedLaborMatch = {
  materialId: Id<"materials">;
  materialName: string;
  seedName: string;
  laborPriceCents: number;
};

/** A name match left out because the seed prices labour in another unit. */
export type SeedLaborUnitMismatch = {
  materialId: Id<"materials">;
  materialName: string;
  materialUnit: string;
  seedName: string;
  seedUnits: string[];
};

export type SeedLaborPlan = {
  matches: SeedLaborMatch[];
  /** Seed names (with unit) whose entries disagree on the labour price; never applied. */
  ambiguous: string[];
  /** Same name as a seed entry, but the units differ: never applied. */
  skippedUnitMismatch: SeedLaborUnitMismatch[];
  /** Materials that matched a seed entry but already have a labour price. */
  alreadySet: number;
};

// Synonyms `takeoffUnit` keeps apart: sets, and the folded square metre.
const LABOR_UNIT_ALIASES: Record<string, string> = {
  conjunto: "cj",
  conjuntos: "cj",
  cjs: "cj",
};

/**
 * Comparison key of a unit for labour prices: the unit the takeoff catalog
 * exports (un/peça/pc → pç, metro → m, …), folded and stripped of symbols, so
 * "pç" ~ "un", "m²" ~ "m2", "L" ~ "l" and "conjunto" ~ "cj". A material
 * without unit is exported as "pç", so it compares as one.
 */
export function laborUnitKey(unit: string | undefined): string {
  const folded = normalizeText(takeoffUnit(unit)).replace(/[^a-z0-9]/g, "");
  return LABOR_UNIT_ALIASES[folded] ?? folded;
}

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

type SeedPrice = { name: string; unit: string; cents: number };

/**
 * Which materials get a labour price from the bundled seed: the ones whose
 * normalized name (with or without the variant) equals a seed entry with
 * labour > 0 priced in the same unit (see laborUnitKey). Name matches in
 * another unit are reported, never applied. Materials that already have a
 * labour price are kept unless `overwrite`.
 */
export function planSeedLaborPrices(
  materials: ReadonlyArray<
    Pick<
      Doc<"materials">,
      "_id" | "name" | "variantLabel" | "unit" | "laborPriceCents"
    >
  >,
  entries: ReadonlyArray<SeedLaborEntry>,
  options: { overwrite?: boolean } = {}
): SeedLaborPlan {
  // name key → unit key → seed price
  const byName = new Map<string, Map<string, SeedPrice>>();
  const ambiguousKeys = new Set<string>();
  for (const entry of entries) {
    if (!(entry.laborPrice > 0)) continue;
    const key = normalizeText(entry.name);
    if (!key) continue;
    const unitKey = laborUnitKey(entry.unit);
    const cents = Math.round(entry.laborPrice * 100);
    let byUnit = byName.get(key);
    if (!byUnit) byName.set(key, (byUnit = new Map()));
    const previous = byUnit.get(unitKey);
    if (previous && previous.cents !== cents) {
      ambiguousKeys.add(`${key}|${unitKey}`);
    }
    if (!previous) byUnit.set(unitKey, { name: entry.name, unit: entry.unit, cents });
  }

  const matches: SeedLaborMatch[] = [];
  const skippedUnitMismatch: SeedLaborUnitMismatch[] = [];
  let alreadySet = 0;
  for (const material of materials) {
    const materialName = material.variantLabel
      ? `${material.name} — ${material.variantLabel}`
      : material.name;
    const unitKey = laborUnitKey(material.unit);
    const named = materialKeys(material)
      .map((key) => ({ key, byUnit: byName.get(key) }))
      .filter((candidate) => candidate.byUnit !== undefined);
    if (named.length === 0) continue;

    const compatible = named.find(
      ({ key, byUnit }) =>
        byUnit!.has(unitKey) && !ambiguousKeys.has(`${key}|${unitKey}`)
    );
    if (!compatible) {
      const other = named.find(({ byUnit }) => !byUnit!.has(unitKey));
      if (other) {
        const seeds = [...other.byUnit!.values()];
        skippedUnitMismatch.push({
          materialId: material._id,
          materialName,
          materialUnit: material.unit ?? "",
          seedName: seeds[0]!.name,
          seedUnits: seeds.map((seed) => seed.unit),
        });
      }
      continue;
    }
    if (material.laborPriceCents !== undefined && !options.overwrite) {
      alreadySet++;
      continue;
    }
    const seed = compatible.byUnit!.get(unitKey)!;
    if (material.laborPriceCents === seed.cents) continue;
    matches.push({
      materialId: material._id,
      materialName,
      seedName: seed.name,
      laborPriceCents: seed.cents,
    });
  }

  const ambiguous = [...ambiguousKeys].map((composite) => {
    const [key, unitKey] = composite.split("|") as [string, string];
    const seed = byName.get(key)!.get(unitKey)!;
    return `${seed.name} (${seed.unit})`;
  });
  return { matches, ambiguous, skippedUnitMismatch, alreadySet };
}
