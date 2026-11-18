import type { EstimateLine } from "@rlpapp/shared/takeoff/estimate";
import {
  type PricingCatalog,
  type PricingMaterial,
  priceEstimate,
} from "@rlpapp/shared/takeoff/estimatePricing";
import {
  BATHROOM_EXHAUST_TEMPLATE,
  formatCapacity,
  lineSetForCapacity,
  SPLIT_TEMPLATE,
  type TableRow,
  templateValues,
} from "@rlpapp/shared/takeoff/estimateTemplates";
import { type Kit, kitMode, SEED_KITS } from "@rlpapp/shared/takeoff/kits";
import { SEED_WEIGHTS } from "@rlpapp/shared/takeoff/weights";
import { ConvexError, type Infer, type ObjectType, v } from "convex/values";
import type { QueryCtx } from "../../_generated/server";
import { listTakeoffCatalog, type TakeoffCatalogItem } from "./takeoffCatalog";
import { listPublishedTakeoffKits, type TakeoffKit } from "./takeoffKits";
import { listPublishedTakeoffSettings } from "./takeoffSettings";

/**
 * Quick estimates of the RLP Takeoff service calculators (split installation, bathroom
 * exhaust) for agents: the same line math as the desktop app's estimate dialog
 * (`@rlpapp/shared/takeoff/estimateTemplates`), priced from the company catalog, kits and
 * prices per kg the app uses. Nothing is saved.
 */

const MAX_MACHINE_ROWS = 50;
const MAX_UNITS = 10_000;
const MAX_METERS = 500;

const priceSource = v.union(
  v.literal("digitado"),
  v.literal("catalogo"),
  v.literal("peso"),
  v.literal("sem_preco")
);

export const estimateLineValidator = v.object({
  name: v.string(),
  sku: v.union(v.string(), v.null()),
  group: v.string(),
  system: v.union(v.string(), v.null()),
  unit: v.string(),
  quantity: v.number(),
  materialUnitPrice: v.number(),
  laborUnitPrice: v.number(),
  materialTotal: v.number(),
  laborTotal: v.number(),
  total: v.number(),
  priceSource,
  materialId: v.union(v.string(), v.null()),
});

export const estimateTotalsValidator = v.object({
  material: v.number(),
  labor: v.number(),
  subtotal: v.number(),
  bdiPercent: v.number(),
  bdi: v.number(),
  total: v.number(),
});

export const estimateResultValidator = v.object({
  /** How each input was read (the line set picked for a capacity, defaults applied). */
  assumptions: v.array(v.string()),
  lines: v.array(estimateLineValidator),
  totals: estimateTotalsValidator,
  /** What to check or ask before trusting the total (missing prices, no labour). */
  warnings: v.array(v.string()),
});

export type EstimateResult = Infer<typeof estimateResultValidator>;

// the evaporator types of the split calculator (SPLIT_MACHINE_TYPES)
const splitMachineType = v.union(
  v.literal("Hi Wall"),
  v.literal("Cassete"),
  v.literal("Piso-teto"),
  v.literal("Duto")
);

export const splitEstimateArgs = {
  machines: v.array(
    v.object({
      type: v.optional(splitMachineType),
      capacityBtu: v.number(),
      lineType: v.optional(v.union(v.literal("Inverter"), v.literal("Convencional"))),
      quantity: v.number(),
      lineMeters: v.optional(v.number()),
      unitPriceBrl: v.optional(v.number()),
    })
  ),
  includeMachines: v.optional(v.boolean()),
  laborPerEvaporatorBrl: v.optional(v.number()),
  mobilizationBrl: v.optional(v.number()),
  bdiPercent: v.optional(v.number()),
  now: v.number(),
};

export const bathroomExhaustEstimateArgs = {
  bathrooms: v.number(),
  diameterMm: v.optional(v.union(v.literal(100), v.literal(125), v.literal(150))),
  ductMeters: v.optional(v.number()),
  fanPriceBrl: v.optional(v.number()),
  grille: v.optional(v.boolean()),
  cap: v.optional(v.boolean()),
  clampsPerBathroom: v.optional(v.number()),
  laborPerBathroomBrl: v.optional(v.number()),
  bdiPercent: v.optional(v.number()),
  now: v.number(),
};

