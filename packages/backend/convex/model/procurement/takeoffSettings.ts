import { type Infer, v } from "convex/values";
import {
  DEFAULT_DUCT_NORMAS,
  type DuctNormaDefaults,
  type GaugeLimits,
} from "@rlpapp/shared/engenharia/ducts";
import { isLaborPriceKey, type LaborPrices } from "@rlpapp/shared/takeoff/labor";
import {
  cloneBrands,
  type HpRow,
  isDiameter,
  normalizeBrand,
  SEED_BRANDS,
  type VrfBrand,
} from "@rlpapp/shared/takeoff/vrfBrands";
import {
  BASE_MATERIALS,
  type BasePrices,
  isBaseMaterialKey,
  normalizeWeightRow,
  SEED_WEIGHTS,
  type WeightRow,
  weightKey,
} from "@rlpapp/shared/takeoff/weights";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import { takeoffDuctNorma, takeoffVrfBrand, takeoffWeightRow } from "../../schema/procurement";

/**
 * Company defaults of the RLP Takeoff settings other than kits (`takeoffSettings`): the weight
 * table with the kg/m² per duct gauge, the prices per kg and the VRF brand rules. One document
 * per kind; published to the desktop app with the catalog, where the app applies them under
 * each user's local overrides.
 */

export const MAX_WEIGHT_ROWS = 500;
export const MAX_TEXT = 200;
export const MAX_BRANDS = 50;
export const MAX_TABLE_ROWS = 100;

export type GaugeWeights = Record<string, number>;

export type TakeoffWeights = { rows: WeightRow[]; gaugeWeights: GaugeWeights };

/** What the app receives (and the dashboard reads): null for a kind never published. */
export const takeoffSettingsValidator = v.object({
  weights: v.union(
    v.object({
      rows: v.array(takeoffWeightRow),
      gaugeWeights: v.record(v.string(), v.number()),
    }),
    v.null()
  ),
  basePrices: v.union(v.record(v.string(), v.number()), v.null()),
  vrfBrands: v.union(v.array(takeoffVrfBrand), v.null()),
  labor: v.union(
    v.object({ ductPerKg: v.optional(v.number()), vrfPerEvap: v.optional(v.number()) }),
    v.null()
  ),
  ductNormas: v.union(v.array(takeoffDuctNorma), v.null()),
});

/** A brand as stored: the diameters are plain strings until sanitized. */
export type StoredVrfBrand = Infer<typeof takeoffVrfBrand>;

/** A norma's row as stored: the limits are a plain array until sanitized. */
export type StoredDuctNorma = Infer<typeof takeoffDuctNorma>;

export type TakeoffSettings = {
  weights: TakeoffWeights | null;
  basePrices: BasePrices | null;
  vrfBrands: StoredVrfBrand[] | null;
  labor: LaborPrices | null;
  ductNormas: StoredDuctNorma[] | null;
};

export type SettingKind = Doc<"takeoffSettings">["kind"];
export type SettingDoc<K extends SettingKind> = Extract<Doc<"takeoffSettings">, { kind: K }>;

export async function getTakeoffSetting<K extends SettingKind>(
  ctx: QueryCtx,
  kind: K
): Promise<SettingDoc<K> | null> {
  const doc = await ctx.db
    .query("takeoffSettings")
    .withIndex("by_kind", (q) => q.eq("kind", kind))
    .unique();
  return doc as SettingDoc<K> | null;
}

/** Every published setting, in the app's shape. */
export async function listPublishedTakeoffSettings(
  ctx: QueryCtx
): Promise<TakeoffSettings> {
  const weights = await getTakeoffSetting(ctx, "weights");
  const basePrices = await getTakeoffSetting(ctx, "basePrices");
  const vrfBrands = await getTakeoffSetting(ctx, "vrfBrands");
  const labor = await getTakeoffSetting(ctx, "labor");
  const ductNormas = await getTakeoffSetting(ctx, "ductNormas");
  return {
    weights: weights ? { rows: weights.rows, gaugeWeights: weights.gaugeWeights } : null,
    basePrices: basePrices ? basePrices.prices : null,
    vrfBrands: vrfBrands ? vrfBrands.brands : null,
    labor: labor
      ? {
          ...(labor.ductPerKg !== undefined ? { ductPerKg: labor.ductPerKg } : {}),
          ...(labor.vrfPerEvap !== undefined ? { vrfPerEvap: labor.vrfPerEvap } : {}),
        }
      : null,
    ductNormas: ductNormas ? ductNormas.normas : null,
  };
}

