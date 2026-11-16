import { notify } from "../notifications/notify";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { diffFields, logAudit } from "../../lib/audit";
import { hasRole } from "../../lib/rbac";
import { normalizeFloors } from "./floors";
import { assertUniqueLegacyNumber, isProjectArchived } from "./projects";
import { generateUniqueProjectSlug } from "./slug";
import { notFound, ruleViolation } from "../../lib/domainErrors";

type ProjectStatus = NonNullable<Doc<"projects">["status"]>;
type FloorInput = { number: number; label: string };

export type CreateProjectInput = {
  name: string;
  floors?: FloorInput[];
  customerId: Id<"customers">;
  legacyNumber: number;
  client?: string;
  address?: string;
  status?: ProjectStatus;
  responsibleId?: Id<"users">;
  startDate?: number;
  endDate?: number;
};

export type UpdateProjectInput = {
  projectId: Id<"projects">;
  name?: string;
  floors?: FloorInput[];
  customerId?: Id<"customers"> | null;
  legacyNumber?: number;
  client?: string | null;
  address?: string | null;
  status?: ProjectStatus;
  responsibleId?: Id<"users"> | null;
  startDate?: number | null;
  endDate?: number | null;
};

export type RestoreProjectInput = {
  projectId: Id<"projects">;
  status?: Exclude<ProjectStatus, "archived">;
};

function projectSnapshot(project: Doc<"projects">) {
  return {
    name: project.name,
    legacyNumber: project.legacyNumber,
    customerId: project.customerId,
    client: project.client,
    address: project.address,
    status: project.status,
    responsibleId: project.responsibleId,
    startDate: project.startDate,
    endDate: project.endDate,
    portalUserIds: project.portalUserIds,
    clientIds: project.clientIds,
    archivedAt: project.archivedAt,
  };
}

async function assertActiveCustomer(
  ctx: MutationCtx,
  customerId: Id<"customers">
): Promise<void> {
  const customer = await ctx.db.get("customers", customerId);
  if (!customer) throw notFound("Cliente não encontrado");
  if (customer.archivedAt || !customer.active) {
    throw ruleViolation("Cliente inativo — selecione outro ou restaure o cliente");
  }
}

// --- Criação ---

export async function createProject(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: CreateProjectInput
): Promise<Id<"projects">> {
  const name = args.name.trim();
  if (!name) throw ruleViolation("O nome da obra é obrigatório");

  await assertActiveCustomer(ctx, args.customerId);
  await assertUniqueLegacyNumber(ctx, args.legacyNumber);

  const slug = await generateUniqueProjectSlug(ctx, name);

  const projectId = await ctx.db.insert("projects", {
    name,
    slug,
    floors: args.floors ? normalizeFloors(args.floors) : [],
    customerId: args.customerId,
    legacyNumber: args.legacyNumber,
    client: args.client?.trim() || undefined,
    address: args.address?.trim() || undefined,
    status: args.status ?? "planning",
    responsibleId: args.responsibleId,
    startDate: args.startDate,
    endDate: args.endDate,
    createdAt: Date.now(),
  });
  await logAudit(ctx, user, {
    action: "create",
    tableName: "projects",
    recordId: projectId,
    entityLabel: name,
    details: name,
    snapshotAfter: {
      name,
      customerId: args.customerId,
      legacyNumber: args.legacyNumber,
    },
  });
  return projectId;
}

// --- Edição ---

