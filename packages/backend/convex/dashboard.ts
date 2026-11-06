import { v } from "convex/values";
import {
  obrasQuery,
} from "./lib/rbac";
import { projectStatus } from "./schema/engineering";
import { buildDirectorOverview } from "./model/engineering/dashboard";

// Visão geral consolidada para o dashboard do diretor. Agrega dados já
// existentes (obras, equipamentos planejados, checklists, histórico, ambientes,
// manutenções e QR codes) sem depender de tabelas novas.
//
// Recebe `now` como argumento para manter a query determinística/cacheável.
export const getDirectorOverview = obrasQuery({
  args: { now: v.number() },
  returns: v.object({
    kpis: v.object({
      activeProjects: v.number(),
      newProjectsThisMonth: v.number(),
      totalEquipment: v.number(),
      newEquipmentThisMonth: v.number(),
      checklistCompliance: v.number(),
      openWorkItems: v.number(),
      qrTotal: v.number(),
      qrLinked: v.number(),
    }),
    projects: v.array(
      v.object({
        _id: v.id("projects"),
        name: v.string(),
        slug: v.string(),
        address: v.union(v.string(), v.null()),
        status: v.union(projectStatus, v.null()),
        totalItems: v.number(),
        installedItems: v.number(),
        pct: v.number(),
        endDate: v.union(v.number(), v.null()),
        overdue: v.boolean(),
      })
    ),
    criticalPending: v.object({
      overdueProjects: v.number(),
      environmentsWithoutEquipment: v.number(),
      openWorkItems: v.number(),
    }),
    recentActivity: v.array(
      v.object({
        _id: v.id("equipmentHistory"),
        action: v.string(),
        userName: v.string(),
        equipmentLabel: v.string(),
        projectName: v.string(),
        createdAt: v.number(),
      })
    ),
    weeklySummary: v.object({
      checklistsCompleted: v.number(),
      equipmentRegistered: v.number(),
      environmentsUpdated: v.number(),
      maintenanceLogs: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    return await buildDirectorOverview(ctx, args.now);
  },
});
