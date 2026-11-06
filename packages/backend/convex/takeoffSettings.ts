import {
  BASE_MATERIALS,
  type BasePrices,
  baseMaterialLabel,
} from "@rlpapp/shared/takeoff/weights";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
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
  priceDateToTimestamp,
  putTakeoffSetting,
  recordTakeoffPriceChanges,
  sanitizePriceNote,
  sanitizeTakeoffBasePrices,
  syncTakeoffBasePrice,
  upsertTakeoffPriceRecord,
  sanitizeTakeoffDuctNormas,
  sanitizeTakeoffLabor,
  sanitizeTakeoffVrfBrands,
  sanitizeTakeoffWeights,
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
    await recordTakeoffPriceChanges(
      ctx,
      before?.prices ?? null,
      clean.prices,
      ctx.user._id,
      Date.now()
    );
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
  handler: async (ctx, args) => {
    const price = sanitizeTakeoffBasePrices({ [args.material]: args.price })[args.material]!;
    const recordedAt = priceDateToTimestamp(args.date);
    const now = Date.now();
    if (recordedAt > now) throw new Error("A data do preço não pode estar no futuro");
    const note = sanitizePriceNote(args.note);
    const id = await upsertTakeoffPriceRecord(
      ctx,
      { material: args.material, recordedAt, price, note },
      ctx.user._id
    );
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "takeoffPriceHistory",
      recordId: id,
      entityLabel: `Preço por kg: ${baseMaterialLabel(args.material)}`,
      details: `${args.date}: R$ ${price}/kg${note ? ` (${note})` : ""}`,
    });
    await publishCurrentPrice(ctx, args.material, now);
    return id;
  },
});

/** Remove um registro de preço; o preço publicado volta ao registro anterior. */
export const removePriceRecord = takeoffConfigMutation({
  args: { id: v.id("takeoffPriceHistory") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const record = await ctx.db.get("takeoffPriceHistory", id);
    if (!record) throw new Error("Registro de preço não encontrado");
    await ctx.db.delete("takeoffPriceHistory", id);
    await logAudit(ctx, ctx.user, {
      action: "delete",
      tableName: "takeoffPriceHistory",
      recordId: id,
      entityLabel: `Preço por kg: ${baseMaterialLabel(record.material)}`,
      snapshotBefore: record,
    });
    await publishCurrentPrice(ctx, record.material, Date.now());
    return null;
  },
});

/** Publica o preço em vigor de um insumo (o do último registro) se ele mudou. */
async function publishCurrentPrice(
  ctx: MutationCtx & { user: Doc<"users"> },
  material: string,
  now: number
) {
  const change = await syncTakeoffBasePrice(ctx, material, ctx.user._id, now);
  if (!change) return;
  await logAudit(ctx, ctx.user, {
    action: change.before ? "update" : "create",
    tableName: "takeoffSettings",
    recordId: change.id,
    entityLabel: "Preços por kg",
    snapshotBefore: change.before ?? undefined,
    snapshotAfter: change.after,
  });
}

/** Pontos devolvidos por insumo no histórico (os mais recentes). */
const PRICE_HISTORY_LIMIT = 200;

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
  handler: async (ctx) => {
    const names = new Map<Id<"users">, string | null>();
    const nameOf = async (userId: Id<"users"> | undefined) => {
      if (!userId) return null;
      if (!names.has(userId)) {
        names.set(userId, (await ctx.db.get("users", userId))?.name ?? null);
      }
      return names.get(userId) ?? null;
    };
    const out = [];
    for (const { key } of BASE_MATERIALS) {
      const rows = await ctx.db
        .query("takeoffPriceHistory")
        .withIndex("by_material_recordedAt", (q) => q.eq("material", key))
        .order("desc")
        .take(PRICE_HISTORY_LIMIT);
      for (const row of rows.reverse()) {
        out.push({
          id: row._id,
          material: row.material,
          price: row.price,
          recordedAt: row.recordedAt,
          recordedBy: await nameOf(row.recordedByUserId),
          note: row.note ?? null,
        });
      }
    }
    return out;
  },
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
  handler: async (ctx) => {
    if (await ctx.db.query("takeoffPriceHistory").first()) return 0;
    const setting = await getTakeoffSetting(ctx, "basePrices");
    if (!setting) return 0;
    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_record", (q) =>
        q.eq("tableName", "takeoffSettings").eq("recordId", setting._id)
      )
      .take(1000);
    let previous: BasePrices | null = null;
    let recorded = 0;
    for (const log of logs) {
      if (!log.snapshotAfter) continue;
      let prices: BasePrices;
      try {
        prices = (JSON.parse(log.snapshotAfter) as { prices?: BasePrices }).prices ?? {};
      } catch {
        continue;
      }
      recorded += await recordTakeoffPriceChanges(ctx, previous, prices, log.userId, log.createdAt);
      previous = prices;
    }
    // sem auditoria (ou incompleta): o preço em vigor entra na data da última publicação
    if (setting.updatedByUserId) {
      recorded += await recordTakeoffPriceChanges(
        ctx,
        previous,
        setting.prices,
        setting.updatedByUserId,
        setting.updatedAt
      );
    }
    return recorded;
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