const positive = (n: number) => Number.isFinite(n) && n > 0;

/**
 * Validate and normalise the weight table: trimmed names (unique, folded), a known base
 * material and a positive weight per row; gauges with positive values only. Throws a message
 * in Portuguese for the form.
 */
export function sanitizeTakeoffWeights(input: TakeoffWeights): TakeoffWeights {
  const seen = new Set<string>();
  const rows: WeightRow[] = [];
  for (const raw of input.rows) {
    const row = normalizeWeightRow(raw);
    if (!row.name) continue;
    if (row.name.length > MAX_TEXT || row.group.length > MAX_TEXT) {
      throw new Error(`Texto com mais de ${MAX_TEXT} caracteres: ${row.name.slice(0, 40)}…`);
    }
    if (!isBaseMaterialKey(row.material)) {
      throw new Error(`${row.name}: insumo desconhecido (${row.material})`);
    }
    if (!positive(row.kgPerUnit)) {
      throw new Error(`${row.name}: o peso deve ser maior que zero`);
    }
    const key = weightKey(row);
    if (seen.has(key)) throw new Error(`${row.name}: material repetido na tabela`);
    seen.add(key);
    rows.push(row);
  }
  if (rows.length > MAX_WEIGHT_ROWS) {
    throw new Error(`Tabela com mais de ${MAX_WEIGHT_ROWS} materiais`);
  }
  const gaugeWeights: GaugeWeights = {};
  for (const [gauge, kgm2] of Object.entries(input.gaugeWeights)) {
    if (!positive(kgm2)) {
      throw new Error(`Bitola ${gauge}: o peso deve ser maior que zero`);
    }
    gaugeWeights[gauge] = kgm2;
  }
  return { rows, gaugeWeights };
}

/** Labour prices: known keys with positive values; a missing key means "the workbook's". */
export function sanitizeTakeoffLabor(prices: Record<string, number | undefined>): LaborPrices {
  const out: LaborPrices = {};
  for (const [key, price] of Object.entries(prices)) {
    if (price === undefined) continue;
    if (!isLaborPriceKey(key)) throw new Error(`Mão de obra desconhecida: ${key}`);
    if (!positive(price)) throw new Error(`${key}: o valor deve ser maior que zero`);
    out[key] = price;
  }
  return out;
}

const nonNegative = (n: number) => Number.isFinite(n) && n >= 0;

/**
 * The duct parameters per norma: each of the three normas at most once, four ascending
 * positive gauge limits, non-negative thicknesses and allowances.
 */
export function sanitizeTakeoffDuctNormas(normas: StoredDuctNorma[]): DuctNormaDefaults[] {
  const seen = new Set<number>();
  return normas.map((n) => {
    if (seen.has(n.norma)) throw new Error(`Norma ${n.norma} repetida`);
    seen.add(n.norma);
    if (n.gaugeLimits.length !== 4) {
      throw new Error(`Norma ${n.norma}: informe os quatro limites de bitola`);
    }
    const limits = n.gaugeLimits as GaugeLimits;
    for (let i = 0; i < limits.length; i++) {
      if (!positive(limits[i]) || (i > 0 && limits[i] <= limits[i - 1])) {
        throw new Error(`Norma ${n.norma}: os limites de bitola devem ser crescentes`);
      }
    }
    for (const [field, value] of [
      ["insulThickness", n.insulThickness],
      ["flangeSpacing", n.flangeSpacing],
      ["rechapThickness", n.rechapThickness],
      ["insulSlackPct", n.insulSlackPct],
      ["supportsPct", n.supportsPct],
    ] as const) {
      if (!nonNegative(value)) throw new Error(`Norma ${n.norma}: ${field} inválido`);
    }
    if (n.sheetSlackPct !== null && !nonNegative(n.sheetSlackPct)) {
      throw new Error(`Norma ${n.norma}: folga de chapa inválida`);
    }
    return {
      norma: n.norma,
      gaugeLimits: [limits[0], limits[1], limits[2], limits[3]],
      insulThickness: n.insulThickness,
      flangeSpacing: n.flangeSpacing,
      rechapThickness: n.rechapThickness,
      sheetSlackPct: n.sheetSlackPct,
      insulSlackPct: n.insulSlackPct,
      supportsPct: n.supportsPct,
    };
  });
}

