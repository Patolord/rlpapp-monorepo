import { v } from "convex/values";
import { authedQuery } from "./lib/functions";
import { buildProjectHierarchy } from "./lib/hierarchy";
import { hierarchyReturnValidator } from "./projects";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

// Portal do cliente: somente leitura. Um cliente vê apenas as obras em que
// está listado (project.clientIds). Equipe interna enxerga todas.
const STAFF_ROLES = new Set([
  "director",
  "admin",
  "manager",
  "operator",
  "engenheiro",
]);

function isStaff(user: Doc<"users">): boolean {
  return STAFF_ROLES.has(user.role);
}

async function assertProjectAccess(
  ctx: QueryCtx,
  user: Doc<"users">,
  projectId: Id<"projects">
): Promise<Doc<"projects">> {
  const project = await ctx.db.get("projects", projectId);
  if (!project) throw new Error("Obra não encontrada");
  if (isStaff(user)) return project;
  const allowed = (project.clientIds ?? []).includes(user._id);
  if (!allowed) throw new Error("Acesso negado a esta obra");
  return project;
}

export const listMyProjects = authedQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("projects"),
      name: v.string(),
      client: v.union(v.string(), v.null()),
      address: v.union(v.string(), v.null()),
      status: v.union(v.string(), v.null()),
      total: v.number(),
      installed: v.number(),
      pct: v.number(),
    })
  ),
  handler: async (ctx) => {
    const staff = isStaff(ctx.user);
    const allProjects = await ctx.db.query("projects").collect();
    const visible = staff
      ? allProjects
      : allProjects.filter((p) => (p.clientIds ?? []).includes(ctx.user._id));

    const out = [];
    for (const project of visible) {
      const items = await ctx.db
        .query("projectEquipment")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect();
      const total = items.length;
      const installed = items.filter((i) => i.status === "operational").length;
      out.push({
        _id: project._id,
        name: project.name,
        client: project.client ?? null,
        address: project.address ?? null,
        status: project.status ?? null,
        total,
        installed,
        pct: total === 0 ? 0 : Math.round((installed / total) * 100),
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  },
});

export const getProjectHierarchy = authedQuery({
  args: { projectId: v.id("projects") },
  returns: hierarchyReturnValidator,
  handler: async (ctx, args) => {
    await assertProjectAccess(ctx, ctx.user, args.projectId);
    return await buildProjectHierarchy(ctx, args.projectId);
  },
});

export const getProjectSummary = authedQuery({
  args: { projectId: v.id("projects"), now: v.number() },
  returns: v.object({
    _id: v.id("projects"),
    name: v.string(),
    client: v.union(v.string(), v.null()),
    address: v.union(v.string(), v.null()),
    status: v.union(v.string(), v.null()),
    startDate: v.union(v.number(), v.null()),
    endDate: v.union(v.number(), v.null()),
    total: v.number(),
    installed: v.number(),
    overdue: v.number(),
    pct: v.number(),
  }),
  handler: async (ctx, args) => {
    const project = await assertProjectAccess(ctx, ctx.user, args.projectId);
    const items = await ctx.db
      .query("projectEquipment")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const total = items.length;
    const installed = items.filter((i) => i.status === "operational").length;
    const overdue = items.filter(
      (i) =>
        i.status !== "operational" &&
        i.deadline !== undefined &&
        i.deadline < args.now
    ).length;
    return {
      _id: project._id,
      name: project.name,
      client: project.client ?? null,
      address: project.address ?? null,
      status: project.status ?? null,
      startDate: project.startDate ?? null,
      endDate: project.endDate ?? null,
      total,
      installed,
      overdue,
      pct: total === 0 ? 0 : Math.round((installed / total) * 100),
    };
  },
});
