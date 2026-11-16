import type { PaginationOptions } from "convex/server";
import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { seesAllFieldProjects } from "../../lib/rbac";
import { listVisibleDocuments } from "./documents";
import {
  assertTechnicianProjectAccess,
  isProjectArchived,
  resolveCustomerLabel,
  resolveProjectByIdentifier,
} from "./projects";
import { ruleViolation } from "../../lib/domainErrors";

// Portal do técnico em campo: obras atribuídas (technicianIds), resumo da
// obra no hub e o catálogo de etiquetas QR/equipamentos de cada obra.
// Staff enxerga todas as obras.

// ---------------------------------------------------------------------------
// Etiquetas ativas da obra
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Obras do técnico
// ---------------------------------------------------------------------------

async function buildMyProjectRow(
  ctx: QueryCtx,
  user: Doc<"users">,
  project: Doc<"projects">,
  customerLabelCache: Map<string, string | null>
) {
  // Mesma base de listBrowsableQrsByProject (só etiquetas ativas), para os
  // contadores do hub baterem com a lista de etiquetas.
  const qrCodes = await collectActiveQrsForProject(ctx, project._id);
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

export async function listMyFieldProjects(
  ctx: QueryCtx,
  user: Doc<"users">
) {
  const seesAll = seesAllFieldProjects(user);
  const customerLabelCache = new Map<string, string | null>();
  const allProjects = await ctx.db.query("projects").collect();
  const visible = allProjects.filter((p) => {
    // Obras arquivadas somem do campo; o escritório ainda as vê na engenharia.
    if (isProjectArchived(p)) return false;
    return seesAll || (p.technicianIds ?? []).includes(user._id);
  });

  const out = [];
  for (const project of visible) {
    out.push(
      await buildMyProjectRow(ctx, user, project, customerLabelCache)
    );
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/**
 * Resumo de uma obra para o hub do técnico (slug ou id). `null` quando a obra
 * não existe ou está arquivada; lança erro quando não há acesso.
 */
export async function getMyFieldProject(
  ctx: QueryCtx,
  user: Doc<"users">,
  identifier: string
) {
  const project = await resolveProjectByIdentifier(ctx, identifier);
  if (!project || isProjectArchived(project)) return null;
  await assertTechnicianProjectAccess(ctx, user, project._id);
  return await buildMyProjectRow(ctx, user, project, new Map());
}

/** Etiquetas vinculadas à obra, ordenadas por ambiente e token. */
export async function listProjectQrRows(
  ctx: QueryCtx,
  user: Doc<"users">,
  projectId: Id<"projects">
) {
  await assertTechnicianProjectAccess(ctx, user, projectId);

  const qrCodes = await ctx.db
    .query("qrCodes")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();

  const rows = await Promise.all(qrCodes.map((qr) => buildQrRow(ctx, qr)));

  return rows.sort(
    (a, b) =>
      (a.ambiente ?? "").localeCompare(b.ambiente ?? "") ||
      a.token.localeCompare(b.token)
  );
}

/**
 * Obra aberta no app de campo. Diferente de getMyFieldProject, nunca lança
 * "acesso negado": quem não está atribuído ainda consegue abrir a obra, e a
 * UI sinaliza isso pelo campo `assigned`. `null` se não existe/arquivada.
 */
export async function getFieldProjectSummary(
  ctx: QueryCtx,
  user: Doc<"users">,
  identifier: string
) {
  const project = await resolveProjectByIdentifier(ctx, identifier);
  if (!project || isProjectArchived(project)) return null;
  const activeQrs = await collectActiveQrsForProject(ctx, project._id);
  const documents = await listVisibleDocuments(ctx, user, project);
  return {
    _id: project._id,
    name: project.name,
    slug: project.slug ?? null,
    legacyNumber: project.legacyNumber ?? null,
    client: await resolveCustomerLabel(ctx, project, new Map()),
    address: project.address ?? null,
    status: project.status ?? null,
    qrCount: activeQrs.length,
    registeredCount: activeQrs.filter((qr) => qr.equipmentId).length,
    documentCount: documents.length,
    assigned:
      seesAllFieldProjects(user) ||
      (project.technicianIds ?? []).includes(user._id),
  };
}

// ---------------------------------------------------------------------------
// Catálogo de campo (qualquer usuário autenticado)
// ---------------------------------------------------------------------------

/** Obras não arquivadas que têm etiquetas ativas, com os contadores. */
export async function listBrowsableFieldProjects(ctx: QueryCtx) {
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
}

export type BrowsableQrPageInput = {
  projectId: Id<"projects">;
  paginationOpts: PaginationOptions;
  search?: string;
  filter?: "all" | "registered" | "free";
};

/**
 * Página de etiquetas ativas da obra. Busca e filtro são aplicados no
 * servidor antes da paginação (cursor = deslocamento numérico).
 */
export async function listBrowsableQrPage(
  ctx: QueryCtx,
  input: BrowsableQrPageInput
) {
  const project = await ctx.db.get("projects", input.projectId);
  if (!project || project.status === "archived" || project.archivedAt) {
    throw ruleViolation("Obra não disponível");
  }

  const filter = input.filter ?? "all";
  const activeQrs = (
    await collectActiveQrsForProject(ctx, input.projectId)
  ).filter((qr) => {
    if (filter === "registered") return Boolean(qr.equipmentId);
    if (filter === "free") return !qr.equipmentId;
    return true;
  });
  activeQrs.sort((a, b) => b.createdAt - a.createdAt);

  const start = input.paginationOpts.cursor
    ? Number.parseInt(input.paginationOpts.cursor, 10)
    : 0;
  const end = start + input.paginationOpts.numItems;

  const term = (input.search ?? "").trim().toLocaleLowerCase("pt-BR");
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
}
