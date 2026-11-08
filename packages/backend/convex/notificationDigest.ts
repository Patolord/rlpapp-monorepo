/**
 * Resumos diários das 07:30 (A2 §2, N10, N11 e N13). Só saem quando há algo
 * a dizer. A contagem roda em consultas separadas por obra para não estourar
 * o limite de leitura de uma transação.
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { centralStockHealth } from "./lib/inventory/stockPolicy";
import {
  activeUsersInDepartment,
  engineeringDeciders,
  notify,
  plural,
} from "./lib/notifications";

const REVIEW_COUNT_CAP = 1000;

export const activeProjects = internalQuery({
  args: {},
  returns: v.array(v.id("projects")),
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").take(2000);
    return projects
      .filter((p) => p.status === undefined || p.status === "planning" || p.status === "in_progress")
      .map((p) => p._id);
  },
});

/** Equipamentos planejados que passaram do prazo sem ficar operacionais. */
export const overdueCount = internalQuery({
  args: { projectId: v.id("projects"), now: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    let count = 0;
    for await (const item of ctx.db
      .query("projectEquipment")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))) {
      if (item.status !== "operational" && item.deadline !== undefined && item.deadline < args.now) {
        count += 1;
      }
    }
    return count;
  },
});

export const queueCounts = internalQuery({
  args: {},
  returns: v.object({ review: v.number(), critical: v.number(), reorder: v.number() }),
  handler: async (ctx) => {
    const review = (
      await ctx.db
        .query("priceEvents")
        .withIndex("by_needs_review", (q) => q.eq("needsReview", true))
        .take(REVIEW_COUNT_CAP)
    ).length;

    const health = await centralStockHealth(ctx);
    const critical = health.critical;
    const reorder = health.reorder;
    return { review, critical, reorder };
  },
});

export const deliver = internalMutation({
  args: {
    overdue: v.array(v.object({ projectId: v.id("projects"), count: v.number() })),
    review: v.number(),
    critical: v.number(),
    reorder: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // N10: um resumo por engenheiro, com as obras dele.
    const byRecipient = new Map<Id<"users">, { projectId: Id<"projects">; name: string; count: number }[]>();
    for (const row of args.overdue) {
      if (row.count === 0) continue;
      const project = await ctx.db.get("projects", row.projectId);
      if (!project) continue;
      for (const userId of await engineeringDeciders(ctx, project)) {
        const list = byRecipient.get(userId) ?? [];
        list.push({ projectId: project._id, name: project.name, count: row.count });
        byRecipient.set(userId, list);
      }
    }
    for (const [userId, list] of byRecipient) {
      list.sort((a, b) => b.count - a.count);
      const [first, ...rest] = list;
      if (!first) continue;
      const body = [
        `${first.name}: ${plural(first.count, "equipamento passou", "equipamentos passaram")} do prazo.`,
        ...rest.map((r) => `${r.name}: ${r.count}.`),
      ].join(" ");
      await notify(ctx, [userId], {
        kind: "N10",
        category: "equipamentos",
        title: "Prazos vencidos",
        body,
        target: "predio_atraso",
        params: { projectId: first.projectId },
        projectId: list.length === 1 ? first.projectId : undefined,
      });
    }

    // N11: fila de revisão de preços.
    if (args.review > 0) {
      const label = args.review >= REVIEW_COUNT_CAP ? `Mais de ${REVIEW_COUNT_CAP} preços` : plural(args.review, "preço", "preços");
      await notify(ctx, await activeUsersInDepartment(ctx, "compras"), {
        kind: "N11",
        category: "compras_estoque",
        title: "Fila de revisão",
        body: `${label} esperando revisão.`,
        target: "revisao_precos",
      });
    }

    // N13: estoque baixo no central (rótulos do web: Crítico · Repor).
    if (args.critical + args.reorder > 0) {
      const parts: string[] = [];
      if (args.critical > 0) parts.push(plural(args.critical, "material crítico", "materiais críticos"));
      if (args.reorder > 0) parts.push(`${args.reorder} para repor`);
      const recipients = [
        ...(await activeUsersInDepartment(ctx, "estoque")),
        ...(await activeUsersInDepartment(ctx, "compras")),
      ];
      await notify(ctx, recipients, {
        kind: "N13",
        category: "compras_estoque",
        title: "Estoque baixo",
        body: `${parts.join(" e ")}.`,
        target: "estoque_repor",
      });
    }
    return null;
  },
});

export const daily = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const projectIds = await ctx.runQuery(internal.notificationDigest.activeProjects, {});
    const overdue: { projectId: Id<"projects">; count: number }[] = [];
    for (const projectId of projectIds) {
      const count = await ctx.runQuery(internal.notificationDigest.overdueCount, { projectId, now });
      if (count > 0) overdue.push({ projectId, count });
    }
    const counts = await ctx.runQuery(internal.notificationDigest.queueCounts, {});
    await ctx.runMutation(internal.notificationDigest.deliver, { overdue, ...counts });
    return null;
  },
});