/** Prices per kg: known base materials with positive prices; a missing key means "no price". */
export function sanitizeTakeoffBasePrices(prices: BasePrices): BasePrices {
  const out: BasePrices = {};
  for (const [key, price] of Object.entries(prices)) {
    if (!isBaseMaterialKey(key)) throw new Error(`Insumo desconhecido: ${key}`);
    if (!positive(price)) throw new Error(`${key}: o preço deve ser maior que zero`);
    out[key] = price;
  }
  return out;
}

/**
 * Validate and normalise the VRF brands: unique ids, trimmed names, tables with at least one
 * row each, known diameters, non-negative HP thresholds, Y-kits with a model.
 */
export function sanitizeTakeoffVrfBrands(brands: StoredVrfBrand[]): VrfBrand[] {
  if (brands.length > MAX_BRANDS) throw new Error(`Mais de ${MAX_BRANDS} marcas`);
  const ids = new Set<string>();
  return brands.map((raw) => {
    const name = raw.name.trim() || "Marca";
    const table = (role: "main" | "trunk" | "branch"): HpRow[] => {
      const rows = raw[role];
      if (rows.length === 0) {
        throw new Error(`${name}: a tabela ${role} precisa de uma linha`);
      }
      if (rows.length > MAX_TABLE_ROWS) {
        throw new Error(`${name}: tabela ${role} grande demais`);
      }
      return rows.map((r) => {
        if (!Number.isFinite(r.hp) || r.hp < 0) throw new Error(`${name}: HP inválido`);
        if (!isDiameter(r.gas) || !isDiameter(r.liquid)) {
          throw new Error(`${name}: bitola desconhecida (${r.gas} / ${r.liquid})`);
        }
        return { hp: r.hp, gas: r.gas, liquid: r.liquid };
      });
    };
    const b = normalizeBrand({
      id: raw.id,
      name: raw.name,
      main: table("main"),
      trunk: table("trunk"),
      branch: table("branch"),
      ykit: raw.ykit,
    });
    b.id = b.id.trim();
    if (!b.id) throw new Error("Marca sem id");
    if (ids.has(b.id)) throw new Error(`Id de marca repetido: ${b.id}`);
    ids.add(b.id);
    if (!b.name) throw new Error("Informe o nome da marca");
    if (b.name.length > MAX_TEXT) {
      throw new Error(`Nome de marca com mais de ${MAX_TEXT} caracteres`);
    }
    if (b.ykit.length > MAX_TABLE_ROWS) {
      throw new Error(`${b.name}: lista de Y-kits grande demais`);
    }
    for (const y of b.ykit) {
      if (!Number.isFinite(y.hp) || y.hp < 0) {
        throw new Error(`${b.name}: HP de Y-kit inválido`);
      }
      if (!y.model) throw new Error(`${b.name}: Y-kit sem modelo`);
      if (y.model.length > MAX_TEXT) {
        throw new Error(`${b.name}: modelo de Y-kit longo demais`);
      }
    }
    return b;
  });
}

export type SettingFields<K extends SettingKind> = Omit<
  SettingDoc<K>,
  "_id" | "_creationTime" | "kind" | "updatedAt" | "updatedByUserId"
>;

