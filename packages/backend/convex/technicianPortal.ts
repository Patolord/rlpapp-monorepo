import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { STAFF_ROLES, authedQuery } from "./lib/rbac";
import {
  assertTechnicianProjectAccess,
  isProjectArchived,
  resolveCustomerLabel,
  resolveProjectByIdentifier,
} from "./lib/projects/helpers";
import { listVisibleDocuments } from "./lib/projects/documents";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

export { assertTechnicianProjectAccess };

// Portal do técnico em campo: lista obras atribuídas (technicianIds) e os
// QRs/equipamentos de cada obra. Staff enxerga todas as obras.

function isStaff(user: Doc<"users">): boolean {
  return STAFF_ROLES.includes(user.role);
}

const myProjectValidator = v.object({
  _id: v.id("projects"),
  name: v.string(),
  slug: v.union(v.string(), v.null()),
  legacyNumber: v.union(v.number(), v.null()),
  client: v.union(v.string(), v.null()),
  address: v.union(v.string(), v.null()),
  status: v.union(v.string(), v.null()),
  qrCount: v.number(),
  registeredCount: v.number(),
  // Documentos (PDF) que este usuário pode ver nesta obra.
  documentCount: v.number(),
});

async function buildMyProjectRow(
  ctx: QueryCtx,
  user: Doc<"users">,
  project: Doc<"projects">,
  customerLabelCache: Map<string, string | null>
) {
  const qrCodes = await ctx.db
    .query("qrCodes")
    .withIndex("by_project", (q) => q.eq("projectId", project._id))
    .collect();
  const registeredCount = qrCodes.filter((q) => q.equipmentId).length;
  const documents = await listVisibleDocuments(ctx, user, project);
  return {
    _id: project._id,
    name: project.name,
    slug: project.slug ?? null,
    legacyNumber: project.legacyNumber ?? null,
    client: await resolveCustomerLabel(ctx, project, customerLabelCache),
    address: project.address ?? null,
    status: project.status ?? null,
    qrCount: qrCodes.length,
    registeredCount,
    documentCount: documents.length,
  };
}

export const listMyProjects = authedQuery({
  args: {},
  returns: v.array(myProjectValidator),
  handler: async (ctx) => {
    const staff = isStaff(ctx.user);
    const customerLabelCache = new Map<string, string | null>();
    const allProjects = await ctx.db.query("projects").collect();
    const visible = allProjects.filter((p) => {
      // Obras arquivadas somem do campo; o escritório ainda as vê na engenharia.
      if (isProjectArchived(p)) return false;
      return staff || (p.technicianIds ?? []).includes(ctx.user._id);
    });

    const out = [];
    for (const project of visible) {
      out.push(
        await buildMyProjectRow(ctx, ctx.user, project, customerLabelCache)
      );
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  },
});

// Resumo de uma obra para o hub do técnico. Aceita slug ou id na URL.
// Retorna null quando a obra não existe; lança erro quando não há acesso.
export const getMyProject = authedQuery({
  args: { identifier: v.string() },
  returns: v.union(myProjectValidator, v.null()),
  handler: async (ctx, args) => {
    const project = await resolveProjectByIdentifier(ctx, args.identifier);
    if (!project || isProjectArchived(project)) return null;
    await assertTechnicianProjectAccess(ctx, ctx.user, project._id);
    return await buildMyProjectRow(ctx, ctx.user, project, new Map());
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

type QrRow = Awaited<ReturnType<typeof buildQrRow>>;

function qrRowMatchesSearch(row: QrRow, term: string): boolean {
  return [
    row.token,
    row.description,
    row.modelo,
    row.ambiente,
    row.batchName,
  ].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term));
}

const browsableProjectValidator = v.object({
  _id: v.id("projects"),
  name: v.string(),
  legacyNumber: v.union(v.number(), v.null()),
  client: v.union(v.string(), v.null()),
  address: v.union(v.string(), v.null()),
  status: v.union(v.string(), v.null()),
  qrCount: v.number(),
  registeredCount: v.number(),
});

const qrBrowseFilterValidator = v.union(
  v.literal("all"),
  v.literal("registered"),
  v.literal("free")
);

// Catálogo de campo: qualquer usuário autenticado pode localizar etiquetas de
// equipamento por obra, mesmo sem estar atribuído como técnico. Isso não concede
// permissões administrativas sobre a obra ou sobre os lotes.
export const listBrowsableProjects = authedQuery({
  args: {},
  returns: v.array(browsableProjectValidator),
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").collect();
    const customerLabelCache = new Map<string, string | null>();
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
          client: await resolveCustomerLabel(ctx, project, customerLabelCache),
          address: project.address ?? null,
          status: project.status ?? null,
          qrCount: activeQrs.length,
          registeredCount: activeQrs.filter((qr) => qr.equipmentId).length,
        };
      })
    );

    return withQrs
      .filter((project) => project !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

// Busca e filtro são aplicados no servidor antes da paginação; filtrar só a
// página carregada no cliente escondia etiquetas de obras grandes.
export const listBrowsableQrsByProject = authedQuery({
  args: {
    projectId: v.id("projects"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    filter: v.optional(qrBrowseFilterValidator),
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

    const filter = args.filter ?? "all";
    const activeQrs = (
      await collectActiveQrsForProject(ctx, args.projectId)
    ).filter((qr) => {
      if (filter === "registered") return Boolean(qr.equipmentId);
      if (filter === "free") return !qr.equipmentId;
      return true;
    });
    activeQrs.sort((a, b) => b.createdAt - a.createdAt);

    const start = args.paginationOpts.cursor
      ? Number.parseInt(args.paginationOpts.cursor, 10)
      : 0;
    const end = start + args.paginationOpts.numItems;

    const term = (args.search ?? "").trim().toLocaleLowerCase("pt-BR");
    if (!term) {
      const page = activeQrs.slice(start, end);
      return {
        page: await Promise.all(page.map((qr) => buildQrRow(ctx, qr))),
        isDone: end >= activeQrs.length,
        continueCursor: String(end),
      };
    }

    const rows = await Promise.all(activeQrs.map((qr) => buildQrRow(ctx, qr)));
    const matches = rows.filter((row) => qrRowMatchesSearch(row, term));
    return {
      page: matches.slice(start, end),
      isDone: end >= matches.length,
      continueCursor: String(end),
    };
  },
});
