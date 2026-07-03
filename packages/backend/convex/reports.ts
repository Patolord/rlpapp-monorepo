import { v } from "convex/values";
import { engineeringQuery } from "./lib/rbac";
import type { Doc, Id } from "./_generated/dataModel";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Relatório consolidado de uma obra: progresso, por torre, por status,
// produtividade da equipe, tempo médio de instalação e atividade recente.
export const getProjectReport = engineeringQuery({
  args: { projectId: v.id("projects"), now: v.number() },
  returns: v.union(
    v.object({
      progress: v.object({
        total: v.number(),
        installed: v.number(),
        testing: v.number(),
        pending: v.number(),
        overdue: v.number(),
        pct: v.number(),
      }),
      byStatus: v.object({
        installing: v.number(),
        operational: v.number(),
        warning: v.number(),
        error: v.number(),
      }),
      byTower: v.array(
        v.object({
          towerId: v.union(v.id("towers"), v.null()),
          towerName: v.string(),
          total: v.number(),
          installed: v.number(),
          pct: v.number(),
        })
      ),
      productivity: v.array(
        v.object({
          userId: v.id("users"),
          userName: v.string(),
          installed: v.number(),
          tested: v.number(),
          finalized: v.number(),
        })
      ),
      averageInstallDays: v.union(v.number(), v.null()),
      recentActivity: v.array(
        v.object({
          _id: v.id("equipmentHistory"),
          action: v.string(),
          userName: v.string(),
          equipmentLabel: v.string(),
          createdAt: v.number(),
        })
      ),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) return null;

    const items = await ctx.db
      .query("projectEquipment")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const byStatus = { installing: 0, operational: 0, warning: 0, error: 0 };
    let installed = 0;
    let testing = 0;
    let pending = 0;
    let overdue = 0;
    let installDaysSum = 0;
    let installDaysCount = 0;

    for (const item of items) {
      byStatus[item.status]++;
      if (item.status === "operational") installed++;
      else if (item.status === "warning") testing++;
      else pending++;
      if (
        item.status !== "operational" &&
        item.deadline !== undefined &&
        item.deadline < args.now
      ) {
        overdue++;
      }
      if (item.scheduledDate && item.installationDate) {
        installDaysSum +=
          (item.installationDate - item.scheduledDate) / MS_PER_DAY;
        installDaysCount++;
      }
    }

    const total = items.length;
    const pct = total === 0 ? 0 : Math.round((installed / total) * 100);

    // Agrupa por torre (itens sem torre caem em "Sem torre").
    const towers = await ctx.db
      .query("towers")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const towerNames = new Map<Id<"towers">, string>();
    for (const t of towers) towerNames.set(t._id, t.name);

    type TowerAgg = {
      towerId: Id<"towers"> | null;
      towerName: string;
      total: number;
      installed: number;
    };
    const towerAgg = new Map<string, TowerAgg>();
    for (const item of items) {
      const key = item.towerId ?? "__none__";
      let agg = towerAgg.get(key);
      if (!agg) {
        agg = {
          towerId: item.towerId ?? null,
          towerName: item.towerId
            ? towerNames.get(item.towerId) ?? "Torre"
            : "Sem torre",
          total: 0,
          installed: 0,
        };
        towerAgg.set(key, agg);
      }
      agg.total++;
      if (item.status === "operational") agg.installed++;
    }
    const byTower = Array.from(towerAgg.values())
      .map((a) => ({
        towerId: a.towerId,
        towerName: a.towerName,
        total: a.total,
        installed: a.installed,
        pct: a.total === 0 ? 0 : Math.round((a.installed / a.total) * 100),
      }))
      .sort((a, b) => a.towerName.localeCompare(b.towerName));

    // Histórico: produtividade e atividade recente.
    const labelByItem = new Map<Id<"projectEquipment">, string>();
    for (const item of items) {
      labelByItem.set(item._id, `${item.system} · ${item.ambiente}`);
    }

    type Prod = {
      userId: Id<"users">;
      installed: number;
      tested: number;
      finalized: number;
    };
    const prodByUser = new Map<Id<"users">, Prod>();
    const allHistory: Doc<"equipmentHistory">[] = [];

    for (const item of items) {
      const history = await ctx.db
        .query("equipmentHistory")
        .withIndex("by_equipment", (q) => q.eq("equipmentId", item._id))
        .collect();
      for (const h of history) {
        allHistory.push(h);
        if (
          h.action === "installed" ||
          h.action === "tested" ||
          h.action === "finalized"
        ) {
          let p = prodByUser.get(h.userId);
          if (!p) {
            p = { userId: h.userId, installed: 0, tested: 0, finalized: 0 };
            prodByUser.set(h.userId, p);
          }
          if (h.action === "installed") p.installed++;
          else if (h.action === "tested") p.tested++;
          else p.finalized++;
        }
      }
    }

    const resolvedNames = new Map<Id<"users">, string>();
    async function resolveName(userId: Id<"users">): Promise<string> {
      const cached = resolvedNames.get(userId);
      if (cached !== undefined) return cached;
      const user = await ctx.db.get("users", userId);
      const name = user?.name ?? "Desconhecido";
      resolvedNames.set(userId, name);
      return name;
    }

    const productivity = [];
    for (const p of prodByUser.values()) {
      productivity.push({
        userId: p.userId,
        userName: await resolveName(p.userId),
        installed: p.installed,
        tested: p.tested,
        finalized: p.finalized,
      });
    }
    productivity.sort((a, b) => b.finalized - a.finalized);

    allHistory.sort((a, b) => b.createdAt - a.createdAt);
    const recentActivity = [];
    for (const h of allHistory.slice(0, 20)) {
      recentActivity.push({
        _id: h._id,
        action: h.action,
        userName: await resolveName(h.userId),
        equipmentLabel: labelByItem.get(h.equipmentId) ?? "Equipamento",
        createdAt: h.createdAt,
      });
    }

    return {
      progress: { total, installed, testing, pending, overdue, pct },
      byStatus,
      byTower,
      productivity,
      averageInstallDays:
        installDaysCount === 0
          ? null
          : Math.round((installDaysSum / installDaysCount) * 10) / 10,
      recentActivity,
    };
  },
});