/** Create or replace the document of a kind; returns the previous fields for the audit log. */
export async function putTakeoffSetting<K extends SettingKind>(
  ctx: MutationCtx,
  kind: K,
  fields: SettingFields<K>,
  userId: Id<"users">
): Promise<{ id: Id<"takeoffSettings">; before: SettingFields<K> | null }> {
  const existing = await getTakeoffSetting(ctx, kind);
  const doc = {
    kind,
    ...fields,
    updatedAt: Date.now(),
    updatedByUserId: userId,
  } as unknown as Doc<"takeoffSettings">;
  if (existing) {
    const before = { ...existing } as Partial<Doc<"takeoffSettings">>;
    delete before._id;
    delete before._creationTime;
    delete before.kind;
    delete before.updatedAt;
    delete before.updatedByUserId;
    await ctx.db.replace("takeoffSettings", existing._id, doc);
    return { id: existing._id, before: before as SettingFields<K> };
  }
  return { id: await ctx.db.insert("takeoffSettings", doc), before: null };
}

/** The app's factory tables, for "Carregar tabela de fábrica" when a kind was never published. */
export const factoryTakeoffWeights = (): TakeoffWeights => ({
  rows: SEED_WEIGHTS.map((r) => ({ ...r })),
  // the gauges keep the supplier's weights built into the app until the company sets them
  gaugeWeights: {},
});

export const factoryTakeoffVrfBrands = (): VrfBrand[] => cloneBrands(SEED_BRANDS);

export const factoryTakeoffDuctNormas = (): DuctNormaDefaults[] =>
  DEFAULT_DUCT_NORMAS.map((n) => ({ ...n, gaugeLimits: [...n.gaugeLimits] as GaugeLimits }));

/**
 * Append a history point for every base material whose price per kg changed between two
 * publications (`price: null` = the price was cleared). Keys outside BASE_MATERIALS never reach
 * here: `sanitizeTakeoffBasePrices` refuses them.
 */
export async function recordTakeoffPriceChanges(
  ctx: MutationCtx,
  before: BasePrices | null,
  after: BasePrices,
  userId: Id<"users">,
  recordedAt: number
): Promise<number> {
  let recorded = 0;
  for (const { key } of BASE_MATERIALS) {
    const previous = before?.[key] ?? null;
    const next = after[key] ?? null;
    if (previous === next) continue;
    await ctx.db.insert("takeoffPriceHistory", {
      material: key,
      price: next,
      recordedAt,
      recordedByUserId: userId,
    });
    recorded++;
  }
  return recorded;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Brasília is UTC−3 all year (no daylight saving since 2019). */
const BRT_OFFSET_HOURS = 3;
const MAX_PRICE_NOTE = 200;

/**
 * A price date ("AAAA-MM-DD") as stored in `takeoffPriceHistory.recordedAt`: midnight in
 * Brasília, so a price dated today is already in force and the day reads the same in the app.
 */
export function priceDateToTimestamp(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error("Data inválida: use AAAA-MM-DD");
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const t = Date.UTC(y, m - 1, d, BRT_OFFSET_HOURS);
  const check = new Date(t - BRT_OFFSET_HOURS * 60 * 60 * 1000);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw new Error(`Data inválida: ${date}`);
  }
  return t;
}

/** Trimmed note, or undefined when empty; refuses notes longer than a short line. */
export function sanitizePriceNote(note: string | undefined): string | undefined {
  const clean = note?.trim();
  if (!clean) return undefined;
  if (clean.length > MAX_PRICE_NOTE) {
    throw new Error(`Observação com mais de ${MAX_PRICE_NOTE} caracteres`);
  }
  return clean;
}

/**
 * Records the price of a base material on a day: one record per material and day, so a second
 * record on the same day corrects the first (and drops any other point of that day, such as
 * publications timed by `saveBasePrices`). Returns the record id.
 */
export async function upsertTakeoffPriceRecord(
  ctx: MutationCtx,
  record: { material: string; recordedAt: number; price: number; note?: string },
  userId: Id<"users">
): Promise<Id<"takeoffPriceHistory">> {
  const [sameDay, ...extra] = await ctx.db
    .query("takeoffPriceHistory")
    .withIndex("by_material_recordedAt", (q) =>
      q
        .eq("material", record.material)
        .gte("recordedAt", record.recordedAt)
        .lt("recordedAt", record.recordedAt + DAY_MS)
    )
    .take(50);
  for (const row of extra) await ctx.db.delete("takeoffPriceHistory", row._id);
  const fields = {
    material: record.material,
    price: record.price,
    recordedAt: record.recordedAt,
    recordedByUserId: userId,
    note: record.note,
  };
  if (sameDay) {
    await ctx.db.replace("takeoffPriceHistory", sameDay._id, fields);
    return sameDay._id;
  }
  return await ctx.db.insert("takeoffPriceHistory", fields);
}