const fail = (message: string) => new ConvexError({ code: "invalid_input", message });

function checkNumber(value: number | undefined, label: string, max: number): void {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw fail(`${label} deve ser um número entre 0 e ${max}`);
  }
}

/** "Exaustor — Sicflux SONORA 18": the name the desktop app gives a company material. */
function productName(item: TakeoffCatalogItem): string {
  const name = item.name.trim();
  let label = item.variant?.trim();
  if (!label) {
    const sep = `${name} — `;
    const full = item.description.trim();
    const segment = full.startsWith(sep) ? (full.slice(sep.length).split(" — ")[0] ?? "").trim() : "";
    // a short segment is a variant; prose is a spec
    if (segment && segment.length <= 80) label = segment;
  }
  return label ? `${name} — ${label}` : name;
}

const toKit = (k: TakeoffKit): Kit => ({
  id: k.id,
  name: k.name,
  mode: k.mode,
  label: k.label ?? undefined,
  components: k.components.map((c) => ({
    name: c.name,
    sku: c.sku ?? undefined,
    group: c.group,
    system: c.system ?? undefined,
    kind: c.kind,
    factor: c.factor,
  })),
});

/** The catalog, kits and prices per kg the desktop app would price with, signed in. */
async function loadPricing(
  ctx: QueryCtx,
  now: number
): Promise<{ catalog: PricingCatalog; kits: Kit[] }> {
  const items = await listTakeoffCatalog(ctx, now);
  const materials: PricingMaterial[] = items
    .filter((i) => i.status !== "archived")
    .map((i) => ({
      id: i.id,
      sku: i.sku,
      name: productName(i),
      materialPrice: i.materialPrice,
      laborPrice: i.laborPrice,
    }));
  const kits = (await listPublishedTakeoffKits(ctx)).map(toKit);
  const settings = await listPublishedTakeoffSettings(ctx);
  return {
    catalog: {
      materials,
      weights: settings.weights?.rows ?? SEED_WEIGHTS,
      basePrices: settings.basePrices,
    },
    // without company kits the app uses the factory ones
    kits: kits.length > 0 ? kits : SEED_KITS,
  };
}

const brl = (v: number): string =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function priced(
  lines: EstimateLine[],
  catalog: PricingCatalog,
  bdiPercent: number | undefined,
  assumptions: string[],
  warnings: string[]
): EstimateResult {
  const result = priceEstimate(lines, catalog, bdiPercent ?? 0);
  const unpriced = result.lines.filter((l) => l.priceSource === "sem_preco");
  if (unpriced.length > 0) {
    warnings.push(
      `Sem preço no catálogo (entram como R$ 0,00): ${unpriced.map((l) => l.name).join("; ")}`
    );
  }
  if (bdiPercent === undefined) {
    warnings.push("Sem BDI: o total é o custo de material e mão de obra.");
  }
  return { assumptions, ...result, warnings };
}

