import { v } from "convex/values";
import { logAudit } from "./lib/audit";
import {
  engineeringOrPurchasingQuery,
  takeoffConfigMutation,
} from "./lib/rbac";
import {
  insertTakeoffKit,
  isFactoryKey,
  listActiveTakeoffKits,
  missingFactoryTakeoffKits,
  planTakeoffKitLinks,
  sanitizeTakeoffKitInput,
  seedFactoryTakeoffKits,
  takeoffKitInputValidator,
  takeoffKitLinkPlanValidator,
  takeoffKitRowValidator,
} from "./model/procurement/takeoffKits";

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
  handler: async (ctx) => {
    const kits = await listActiveTakeoffKits(ctx);
    const names = new Map<string, string | null>();
    const rows = [];
    for (const kit of kits) {
      let updatedBy: string | null = null;
      if (kit.updatedByUserId) {
        if (!names.has(kit.updatedByUserId)) {
          const user = await ctx.db.get("users", kit.updatedByUserId);
          names.set(kit.updatedByUserId, user?.name ?? null);
        }
        updatedBy = names.get(kit.updatedByUserId) ?? null;
      }
      rows.push({
        _id: kit._id,
        key: kit.key,
        name: kit.name,
        mode: kit.mode,
        label: kit.label ?? null,
        components: kit.components,
        sortOrder: kit.sortOrder,
        updatedAt: kit.updatedAt,
        updatedBy,
        factory: isFactoryKey(kit.key),
      });
    }
    return rows;
  },
});

/** Cria (sem `id`) ou substitui (com `id`) um kit padrão da empresa. */
export const save = takeoffConfigMutation({
  args: { id: v.optional(v.id("takeoffKits")), ...takeoffKitInputValidator.fields },
  returns: v.id("takeoffKits"),
  handler: async (ctx, { id, ...input }) => {
    const clean = sanitizeTakeoffKitInput(input);
    if (id === undefined) {
      const kitId = await insertTakeoffKit(ctx, clean, ctx.user._id);
      await logAudit(ctx, ctx.user, {
        action: "create",
        tableName: "takeoffKits",
        recordId: kitId,
        entityLabel: clean.name,
        snapshotAfter: clean,
      });
      return kitId;
    }
    const existing = await ctx.db.get("takeoffKits", id);
    if (!existing || !existing.active) throw new Error("Kit não encontrado");
    await ctx.db.patch("takeoffKits", id, {
      name: clean.name,
      mode: clean.mode,
      label: clean.label,
      components: clean.components,
      updatedAt: Date.now(),
      updatedByUserId: ctx.user._id,
    });
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "takeoffKits",
      recordId: id,
      entityLabel: clean.name,
      snapshotBefore: {
        name: existing.name,
        mode: existing.mode,
        label: existing.label,
        components: existing.components,
      },
      snapshotAfter: clean,
    });
    return id;
  },
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
    if (!existing || !existing.active) throw new Error("Kit não encontrado");
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
  handler: async (ctx) => {
    const added = await seedFactoryTakeoffKits(ctx, ctx.user._id);
    if (added > 0) {
      await logAudit(ctx, ctx.user, {
        action: "seed",
        tableName: "takeoffKits",
        recordId: "factory",
        details: `${added} kits de fábrica carregados`,
      });
    }
    return added;
  },
});

/**
 * Prévia de "Vincular ao catálogo": para cada kit ativo, os componentes que
 * ganham o código MAT do material de compras (pelo código que já têm, pelo
 * nome exato ou pela família e bitola: cobre, isolamento, cabo), os que ficam
 * sem código e se a ordem muda (cobre, isolamento, cabo, por bitola).
 */
export const catalogLinkPlan = engineeringOrPurchasingQuery({
  args: {},
  returns: v.array(takeoffKitLinkPlanValidator),
  handler: async (ctx) => await planTakeoffKitLinks(ctx),
});

/**
 * Aplica a prévia de `catalogLinkPlan` aos kits ativos (recalculada aqui, com
 * o catálogo do momento): grava código e nome do catálogo nos componentes
 * encontrados e ordena cobre, isolamento e cabo por bitola. Componentes sem
 * correspondência ficam como estão. Retorna quantos kits e componentes mudaram.
 */
export const applyCatalogLinks = takeoffConfigMutation({
  args: {},
  returns: v.object({ kits: v.number(), components: v.number() }),
  handler: async (ctx) => {
    let kits = 0;
    let components = 0;
    for (const plan of await planTakeoffKitLinks(ctx)) {
      if (plan.changes.length === 0 && !plan.reordered) continue;
      const existing = await ctx.db.get("takeoffKits", plan._id);
      if (!existing) continue;
      await ctx.db.patch("takeoffKits", plan._id, {
        components: plan.components,
        updatedAt: Date.now(),
        updatedByUserId: ctx.user._id,
      });
      await logAudit(ctx, ctx.user, {
        action: "update",
        tableName: "takeoffKits",
        recordId: plan._id,
        entityLabel: plan.name,
        details: "Vinculado ao catálogo de compras",
        snapshotBefore: { components: existing.components },
        snapshotAfter: { components: plan.components },
      });
      kits++;
      components += plan.changes.length;
    }
    return { kits, components };
  },
});
