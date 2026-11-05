import { v } from "convex/values";
import { logAudit } from "./lib/audit";
import {
  engineeringOrPurchasingQuery,
  takeoffConfigMutation,
} from "./lib/rbac";
import {
  factoryTakeoffDuctNormas,
  factoryTakeoffVrfBrands,
  factoryTakeoffWeights,
  getTakeoffSetting,
  listPublishedTakeoffSettings,
  putTakeoffSetting,
  sanitizeTakeoffBasePrices,
  sanitizeTakeoffDuctNormas,
  sanitizeTakeoffLabor,
  sanitizeTakeoffVrfBrands,
  sanitizeTakeoffWeights,
  takeoffSettingsValidator,
} from "./model/procurement/takeoffSettings";
import { takeoffDuctNorma, takeoffVrfBrand, takeoffWeightRow } from "./schema";

/**
 * Configurações do RLP Takeoff além dos kits (ver `takeoffKits.ts`): a tabela
 * de materiais por peso com o kg/m² das chapas, os preços por kg dos insumos,
 * as regras das marcas de VRF, a mão de obra global (dutos por kg, VRF por
 * evaporadora) e os parâmetros de dutos por norma. Padrões da empresa, editados no dashboard em
 * App Takeoff por engenharia ou compras e publicados ao app desktop junto com
 * o catálogo (`takeoffCatalog.current`). Cada
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
      labor: metaValidator,
      ductNormas: metaValidator,
    }),
  }),
  handler: async (ctx) => {
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
  },
});

/** Substitui a tabela de materiais por peso e o kg/m² por bitola de chapa. */
export const saveWeights = takeoffConfigMutation({
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
export const saveBasePrices = takeoffConfigMutation({
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
export const saveVrfBrands = takeoffConfigMutation({
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

/** Substitui a mão de obra global (uma chave ausente = padrão da planilha). */
export const saveLabor = takeoffConfigMutation({
  args: { ductPerKg: v.optional(v.number()), vrfPerEvap: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const clean = sanitizeTakeoffLabor(args);
    const { id, before } = await putTakeoffSetting(ctx, "labor", clean, ctx.user._id);
    await logAudit(ctx, ctx.user, {
      action: before ? "update" : "create",
      tableName: "takeoffSettings",
      recordId: id,
      entityLabel: "Mão de obra",
      snapshotBefore: before ?? undefined,
      snapshotAfter: clean,
    });
    return null;
  },
});

/** Substitui os parâmetros de dutos por norma. */
export const saveDuctNormas = takeoffConfigMutation({
  args: { normas: v.array(takeoffDuctNorma) },
  returns: v.null(),
  handler: async (ctx, { normas }) => {
    const clean = { normas: sanitizeTakeoffDuctNormas(normas) };
    const { id, before } = await putTakeoffSetting(ctx, "ductNormas", clean, ctx.user._id);
    await logAudit(ctx, ctx.user, {
      action: before ? "update" : "create",
      tableName: "takeoffSettings",
      recordId: id,
      entityLabel: "Parâmetros de dutos por norma",
      snapshotBefore: before ?? undefined,
      snapshotAfter: clean,
    });
    return null;
  },
});

/**
 * Carrega as tabelas de fábrica do app numa configuração que a empresa ainda
 * não publicou, ou publicou vazia (o app lê uma lista vazia como "nada
 * publicado"); uma tabela com conteúdo nunca é sobrescrita, e o kg/m² das
 * chapas já publicado fica. Retorna se entrou.
 */
export const seedDefaults = takeoffConfigMutation({
  args: {
    kind: v.union(v.literal("weights"), v.literal("vrfBrands"), v.literal("ductNormas")),
  },
  returns: v.boolean(),
  handler: async (ctx, { kind }) => {
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
            ctx.user._id
          )
        : kind === "vrfBrands"
          ? await putTakeoffSetting(
              ctx,
              "vrfBrands",
              { brands: factoryTakeoffVrfBrands() },
              ctx.user._id
            )
          : await putTakeoffSetting(
              ctx,
              "ductNormas",
              { normas: factoryTakeoffDuctNormas() },
              ctx.user._id
            );
    const labels = {
      weights: "Materiais por peso",
      vrfBrands: "Marcas de VRF",
      ductNormas: "Parâmetros de dutos por norma",
    } as const;
    await logAudit(ctx, ctx.user, {
      action: "seed",
      tableName: "takeoffSettings",
      recordId: id,
      entityLabel: labels[kind],
      details: "tabela de fábrica carregada",
    });
    return true;
  },
});