/** Split installation: a line set per machine by capacity, the machines, labour per evaporator. */
export async function estimateSplit(
  ctx: QueryCtx,
  args: ObjectType<typeof splitEstimateArgs>
): Promise<EstimateResult> {
  if (args.machines.length === 0) throw fail("Informe ao menos uma máquina");
  if (args.machines.length > MAX_MACHINE_ROWS) {
    throw fail(`No máximo ${MAX_MACHINE_ROWS} linhas de máquinas`);
  }
  checkNumber(args.laborPerEvaporatorBrl, "laborPerEvaporatorBrl", 1_000_000);
  checkNumber(args.mobilizationBrl, "mobilizationBrl", 10_000_000);
  checkNumber(args.bdiPercent, "bdiPercent", 1000);

  const { catalog, kits } = await loadPricing(ctx, args.now);
  const lineSets = kits.filter((k) => kitMode(k) === "linear");
  const assumptions: string[] = [];
  const rows: TableRow[] = args.machines.map((m, i) => {
    checkNumber(m.quantity, `machines[${i}].quantity`, MAX_UNITS);
    checkNumber(m.lineMeters, `machines[${i}].lineMeters`, MAX_METERS);
    checkNumber(m.unitPriceBrl, `machines[${i}].unitPriceBrl`, 10_000_000);
    const kit = lineSetForCapacity(kits, m.capacityBtu, m.lineType);
    if (!kit) {
      const sizes = [...new Set(lineSets.map((k) => k.name.split(" ")[0]))].join(", ");
      throw fail(
        `Sem kit de linha para ${formatCapacity(m.capacityBtu)} BTU/h. Capacidades com kit: ${sizes}`
      );
    }
    const type = m.type ?? "Hi Wall";
    const meters = m.lineMeters ?? 8;
    assumptions.push(
      `${m.quantity}× ${type} ${formatCapacity(m.capacityBtu)} BTU/h: kit "${kit.name}"` +
        `${kit.label ? ` (${kit.label})` : ""}, ${meters} m de linha por máquina` +
        `${m.lineMeters === undefined ? " (padrão)" : ""}`
    );
    return { type, lineSet: kit.id, qty: m.quantity, meters, price: m.unitPriceBrl ?? 0 };
  });

  const values = {
    ...templateValues(SPLIT_TEMPLATE, undefined, kits),
    machines: rows,
    machine: args.includeMachines ?? true,
    labor: args.laborPerEvaporatorBrl ?? 0,
    mobilization: args.mobilizationBrl ?? 0,
  };
  const warnings: string[] = [];
  if (!args.laborPerEvaporatorBrl) {
    warnings.push(
      "Sem mão de obra: informe laborPerEvaporatorBrl (a RLP cobra a instalação por evaporadora)."
    );
  }
  if (args.mobilizationBrl) {
    assumptions.push(`Mobilização e deslocamento: ${brl(args.mobilizationBrl)} por obra`);
  }
  return priced(SPLIT_TEMPLATE.lines(values, kits), catalog, args.bdiPercent, assumptions, warnings);
}

/** Bathroom exhaust: fan, flexible duct, clamps, grille and cap per bathroom. */
export async function estimateBathroomExhaust(
  ctx: QueryCtx,
  args: ObjectType<typeof bathroomExhaustEstimateArgs>
): Promise<EstimateResult> {
  checkNumber(args.bathrooms, "bathrooms", MAX_UNITS);
  checkNumber(args.ductMeters, "ductMeters", MAX_METERS);
  checkNumber(args.fanPriceBrl, "fanPriceBrl", 1_000_000);
  checkNumber(args.clampsPerBathroom, "clampsPerBathroom", 100);
  checkNumber(args.laborPerBathroomBrl, "laborPerBathroomBrl", 1_000_000);
  checkNumber(args.bdiPercent, "bdiPercent", 1000);
  if (args.bathrooms === 0) throw fail("Informe ao menos um banheiro");

  const { catalog, kits } = await loadPricing(ctx, args.now);
  const defaults = templateValues(BATHROOM_EXHAUST_TEMPLATE, undefined, kits);
  const values = {
    ...defaults,
    units: args.bathrooms,
    ...(args.diameterMm !== undefined ? { diameter: String(args.diameterMm) } : {}),
    ...(args.ductMeters !== undefined ? { meters: args.ductMeters } : {}),
    ...(args.fanPriceBrl !== undefined ? { fanPrice: args.fanPriceBrl } : {}),
    ...(args.grille !== undefined ? { grille: args.grille } : {}),
    ...(args.cap !== undefined ? { cap: args.cap } : {}),
    ...(args.clampsPerBathroom !== undefined ? { clamps: args.clampsPerBathroom } : {}),
    ...(args.laborPerBathroomBrl !== undefined ? { labor: args.laborPerBathroomBrl } : {}),
  };
  const assumptions = [
    `${args.bathrooms} banheiro(s), duto Ø${String(values.diameter)} mm, ` +
      `${String(values.meters)} m de duto flexível e ${String(values.clamps)} abraçadeiras por banheiro`,
  ];
  const warnings: string[] = [];
  if (!args.laborPerBathroomBrl) {
    warnings.push("Sem mão de obra: informe laborPerBathroomBrl.");
  }
  return priced(
    BATHROOM_EXHAUST_TEMPLATE.lines(values, kits),
    catalog,
    args.bdiPercent,
    assumptions,
    warnings
  );
}
