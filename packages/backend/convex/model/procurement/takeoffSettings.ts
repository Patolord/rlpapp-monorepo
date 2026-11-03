import { type Infer, v } from "convex/values";
import {
  cloneBrands,
  type HpRow,
  isDiameter,
  normalizeBrand,
  SEED_BRANDS,
  type VrfBrand,
} from "@rlpapp/shared/takeoff/vrfBrands";
import {
  type BasePrices,
  isBaseMaterialKey,
  normalizeWeightRow,
  SEED_WEIGHTS,
  type WeightRow,
  weightKey,
} from "@rlpapp/shared/takeoff/weights";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { takeoffVrfBrand, takeoffWeightRow } from "../../schema";

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
});

/** A brand as stored: the diameters are plain strings until sanitized. */
export type StoredVrfBrand = Infer<typeof takeoffVrfBrand>;

export type TakeoffSettings = {
  weights: TakeoffWeights | null;
  basePrices: BasePrices | null;
  vrfBrands: StoredVrfBrand[] | null;
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
  return {
    weights: weights ? { rows: weights.rows, gaugeWeights: weights.gaugeWeights } : null,
    basePrices: basePrices ? basePrices.prices : null,
    vrfBrands: vrfBrands ? vrfBrands.brands : null,
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
