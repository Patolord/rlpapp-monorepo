import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { logAudit } from "./lib/audit";
import {
  engineeringOrPurchasingMutation,
  engineeringOrPurchasingQuery,
} from "./lib/rbac";
import {
  factoryTakeoffVrfBrands,
  factoryTakeoffWeights,
  getTakeoffSetting,
  listPublishedTakeoffSettings,
  putTakeoffSetting,
  sanitizeTakeoffBasePrices,
  sanitizeTakeoffVrfBrands,
  sanitizeTakeoffWeights,
  takeoffSettingsValidator,
} from "./model/procurement/takeoffSettings";
import { takeoffVrfBrand, takeoffWeightRow } from "./schema";

/**
 * Configurações do RLP Takeoff além dos kits (ver `takeoffKits.ts`): a tabela
 * de materiais por peso com o kg/m² das chapas, os preços por kg dos insumos
 * e as regras das marcas de VRF. Padrões da empresa, editados no dashboard em
 * App Takeoff por engenharia ou compras e publicados ao app desktop junto com
 * o catálogo (`takeoffCatalog.current` e `GET /takeoff/catalog`). Cada
 * usuário do app pode sobrescrever localmente; o padrão daqui vale para quem
 * não mexeu.
 */

const metaValidator = v.union(
  v.object({ updatedAt: v.number(), updatedBy: v.union(v.string(), v.null()) }),
  v.null()
);

/** As configurações publicadas, com quem alterou cada uma por último. */
export const get = engineeringOrPurchasingQuery({
  args: {},
  returns: v.object({
    ...takeoffSettingsValidator.fields,
    meta: v.object({
      weights: metaValidator,
      basePrices: metaValidator,
      vrfBrands: metaValidator,
    }),
  }),
  handler: async (ctx) => {
    const settings = await listPublishedTakeoffSettings(ctx);
    const meta = async (kind: "weights" | "basePrices" | "vrfBrands") => {
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
      },
    };
  },
});

/** O que o app desktop recebe no catálogo (rota HTTP). */
export const listPublished = internalQuery({
  args: {},
  returns: takeoffSettingsValidator,
  handler: async (ctx) => await listPublishedTakeoffSettings(ctx),
});

/** Substitui a tabela de materiais por peso e o kg/m² por bitola de chapa. */
export const saveWeights = engineeringOrPurchasingMutation({
  args: {
    rows: v.array(takeoffWeightRow),
    gaugeWeights: v.record(v.string(), v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const clean = sanitizeTakeoffWeights(args);
    const { id, before } = await putTakeoffSetting(ctx, "weights", clean, ctx.user._id);
    await logAudit(ctx, ctx.user, {
      action: before ? "update" : "create",
      tableName: "takeoffSettings",
      recordId: id,
      entityLabel: "Materiais por peso",
      details: `${clean.rows.length} materiais`,
      snapshotBefore: before ?? undefined,
      snapshotAfter: clean,
    });
    return null;
  },
});

/** Substitui os preços por kg dos insumos (uma chave ausente = sem preço). */
export const saveBasePrices = engineeringOrPurchasingMutation({
  args: { prices: v.record(v.string(), v.number()) },
  returns: v.null(),
  handler: async (ctx, { prices }) => {
    const clean = { prices: sanitizeTakeoffBasePrices(prices) };
    const { id, before } = await putTakeoffSetting(ctx, "basePrices", clean, ctx.user._id);
    await logAudit(ctx, ctx.user, {
      action: before ? "update" : "create",
      tableName: "takeoffSettings",
      recordId: id,
      entityLabel: "Preços por kg",
      snapshotBefore: before ?? undefined,
      snapshotAfter: clean,
    });
    return null;
  },
});

/** Substitui as regras das marcas de VRF. */
export const saveVrfBrands = engineeringOrPurchasingMutation({
  args: { brands: v.array(takeoffVrfBrand) },
  returns: v.null(),
  handler: async (ctx, { brands }) => {
    const clean = { brands: sanitizeTakeoffVrfBrands(brands) };
    const { id, before } = await putTakeoffSetting(ctx, "vrfBrands", clean, ctx.user._id);
    await logAudit(ctx, ctx.user, {
      action: before ? "update" : "create",
      tableName: "takeoffSettings",
      recordId: id,
      entityLabel: "Marcas de VRF",
      details: `${clean.brands.length} marcas`,
      snapshotBefore: before ?? undefined,
      snapshotAfter: clean,
    });
    return null;
  },
});

/**
 * Carrega as tabelas de fábrica do app numa configuração que a empresa ainda
 * não publicou (nada é sobrescrito). Retorna se entrou.
 */
export const seedDefaults = engineeringOrPurchasingMutation({
  args: { kind: v.union(v.literal("weights"), v.literal("vrfBrands")) },
  returns: v.boolean(),
  handler: async (ctx, { kind }) => {
    if (await getTakeoffSetting(ctx, kind)) return false;
    const { id } =
      kind === "weights"
        ? await putTakeoffSetting(ctx, "weights", factoryTakeoffWeights(), ctx.user._id)
        : await putTakeoffSetting(
            ctx,
            "vrfBrands",
            { brands: factoryTakeoffVrfBrands() },
            ctx.user._id
          );
    await logAudit(ctx, ctx.user, {
      action: "seed",
      tableName: "takeoffSettings",
      recordId: id,
      entityLabel: kind === "weights" ? "Materiais por peso" : "Marcas de VRF",
      details: "tabela de fábrica carregada",
    });
    return true;
  },
});
