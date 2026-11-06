import { v } from "convex/values";
import {
  obrasQuery,
} from "./lib/rbac";
import { buildProjectReport } from "./model/engineering/reports";

// Relatório consolidado de uma obra: progresso, por torre, por status,
// produtividade da equipe, tempo médio de instalação e atividade recente.
export const getProjectReport = obrasQuery({
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
    return await buildProjectReport(ctx, args);
  },
});
