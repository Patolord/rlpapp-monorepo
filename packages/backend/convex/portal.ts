import { v } from "convex/values";
import { authedQuery } from "./lib/rbac";
import { hierarchyReturnValidator } from "./model/engineering/hierarchy";
import {
  getPortalProjectHierarchy,
  getPortalProjectSummary,
  listPortalProjects,
} from "./model/engineering/portal";

// Portal do cliente: somente leitura. Um cliente vê apenas as obras em que
// está listado (project.clientIds). Equipe interna enxerga todas.

export const listMyProjects = authedQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("projects"),
      name: v.string(),
      legacyNumber: v.union(v.number(), v.null()),
      client: v.union(v.string(), v.null()),
      address: v.union(v.string(), v.null()),
      status: v.union(v.string(), v.null()),
      total: v.number(),
      installed: v.number(),
      pct: v.number(),
    })
  ),
  handler: async (ctx) => await listPortalProjects(ctx, ctx.user),
});

export const getProjectHierarchy = authedQuery({
  args: { projectId: v.id("projects") },
  returns: hierarchyReturnValidator,
  handler: async (ctx, args) =>
    await getPortalProjectHierarchy(ctx, ctx.user, args.projectId),
});

export const getProjectSummary = authedQuery({
  args: { projectId: v.id("projects"), now: v.number() },
  returns: v.object({
    _id: v.id("projects"),
    name: v.string(),
    legacyNumber: v.union(v.number(), v.null()),
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
  handler: async (ctx, args) =>
    await getPortalProjectSummary(ctx, ctx.user, { projectId: args.projectId, now: args.now }),
});
