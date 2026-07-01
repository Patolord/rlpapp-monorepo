import { v } from "convex/values";
import { engineeringQuery } from "./lib/functions";
import { projectStatus } from "./schema";
import type { Doc, Id } from "./_generated/dataModel";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Visão geral consolidada para o dashboard do diretor. Agrega dados já
// existentes (obras, equipamentos planejados, checklists, histórico, ambientes,
// manutenções e QR codes) sem depender de tabelas novas.
//
// Recebe `now` como argumento para manter a query determinística/cacheável.
export const getDirectorOverview = engineeringQuery({
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
    const now = args.now;
    const weekAgo = now - 7 * MS_PER_DAY;
    const startOfMonth = new Date(now);
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const monthStart = startOfMonth.getTime();

    // --- Coletas base ---
    const projects = await ctx.db.query("projects").order("desc").collect();
    const equipmentItems = await ctx.db.query("projectEquipment").collect();
    const environments = await ctx.db.query("environments").collect();
    const checklistItems = await ctx.db.query("checklistItems").collect();

    // --- Mapa de itens planejados por obra (para progresso e rótulos) ---
    const itemsByProject = new Map<Id<"projects">, Doc<"projectEquipment">[]>();
    const labelByItem = new Map<Id<"projectEquipment">, string>();
    const projectByItem = new Map<Id<"projectEquipment">, Id<"projects">>();
    const itemsWithEnvironment = new Set<Id<"environments">>();

    for (const item of equipmentItems) {
      const list = itemsByProject.get(item.projectId);
      if (list) list.push(item);
      else itemsByProject.set(item.projectId, [item]);
      labelByItem.set(item._id, `${item.system} · ${item.ambiente}`);
      projectByItem.set(item._id, item.projectId);
      if (item.environmentId) itemsWithEnvironment.add(item.environmentId);
    }

    const projectNames = new Map<Id<"projects">, string>();
    for (const project of projects) projectNames.set(project._id, project.name);

    // --- KPIs de obras ---
    let activeProjects = 0;
    let newProjectsThisMonth = 0;
    let overdueProjects = 0;
    let openWorkItems = 0;

    const projectSummaries = projects.map((project) => {
      const items = itemsByProject.get(project._id) ?? [];
      const totalItems = items.length;
      const installedItems = items.filter(
        (i) => i.status === "operational"
      ).length;
      const pct =
        totalItems === 0 ? 0 : Math.round((installedItems / totalItems) * 100);
      openWorkItems += totalItems - installedItems;

      const isActive = project.status !== "completed";
      if (isActive) activeProjects++;
      if (project.createdAt >= monthStart) newProjectsThisMonth++;

      const overdue =
        isActive &&
        project.endDate !== undefined &&
        project.endDate < now &&
        pct < 100;
      if (overdue) overdueProjects++;

      return {
        _id: project._id,
        name: project.name,
        address: project.address ?? null,
        status: project.status ?? null,
        totalItems,
        installedItems,
        pct,
        endDate: project.endDate ?? null,
        overdue,
        isActive,
        createdAt: project.createdAt,
      };
    });

    // Obras ativas primeiro, mais recentes no topo; devolve as principais.
    const projectsForUi = projectSummaries
      .filter((p) => p.isActive)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 6)
      .map(({ isActive: _isActive, createdAt: _createdAt, ...rest }) => rest);

    // --- Equipamentos ---
    const totalEquipment = equipmentItems.length;
    const newEquipmentThisMonth = equipmentItems.filter(
      (i) => i._creationTime >= monthStart
    ).length;

    // --- Checklists (conformidade geral) ---
    const totalChecklistItems = checklistItems.length;
    const completedChecklistItems = checklistItems.filter(
      (i) => i.completed
    ).length;
    const checklistCompliance =
      totalChecklistItems === 0
        ? 0
        : Math.round((completedChecklistItems / totalChecklistItems) * 100);

    // --- Ambientes sem equipamento vinculado ---
    const environmentsWithoutEquipment = environments.filter(
      (env) => !itemsWithEnvironment.has(env._id)
    ).length;

    // --- QR codes ---
    const qrCodes = await ctx.db.query("qrCodes").order("desc").take(5000);
    const qrLinked = qrCodes.filter((qr) => qr.equipmentId).length;

    // --- Atividades recentes (histórico de equipamentos, cross-obra) ---
    const history = await ctx.db.query("equipmentHistory").order("desc").take(50);
    const resolvedNames = new Map<Id<"users">, string>();
    async function resolveName(userId: Id<"users">): Promise<string> {
      const cached = resolvedNames.get(userId);
      if (cached !== undefined) return cached;
      const user = await ctx.db.get("users", userId);
      const name = user?.name ?? "Desconhecido";
      resolvedNames.set(userId, name);
      return name;
    }

    const recentActivity = [];
    for (const h of history.slice(0, 6)) {
      const projectId = projectByItem.get(h.equipmentId);
      recentActivity.push({
        _id: h._id,
        action: h.action,
        userName: await resolveName(h.userId),
        equipmentLabel: labelByItem.get(h.equipmentId) ?? "Equipamento",
        projectName: projectId
          ? projectNames.get(projectId) ?? "Obra"
          : "Obra",
        createdAt: h.createdAt,
      });
    }

    // --- Resumo semanal ---
    const checklistsCompleted = checklistItems.filter(
      (i) => i.completedAt !== undefined && i.completedAt >= weekAgo
    ).length;
    const equipmentRegistered = equipmentItems.filter(
      (i) => i._creationTime >= weekAgo
    ).length;
    const environmentsUpdated = environments.filter(
      (env) => env.createdAt >= weekAgo
    ).length;
    const maintenanceLogsList = await ctx.db
      .query("maintenanceLogs")
      .order("desc")
      .take(1000);
    const maintenanceLogsCount = maintenanceLogsList.filter(
      (log) => log.createdAt >= weekAgo
    ).length;

    return {
      kpis: {
        activeProjects,
        newProjectsThisMonth,
        totalEquipment,
        newEquipmentThisMonth,
        checklistCompliance,
        openWorkItems,
        qrTotal: qrCodes.length,
        qrLinked,
      },
      projects: projectsForUi,
      criticalPending: {
        overdueProjects,
        environmentsWithoutEquipment,
        openWorkItems,
      },
      recentActivity,
      weeklySummary: {
        checklistsCompleted,
        equipmentRegistered,
        environmentsUpdated,
        maintenanceLogs: maintenanceLogsCount,
      },
    };
  },
});
