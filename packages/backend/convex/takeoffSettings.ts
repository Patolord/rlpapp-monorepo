import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { logAudit } from "./lib/audit";
import {
  engineeringOrPurchasingQuery,
  takeoffConfigMutation,
} from "./lib/rbac";
import {
  backfillTakeoffPriceHistory,
  listTakeoffPriceHistory,
  removeTakeoffPriceRecord,
  saveTakeoffBasePrices,
  saveTakeoffPriceRecord,
} from "./model/procurement/takeoffPriceHistory";
import {
  getTakeoffSettingsWithMeta,
  putTakeoffSetting,
  sanitizeTakeoffDuctNormas,
  sanitizeTakeoffLabor,
  sanitizeTakeoffVrfBrands,
  sanitizeTakeoffWeights,
  seedTakeoffDefaults,
  takeoffSettingsValidator,
} from "./model/procurement/takeoffSettings";
import { takeoffDuctNorma, takeoffVrfBrand, takeoffWeightRow } from "./schema/procurement";

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
  handler: async (ctx) => await getTakeoffSettingsWithMeta(ctx),
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
    await saveTakeoffBasePrices(ctx, ctx.user, prices);
    return null;
  },
});

/**
 * Registra o preço por kg de um insumo numa data (cotação do dia, preço do
 * fornecedor...). Um registro por insumo e dia: registrar de novo no mesmo dia
 * corrige o valor. O preço publicado ao app é sempre o do registro mais recente.
 */
export const savePriceRecord = takeoffConfigMutation({
  args: {
    material: v.string(),
    /** AAAA-MM-DD; hoje ou antes. */
    date: v.string(),
    price: v.number(),
    note: v.optional(v.string()),
  },
  returns: v.id("takeoffPriceHistory"),
  handler: async (ctx, args) => await saveTakeoffPriceRecord(ctx, ctx.user, args),
});

/** Remove um registro de preço; o preço publicado volta ao registro anterior. */
export const removePriceRecord = takeoffConfigMutation({
  args: { id: v.id("takeoffPriceHistory") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await removeTakeoffPriceRecord(ctx, ctx.user, id);
    return null;
  },
});

/**
 * Histórico dos preços por kg publicados, por insumo e em ordem cronológica:
 * cada ponto vale até o seguinte (`price` nulo = sem preço publicado, o app
 * usa o padrão do fornecedor). Alimenta os gráficos de variação.
 */
export const priceHistory = engineeringOrPurchasingQuery({
  args: {},
  returns: v.array(
    v.object({
      id: v.id("takeoffPriceHistory"),
      material: v.string(),
      price: v.union(v.number(), v.null()),
      recordedAt: v.number(),
      recordedBy: v.union(v.string(), v.null()),
      note: v.union(v.string(), v.null()),
    })
  ),
  handler: async (ctx) => await listTakeoffPriceHistory(ctx),
});

/**
 * Backfill único do histórico de preços por kg a partir do log de auditoria
 * das publicações anteriores à tabela `takeoffPriceHistory`. Não faz nada se
 * o histórico já tem pontos. Rodar uma vez por deployment:
 * `npx convex run takeoffSettings:backfillPriceHistory`.
 */
export const backfillPriceHistory = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => await backfillTakeoffPriceHistory(ctx),
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
  handler: async (ctx, { kind }) => await seedTakeoffDefaults(ctx, ctx.user, kind),
});