/**
 * Brings the published price of a material in line with its records: the latest one dated up to
 * `now` is the price in force; none (or a removal, `price: null`) leaves the material without a
 * price, so the app uses the supplier's. Returns what changed in the setting, or null.
 */
export async function syncTakeoffBasePrice(
  ctx: MutationCtx,
  material: string,
  userId: Id<"users">,
  now: number
): Promise<{
  id: Id<"takeoffSettings">;
  before: { prices: BasePrices } | null;
  after: { prices: BasePrices };
} | null> {
  const latest = await ctx.db
    .query("takeoffPriceHistory")
    .withIndex("by_material_recordedAt", (q) => q.eq("material", material).lte("recordedAt", now))
    .order("desc")
    .first();
  const setting = await getTakeoffSetting(ctx, "basePrices");
  const prices: BasePrices = { ...(setting?.prices ?? {}) };
  const next = latest?.price ?? null;
  if ((prices[material] ?? null) === next) return null;
  if (next === null) delete prices[material];
  else prices[material] = next;
  const after = { prices };
  const { id, before } = await putTakeoffSetting(ctx, "basePrices", after, userId);
  return { id, before, after };
}

/** The published settings plus who changed each kind last (`takeoffSettings.get`). */
export async function getTakeoffSettingsWithMeta(ctx: QueryCtx) {
  const settings = await listPublishedTakeoffSettings(ctx);
  const meta = async (
    kind: "weights" | "basePrices" | "vrfBrands" | "labor" | "ductNormas"
  ) => {
    const doc = await getTakeoffSetting(ctx, kind);
    if (!doc) return null;
    const user = doc.updatedByUserId
      ? await ctx.db.get("users", doc.updatedByUserId)
      : null;
    return { updatedAt: doc.updatedAt, updatedBy: user?.name ?? null };
  };
  return {
    ...settings,
    meta: {
      weights: await meta("weights"),
      basePrices: await meta("basePrices"),
      vrfBrands: await meta("vrfBrands"),
      labor: await meta("labor"),
      ductNormas: await meta("ductNormas"),
    },
  };
}

/**
 * Loads the app's factory table into a kind the company never published, or published empty
 * (the app reads an empty list as "nothing published"); a table with content is never
 * overwritten, and the published kg/m² per gauge stays. Returns whether it was loaded.
 */
export async function seedTakeoffDefaults(
  ctx: MutationCtx,
  user: Doc<"users">,
  kind: "weights" | "vrfBrands" | "ductNormas"
): Promise<boolean> {
  const existing = await getTakeoffSetting(ctx, kind);
  if (existing) {
    const empty =
      existing.kind === "weights"
        ? existing.rows.length === 0
        : existing.kind === "vrfBrands"
          ? existing.brands.length === 0
          : existing.kind === "ductNormas" && existing.normas.length === 0;
    if (!empty) return false;
  }
  const { id } =
    kind === "weights"
      ? await putTakeoffSetting(
          ctx,
          "weights",
          {
            ...factoryTakeoffWeights(),
            ...(existing?.kind === "weights"
              ? { gaugeWeights: existing.gaugeWeights }
              : {}),
          },
          user._id
        )
      : kind === "vrfBrands"
        ? await putTakeoffSetting(
            ctx,
            "vrfBrands",
            { brands: factoryTakeoffVrfBrands() },
            user._id
          )
        : await putTakeoffSetting(
            ctx,
            "ductNormas",
            { normas: factoryTakeoffDuctNormas() },
            user._id
          );
  const labels = {
    weights: "Materiais por peso",
    vrfBrands: "Marcas de VRF",
    ductNormas: "Parâmetros de dutos por norma",
  } as const;
  await logAudit(ctx, user, {
    action: "seed",
    tableName: "takeoffSettings",
    recordId: id,
    entityLabel: labels[kind],
    details: "tabela de fábrica carregada",
  });
  return true;
}
