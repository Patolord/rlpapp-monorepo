import { v } from "convex/values";
import { logAudit } from "./lib/audit";
import {
  engineeringOrPurchasingQuery,
  takeoffConfigMutation,
} from "./lib/rbac";
import {
  listTakeoffKitRows,
  missingFactoryTakeoffKits,
  saveTakeoffKit,
  seedTakeoffKitDefaults,
  takeoffKitInputValidator,
  takeoffKitRowValidator,
} from "./model/procurement/takeoffKits";
import { notFound } from "./lib/domainErrors";

/**
 * Kits (presets) do RLP Takeoff: os padrões da empresa, editados no dashboard
 * em App Takeoff → Kits por engenharia ou compras e publicados ao app desktop
 * junto com o catálogo (`takeoffCatalog.current`).
 * Cada usuário do app pode sobrescrever um kit localmente; o padrão daqui
 * vale para quem não mexeu nele.
 */

/** Kits ativos, na ordem de exibição, com quem os alterou por último. */
export const list = engineeringOrPurchasingQuery({
  args: {},
  returns: v.array(takeoffKitRowValidator),
  handler: async (ctx) => await listTakeoffKitRows(ctx),
});

/** Cria (sem `id`) ou substitui (com `id`) um kit padrão da empresa. */
export const save = takeoffConfigMutation({
  args: { id: v.optional(v.id("takeoffKits")), ...takeoffKitInputValidator.fields },
  returns: v.id("takeoffKits"),
  handler: async (ctx, { id, ...input }) => await saveTakeoffKit(ctx, ctx.user, id, input),
});

/**
 * Tira um kit dos padrões da empresa. Ele some do app na próxima atualização
 * do catálogo (quem o tinha alterado localmente continua com a sua versão);
 * a chave fica reservada, por isso é desativado e não apagado.
 */
export const remove = takeoffConfigMutation({
  args: { id: v.id("takeoffKits") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const existing = await ctx.db.get("takeoffKits", id);
    if (!existing || !existing.active) throw notFound("Kit não encontrado");
    await ctx.db.patch("takeoffKits", id, {
      active: false,
      updatedAt: Date.now(),
      updatedByUserId: ctx.user._id,
    });
    await logAudit(ctx, ctx.user, {
      action: "delete",
      tableName: "takeoffKits",
      recordId: id,
      entityLabel: existing.name,
    });
    return null;
  },
});

/**
 * Quantos kits de fábrica `seedDefaults` ainda acrescentaria: os cuja chave
 * não existe, nem ativa nem removida (um removido fica reservado).
 */
export const missingFactory = engineeringOrPurchasingQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => await missingFactoryTakeoffKits(ctx),
});

/**
 * Carrega os kits de fábrica do app (os que a empresa ainda não tem, pela
 * chave). Retorna quantos entraram.
 */
export const seedDefaults = takeoffConfigMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => await seedTakeoffKitDefaults(ctx, ctx.user),
});
