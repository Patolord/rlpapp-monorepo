import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { STAFF_ROLES, authedQuery } from "./lib/rbac";
import { resolveCustomerLabel } from "./lib/projects/helpers";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

// Portal do técnico em campo: lista obras atribuídas (technicianIds) e os
// QRs/equipamentos de cada obra. Staff enxerga todas as obras.

function isStaff(user: Doc<"users">): boolean {
  return STAFF_ROLES.includes(user.role);
}

export async function assertTechnicianProjectAccess(
  ctx: QueryCtx,
  user: Doc<"users">,
  projectId: Id<"projects">
): Promise<Doc<"projects">> {
  const project = await ctx.db.get("projects", projectId);
  if (!project) throw new Error("Obra não encontrada");
  if (isStaff(user)) return project;
  const allowed = (project.technicianIds ?? []).includes(user._id);
  if (!allowed) throw new Error("Acesso negado a esta obra");
  return project;
}

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
      qrCount: v.number(),
      registeredCount: v.number(),
    })
  ),
  handler: async (ctx) => {
    const staff = isStaff(ctx.user);
    const allProjects = await ctx.db.query("projects").collect();
    const visible = staff
      ? allProjects
      : allProjects.filter((p) =>
          (p.technicianIds ?? []).includes(ctx.user._id)
        );

    const out = [];
    for (const project of visible) {
      const qrCodes = await ctx.db
        .query("qrCodes")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect();
      const registeredCount = qrCodes.filter((q) => q.equipmentId).length;
      out.push({
        _id: project._id,
        name: project.name,
        legacyNumber: project.legacyNumber ?? null,
        client: await resolveCustomerLabel(ctx, project),
        address: project.address ?? null,
        status: project.status ?? null,
        qrCount: qrCodes.length,
        registeredCount,
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  },
});

const qrRowValidator = v.object({
  _id: v.id("qrCodes"),
  token: v.string(),
  qrStatus: v.union(v.literal("active"), v.literal("inactive")),
  equipmentId: v.union(v.id("equipment"), v.null()),
  description: v.union(v.string(), v.null()),
  status: v.union(
    v.literal("installing"),
    v.literal("operational"),
    v.literal("warning"),
    v.literal("error"),
    v.null()
  ),
  ambiente: v.union(v.string(), v.null()),
  modelo: v.union(v.string(), v.null()),
  batchName: v.union(v.string(), v.null()),
});

async function collectBatchOnlyActiveQrs(
  ctx: QueryCtx,
  projectId: Id<"projects">
): Promise<Doc<"qrCodes">[]> {
  const out: Doc<"qrCodes">[] = [];
  const batches = await ctx.db
    .query("qrBatches")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  for (const batch of batches) {
    const batchCodes = await ctx.db
      .query("qrCodes")
      .withIndex("by_batchId", (q) => q.eq("batchId", batch.batchId))
      .collect();
    for (const qr of batchCodes) {
      if (qr.status === "active" && !qr.projectId) out.push(qr);
    }
  }
  return out;
}

async function collectActiveQrsForProject(
  ctx: QueryCtx,
  projectId: Id<"projects">
): Promise<Doc<"qrCodes">[]> {
  const byId = new Map<Id<"qrCodes">, Doc<"qrCodes">>();

  const byProject = await ctx.db
    .query("qrCodes")
    .withIndex("by_project_and_status", (q) =>
      q.eq("projectId", projectId).eq("status", "active")
    )
    .collect();
  for (const qr of byProject) byId.set(qr._id, qr);

  for (const qr of await collectBatchOnlyActiveQrs(ctx, projectId)) {
    byId.set(qr._id, qr);
  }

  return Array.from(byId.values());
}

async function buildQrRow(ctx: QueryCtx, qr: Doc<"qrCodes">) {
  const equipment = qr.equipmentId
    ? await ctx.db.get("equipment", qr.equipmentId)
    : null;
  const planned = equipment?.projectEquipmentId
    ? await ctx.db.get("projectEquipment", equipment.projectEquipmentId)
    : null;

  return {
    _id: qr._id,
    token: qr.token,
    qrStatus: qr.status,
    equipmentId: qr.equipmentId ?? null,
    description: equipment?.description ?? null,
    status: planned?.status ?? equipment?.status ?? null,
    ambiente: planned?.ambiente ?? null,
    modelo: planned?.modelo ?? null,
    batchName: qr.batchName ?? null,
  };
}

export const listQrsByProject = authedQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(qrRowValidator),
  handler: async (ctx, args) => {
    await assertTechnicianProjectAccess(ctx, ctx.user, args.projectId);

    const qrCodes = await ctx.db
      .query("qrCodes")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const rows = await Promise.all(qrCodes.map((qr) => buildQrRow(ctx, qr)));

    return rows.sort(
      (a, b) =>
        (a.ambiente ?? "").localeCompare(b.ambiente ?? "") ||
        a.token.localeCompare(b.token)
    );
  },
});

const browsableProjectValidator = v.object({
  _id: v.id("projects"),
  name: v.string(),
  legacyNumber: v.union(v.number(), v.null()),
  client: v.union(v.string(), v.null()),
  address: v.union(v.string(), v.null()),
  status: v.union(v.string(), v.null()),
});

// Catálogo de campo: qualquer usuário autenticado pode localizar etiquetas de
// equipamento por obra, mesmo sem estar atribuído como técnico. Isso não concede
// permissões administrativas sobre a obra ou sobre os lotes.
export const listBrowsableProjects = authedQuery({
  args: {},
  returns: v.array(browsableProjectValidator),
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").collect();
    const visible = projects.filter(
      (project) => project.status !== "archived" && !project.archivedAt
    );
    const withQrs = await Promise.all(
      visible.map(async (project) => {
        const activeQrs = await collectActiveQrsForProject(ctx, project._id);
        if (activeQrs.length === 0) return null;
        return {
          _id: project._id,
          name: project.name,
          legacyNumber: project.legacyNumber ?? null,
          client: await resolveCustomerLabel(ctx, project),
          address: project.address ?? null,
          status: project.status ?? null,
        };
      })
    );

    return withQrs
      .filter((project) => project !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listBrowsableQrsByProject = authedQuery({
  args: {
    projectId: v.id("projects"),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(qrRowValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
    pageStatus: v.optional(v.union(v.string(), v.null())),
    splitCursor: v.optional(v.union(v.string(), v.null())),
  }),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project || project.status === "archived" || project.archivedAt) {
      throw new Error("Obra não disponível");
    }

    const activeQrs = await collectActiveQrsForProject(ctx, args.projectId);
    activeQrs.sort((a, b) => b.createdAt - a.createdAt);

    const start = args.paginationOpts.cursor
      ? Number.parseInt(args.paginationOpts.cursor, 10)
      : 0;
    const end = start + args.paginationOpts.numItems;
    const page = activeQrs.slice(start, end);

    return {
      page: await Promise.all(page.map((qr) => buildQrRow(ctx, qr))),
      isDone: end >= activeQrs.length,
      continueCursor: String(end),
    };
  },
});