export async function updateProject(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: UpdateProjectInput
): Promise<Id<"projects">> {
  const project = await ctx.db.get("projects", args.projectId);
  if (!project) throw notFound("Obra não encontrada");
  if (isProjectArchived(project)) {
    throw ruleViolation("Obra arquivada — restaure antes de editar");
  }

  const before = projectSnapshot(project);
  const updates: Record<string, unknown> = {};
  if (args.name !== undefined) {
    const name = args.name.trim();
    if (!name) throw ruleViolation("O nome da obra é obrigatório");
    updates.name = name;
  }
  if (args.floors !== undefined) {
    updates.floors = normalizeFloors(args.floors);
  }
  if (args.customerId !== undefined) {
    if (args.customerId === null) {
      throw ruleViolation("A obra precisa estar vinculada a um cliente");
    }
    await assertActiveCustomer(ctx, args.customerId);
    updates.customerId = args.customerId;
  }
  if (args.legacyNumber !== undefined) {
    await assertUniqueLegacyNumber(ctx, args.legacyNumber, args.projectId);
    updates.legacyNumber = args.legacyNumber;
  }
  if (args.client !== undefined) {
    updates.client = args.client === null ? undefined : args.client.trim() || undefined;
  }
  if (args.address !== undefined) {
    updates.address =
      args.address === null ? undefined : args.address.trim() || undefined;
  }
  if (args.status !== undefined) {
    if (args.status === "archived") {
      throw ruleViolation("Use archive para arquivar a obra");
    }
    updates.status = args.status;
  }
  if (args.responsibleId !== undefined) {
    updates.responsibleId = args.responsibleId === null ? undefined : args.responsibleId;
  }
  if (args.startDate !== undefined) {
    updates.startDate = args.startDate === null ? undefined : args.startDate;
  }
  if (args.endDate !== undefined) {
    updates.endDate = args.endDate === null ? undefined : args.endDate;
  }

  await ctx.db.patch("projects", args.projectId, updates);
  const afterDoc = await ctx.db.get("projects", args.projectId);
  await logAudit(ctx, user, {
    action: "update",
    tableName: "projects",
    recordId: args.projectId,
    entityLabel: afterDoc?.name ?? project.name,
    changes: diffFields(before, projectSnapshot(afterDoc!), [
      "name",
      "legacyNumber",
      "customerId",
      "client",
      "address",
      "status",
      "responsibleId",
      "startDate",
      "endDate",
      "portalUserIds",
      "clientIds",
      "archivedAt",
    ]),
    snapshotBefore: before,
    snapshotAfter: afterDoc ? projectSnapshot(afterDoc) : undefined,
  });
  return args.projectId;
}

// --- Acessos (portal e técnicos) ---

async function replacePortalUsers(
  ctx: MutationCtx,
  user: Doc<"users">,
  projectId: Id<"projects">,
  userIds: Id<"users">[],
  audit: { action: string; describe: (count: number) => string }
): Promise<void> {
  const project = await ctx.db.get("projects", projectId);
  if (!project) throw notFound("Obra não encontrada");
  if (isProjectArchived(project)) {
    throw ruleViolation("Obra arquivada — restaure antes de alterar acessos");
  }

  const before = projectSnapshot(project);
  const valid: Id<"users">[] = [];
  for (const userId of userIds) {
    const candidate = await ctx.db.get("users", userId);
    if (candidate) valid.push(candidate._id);
  }

  await ctx.db.patch("projects", projectId, {
    portalUserIds: valid.length > 0 ? valid : undefined,
    // Mantém legado em sincronia durante a transição.
    clientIds: valid.length > 0 ? valid : undefined,
  });

  const afterDoc = await ctx.db.get("projects", projectId);
  await logAudit(ctx, user, {
    action: audit.action,
    tableName: "projects",
    recordId: projectId,
    entityLabel: project.name,
    details: audit.describe(valid.length),
    changes: diffFields(before, projectSnapshot(afterDoc!), [
      "portalUserIds",
      "clientIds",
    ]),
    snapshotBefore: before,
    snapshotAfter: afterDoc ? projectSnapshot(afterDoc) : undefined,
  });
}

/** Define quais usuários do portal podem ver a obra. */
export async function setProjectPortalUsers(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: { projectId: Id<"projects">; portalUserIds: Id<"users">[] }
): Promise<void> {
  await replacePortalUsers(ctx, user, args.projectId, args.portalUserIds, {
    action: "set_portal_users",
    describe: (count) => `${count} usuário(s)`,
  });
}

/** Variante legada de `setProjectPortalUsers` (audita como `set_clients`). */
export async function setProjectClientsLegacy(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: { projectId: Id<"projects">; clientIds: Id<"users">[] }
): Promise<void> {
  await replacePortalUsers(ctx, user, args.projectId, args.clientIds, {
    action: "set_clients",
    describe: (count) => `${count} cliente(s)`,
  });
}

