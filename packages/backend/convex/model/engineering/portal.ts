/**
 * Portal do cliente (`convex/portal.ts`): somente leitura. Um cliente vê apenas
 * as obras em que está listado (project.clientIds). Equipe interna enxerga todas.
 */

import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { isStaff } from "../../lib/rbac";
import { buildProjectHierarchy } from "./hierarchy";
import { getPortalUserIds, isProjectArchived, resolveCustomerLabel } from "./projects";
import { forbidden } from "../../lib/accessErrors";
import { notFound, ruleViolation } from "../../lib/domainErrors";

async function assertProjectAccess(
  ctx: QueryCtx,
  user: Doc<"users">,
  projectId: Id<"projects">
): Promise<Doc<"projects">> {
  const project = await ctx.db.get("projects", projectId);
  if (!project) throw notFound("Obra não encontrada");
  if (isProjectArchived(project)) throw ruleViolation("Obra arquivada");
  if (isStaff(user)) return project;
  const allowed = getPortalUserIds(project).includes(user._id);
  if (!allowed) throw forbidden("Acesso negado a esta obra");
  return project;
}

/** Obras visíveis no portal, com o progresso de instalação. */
export async function listPortalProjects(ctx: QueryCtx, user: Doc<"users">) {
  const staff = isStaff(user);
  const customerLabelCache = new Map<string, string | null>();
  const allProjects = await ctx.db.query("projects").collect();
  const visible = staff
    ? allProjects.filter((p) => !isProjectArchived(p))
    : allProjects.filter(
        (p) => !isProjectArchived(p) && getPortalUserIds(p).includes(user._id)
      );

  const out = [];
  for (const project of visible) {
    const items = await ctx.db
      .query("projectEquipment")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();
    const total = items.length;
    const installed = items.filter((i) => i.status === "operational").length;
    const customerName = await resolveCustomerLabel(ctx, project, customerLabelCache);
    out.push({
      _id: project._id,
      name: project.name,
      legacyNumber: project.legacyNumber ?? null,
      client: customerName,
      address: project.address ?? null,
      status: project.status ?? null,
      total,
      installed,
      pct: total === 0 ? 0 : Math.round((installed / total) * 100),
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export async function getPortalProjectHierarchy(
  ctx: QueryCtx,
  user: Doc<"users">,
  projectId: Id<"projects">
) {
  await assertProjectAccess(ctx, user, projectId);
  return await buildProjectHierarchy(ctx, projectId);
}

export async function getPortalProjectSummary(
  ctx: QueryCtx,
  user: Doc<"users">,
  input: { projectId: Id<"projects">; now: number }
) {
  const project = await assertProjectAccess(ctx, user, input.projectId);
  const items = await ctx.db
    .query("projectEquipment")
    .withIndex("by_project", (q) => q.eq("projectId", input.projectId))
    .collect();
  const total = items.length;
  const installed = items.filter((i) => i.status === "operational").length;
  const overdue = items.filter(
    (i) => i.status !== "operational" && i.deadline !== undefined && i.deadline < input.now
  ).length;
  return {
    _id: project._id,
    name: project.name,
    legacyNumber: project.legacyNumber ?? null,
    client: (await resolveCustomerLabel(ctx, project)) ?? null,
    address: project.address ?? null,
    status: project.status ?? null,
    startDate: project.startDate ?? null,
    endDate: project.endDate ?? null,
    total,
    installed,
    overdue,
    pct: total === 0 ? 0 : Math.round((installed / total) * 100),
  };
}