/** Define quais técnicos podem listar QRs/equipamentos desta obra em campo. */
export async function setProjectTechnicians(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: { projectId: Id<"projects">; technicianIds: Id<"users">[] }
): Promise<void> {
  const project = await ctx.db.get("projects", args.projectId);
  if (!project) throw notFound("Obra não encontrada");
  if (isProjectArchived(project)) {
    throw ruleViolation("Obra arquivada — restaure antes de alterar técnicos");
  }

  const valid: Id<"users">[] = [];
  for (const userId of args.technicianIds) {
    const candidate = await ctx.db.get("users", userId);
    if (!candidate || !candidate.isActive) continue;
    // Aceita técnicos de campo e equipe (técnicos internos também atuam em campo).
    if (hasRole(candidate, "client")) continue;
    valid.push(candidate._id);
  }

  await ctx.db.patch("projects", args.projectId, {
    technicianIds: valid.length > 0 ? valid : undefined,
  });
  await logAudit(ctx, user, {
    action: "set_technicians",
    tableName: "projects",
    recordId: args.projectId,
    entityLabel: project.name,
    details: `${valid.length} técnico(s)`,
  });

  // N7: só quem entrou na lista agora.
  const before = new Set(project.technicianIds ?? []);
  const added = valid.filter((id) => !before.has(id));
  await notify(
    ctx,
    added,
    {
      kind: "N7",
      category: "obras_documentos",
      title: "Nova obra na sua lista",
      body: `Você foi incluído na obra ${project.name}.`,
      target: "obra",
      params: { projectId: args.projectId },
      projectId: args.projectId,
    },
    { actorId: user._id }
  );
}

// --- Arquivamento ---

/** Arquiva a obra (idempotente). `details` diferencia chamadas de compatibilidade. */
export async function archiveProject(
  ctx: MutationCtx,
  user: Doc<"users">,
  projectId: Id<"projects">,
  options: { details?: string } = {}
): Promise<void> {
  const project = await ctx.db.get("projects", projectId);
  if (!project) throw notFound("Obra não encontrada");
  if (isProjectArchived(project)) return;

  const now = Date.now();
  const before = projectSnapshot(project);
  await ctx.db.patch("projects", projectId, {
    status: "archived",
    archivedAt: now,
    archivedByUserId: user._id,
  });

  await logAudit(ctx, user, {
    action: "archive",
    tableName: "projects",
    recordId: projectId,
    entityLabel: project.name,
    ...(options.details !== undefined ? { details: options.details } : {}),
    snapshotBefore: before,
    snapshotAfter: {
      ...before,
      status: "archived",
      archivedAt: now,
    },
  });
}

export async function restoreProject(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: RestoreProjectInput
): Promise<void> {
  const project = await ctx.db.get("projects", args.projectId);
  if (!project) throw notFound("Obra não encontrada");
  if (!isProjectArchived(project)) return;

  const before = projectSnapshot(project);
  const nextStatus = args.status ?? "planning";
  await ctx.db.patch("projects", args.projectId, {
    status: nextStatus,
    archivedAt: undefined,
    archivedByUserId: undefined,
  });

  await logAudit(ctx, user, {
    action: "restore",
    tableName: "projects",
    recordId: args.projectId,
    entityLabel: project.name,
    snapshotBefore: before,
    snapshotAfter: {
      ...before,
      status: nextStatus,
      archivedAt: undefined,
    },
  });
}

// --- Manutenção ---

/** Backfill de uso único: gera slug para obras que ainda não têm. */
export async function backfillProjectSlugs(
  ctx: MutationCtx
): Promise<{ updated: number }> {
  const projects = await ctx.db.query("projects").collect();
  let updated = 0;

  for (const project of projects) {
    if (project.slug) continue;
    const slug = await generateUniqueProjectSlug(ctx, project.name, project._id);
    await ctx.db.patch("projects", project._id, { slug });
    updated += 1;
  }

  return { updated };
}
