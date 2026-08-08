import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { engineeringMutation, engineeringQuery } from "./lib/rbac";
import { equipmentStatusValidator } from "./equipment";
import { projectStatus } from "./schema";
import { logAudit, diffFields } from "./lib/audit";
import { buildProjectHierarchy } from "./lib/engenharia/hierarchy";
import {
  assertUniqueLegacyNumber,
  isProjectArchived,
  resolveCustomerLabel,
} from "./lib/projects/helpers";
import {
  generateUniqueProjectSlug,
  looksLikeConvexId,
} from "./lib/engenharia/slug";
import type { Id } from "./_generated/dataModel";

const unitTypeValidator = v.union(v.literal("vrf"), v.literal("split"));
const equipKindValidator = v.union(
  v.literal("condensadora"),
  v.literal("evaporadora")
);

const floorValidator = v.object({
  number: v.number(),
  label: v.string(),
});
const floorsValidator = v.array(floorValidator);

function defaultFloorLabel(n: number): string {
  return n === 0 ? "Térreo" : `${n}º Andar`;
}

function normalizeFloors(floors: Array<{ number: number; label: string }>) {
  if (floors.length === 0) {
    throw new Error("A obra precisa de pelo menos um andar");
  }
  const seen = new Set<number>();
  for (const f of floors) {
    if (seen.has(f.number)) {
      throw new Error(`Andar ${f.number} duplicado`);
    }
    seen.add(f.number);
  }
  return floors
    .map((floor) => ({
      number: Math.floor(floor.number),
      label: floor.label.trim() || defaultFloorLabel(floor.number),
    }))
    .sort((a, b) => a.number - b.number);
}

/** Gera o rótulo padrão do apartamento: andar + final (ex: 2 + 1 = "201"). */
function autoUnitLabel(floor: number, final: number): string {
  return `${floor}${String(final).padStart(2, "0")}`;
}

function projectSnapshot(project: import("./_generated/dataModel").Doc<"projects">) {
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

// --- Listagem de obras (com progresso por ACs) ---

export const list = engineeringQuery({
  args: {
    includeArchived: v.optional(v.boolean()),
  },
  returns: v.array(
    v.object({
      _id: v.id("projects"),
      _creationTime: v.number(),
      name: v.string(),
      slug: v.string(),
      legacyNumber: v.union(v.number(), v.null()),
      floors: floorsValidator,
      client: v.union(v.string(), v.null()),
      customerId: v.union(v.id("customers"), v.null()),
      customerName: v.union(v.string(), v.null()),
      address: v.union(v.string(), v.null()),
      status: v.union(projectStatus, v.null()),
      responsibleId: v.union(v.id("users"), v.null()),
      responsibleName: v.union(v.string(), v.null()),
      startDate: v.union(v.number(), v.null()),
      endDate: v.union(v.number(), v.null()),
      createdAt: v.number(),
      archivedAt: v.union(v.number(), v.null()),
      totalItems: v.number(),
      installedItems: v.number(),
      unitCount: v.number(),
      towerCount: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    let projects = await ctx.db.query("projects").order("desc").collect();
    if (!args.includeArchived) {
      projects = projects.filter((p) => !isProjectArchived(p));
    }

    return await Promise.all(
      projects.map(async (project) => {
        const items = await ctx.db
          .query("projectEquipment")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect();
        const units = await ctx.db
          .query("projectUnits")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect();
        const towers = await ctx.db
          .query("towers")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect();

        const installedItems = items.filter(
          (i) => i.status === "operational"
        ).length;

        let responsibleName: string | null = null;
        if (project.responsibleId) {
          const responsible = await ctx.db.get("users", project.responsibleId);
          responsibleName = responsible?.name ?? null;
        }

        const customerName = await resolveCustomerLabel(ctx, project);

        return {
          _id: project._id,
          _creationTime: project._creationTime,
          name: project.name,
          slug: project.slug ?? project._id,
          legacyNumber: project.legacyNumber ?? null,
          floors: project.floors.map((f) => ({
            number: f.number,
            label: f.label,
          })),
          client: project.client ?? null,
          customerId: project.customerId ?? null,
          customerName,
          address: project.address ?? null,
          status: project.status ?? null,
          responsibleId: project.responsibleId ?? null,
          responsibleName,
          startDate: project.startDate ?? null,
          endDate: project.endDate ?? null,
          createdAt: project.createdAt,
          archivedAt: project.archivedAt ?? null,
          totalItems: items.length,
          installedItems,
          unitCount: units.length,
          towerCount: towers.length,
        };
      })
    );
  },
});

// --- Resolução de obra por slug ou ID legado ---

export const resolve = engineeringQuery({
  args: { identifier: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("projects"),
      slug: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const identifier = args.identifier.trim();
    if (!identifier) return null;

    const bySlug = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", identifier))
      .first();
    if (bySlug) {
      return {
        _id: bySlug._id,
        slug: bySlug.slug ?? bySlug._id,
      };
    }

    if (looksLikeConvexId(identifier)) {
      const project = await ctx.db.get("projects", identifier as Id<"projects">);
      if (project) {
        return {
          _id: project._id,
          slug: project.slug ?? project._id,
        };
      }
    }

    return null;
  },
});

export const backfillSlugs = internalMutation({
  args: {},
  returns: v.object({ updated: v.number() }),
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").collect();
    let updated = 0;

    for (const project of projects) {
      if (project.slug) continue;
      const slug = await generateUniqueProjectSlug(ctx, project.name, project._id);
      await ctx.db.patch("projects", project._id, { slug });
      updated += 1;
    }

    return { updated };
  },
});

// --- Visão completa de uma obra (árvore andares → aptos → itens) ---

export const getOverview = engineeringQuery({
  args: { projectId: v.id("projects") },
  returns: v.union(
    v.object({
      _id: v.id("projects"),
      name: v.string(),
      slug: v.string(),
      legacyNumber: v.union(v.number(), v.null()),
      floors: floorsValidator,
      client: v.union(v.string(), v.null()),
      customerId: v.union(v.id("customers"), v.null()),
      customerName: v.union(v.string(), v.null()),
      address: v.union(v.string(), v.null()),
      status: v.union(projectStatus, v.null()),
      responsibleId: v.union(v.id("users"), v.null()),
      responsibleName: v.union(v.string(), v.null()),
      startDate: v.union(v.number(), v.null()),
      endDate: v.union(v.number(), v.null()),
      createdAt: v.number(),
      totalItems: v.number(),
      installedItems: v.number(),
      hierarchyFloors: v.number(),
      hierarchyEnvironments: v.number(),
      units: v.array(
        v.object({
          _id: v.id("projectUnits"),
          floor: v.number(),
          final: v.number(),
          label: v.string(),
          type: unitTypeValidator,
          floorSpan: v.number(),
          deadline: v.union(v.number(), v.null()),
          equipment: v.array(
            v.object({
              _id: v.id("projectEquipment"),
              system: v.string(),
              ambiente: v.string(),
              kind: equipKindValidator,
              modelo: v.string(),
              capacidade: v.string(),
              status: equipmentStatusValidator,
              obs: v.union(v.string(), v.null()),
              deadline: v.union(v.number(), v.null()),
              linkedEquipmentId: v.union(v.id("equipment"), v.null()),
              token: v.union(v.string(), v.null()),
              installedAt: v.union(v.number(), v.null()),
            })
          ),
        })
      ),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) return null;

    const units = await ctx.db
      .query("projectUnits")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();
    const items = await ctx.db
      .query("projectEquipment")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();

    // Resolve o token do QR vinculado para cada item (verde/instalado).
    const tokenByEquipment = new Map<string, string>();
    for (const item of items) {
      const linkedId = item.linkedEquipmentId;
      if (linkedId && !tokenByEquipment.has(linkedId)) {
        const qr = await ctx.db
          .query("qrCodes")
          .withIndex("by_equipment", (q) => q.eq("equipmentId", linkedId))
          .order("desc")
          .first();
        if (qr) tokenByEquipment.set(linkedId, qr.token);
      }
    }

    const itemsByUnit = new Map<string, typeof items>();
    for (const item of items) {
      if (!item.unitId) continue;
      const list = itemsByUnit.get(item.unitId) ?? [];
      list.push(item);
      itemsByUnit.set(item.unitId, list);
    }

    const unitsOut = units
      .slice()
      .sort((a, b) => a.floor - b.floor || a.final - b.final)
      .map((u) => ({
        _id: u._id,
        floor: u.floor,
        final: u.final,
        label: u.label,
        type: u.type,
        floorSpan: u.floorSpan,
        deadline: u.deadline ?? null,
        equipment: (itemsByUnit.get(u._id) ?? [])
          .slice()
          .sort(
            (a, b) =>
              a.system.localeCompare(b.system) ||
              (a.kind === b.kind ? 0 : a.kind === "condensadora" ? -1 : 1)
          )
          .map((e) => ({
            _id: e._id,
            system: e.system,
            ambiente: e.ambiente,
            kind: e.kind,
            modelo: e.modelo,
            capacidade: e.capacidade,
            status: e.status,
            obs: e.obs ?? null,
            deadline: e.deadline ?? null,
            linkedEquipmentId: e.linkedEquipmentId ?? null,
            token: e.linkedEquipmentId
              ? tokenByEquipment.get(e.linkedEquipmentId) ?? null
              : null,
            installedAt: e.installedAt ?? null,
          })),
      }));

    let responsibleName: string | null = null;
    if (project.responsibleId) {
      const responsible = await ctx.db.get("users", project.responsibleId);
      responsibleName = responsible?.name ?? null;
    }

    const hierarchyFloors = await ctx.db
      .query("floors")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();
    const hierarchyEnvironments = await ctx.db
      .query("environments")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();
    const customerName = await resolveCustomerLabel(ctx, project);

    return {
      _id: project._id,
      name: project.name,
      slug: project.slug ?? project._id,
      legacyNumber: project.legacyNumber ?? null,
      floors: project.floors.map((f) => ({
        number: f.number,
        label: f.label,
      })),
      client: project.client ?? null,
      customerId: project.customerId ?? null,
      customerName,
      address: project.address ?? null,
      status: project.status ?? null,
      responsibleId: project.responsibleId ?? null,
      responsibleName,
      startDate: project.startDate ?? null,
      endDate: project.endDate ?? null,
      createdAt: project.createdAt,
      totalItems: items.length,
      installedItems: items.filter((i) => i.status === "operational").length,
      hierarchyFloors: hierarchyFloors.length,
      hierarchyEnvironments: hierarchyEnvironments.length,
      units: unitsOut,
    };
  },
});

// --- CRUD de obra ---

export const create = engineeringMutation({
  args: {
    name: v.string(),
    // Andares opcionais: obras novas podem começar vazias e usar torres.
    floors: v.optional(floorsValidator),
    customerId: v.id("customers"),
    legacyNumber: v.number(),
    client: v.optional(v.string()),
    address: v.optional(v.string()),
    status: v.optional(projectStatus),
    responsibleId: v.optional(v.id("users")),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("O nome da obra é obrigatório");

    const customer = await ctx.db.get("customers", args.customerId);
    if (!customer) throw new Error("Cliente não encontrado");
    if (customer.archivedAt || !customer.active) {
      throw new Error("Cliente inativo — selecione outro ou restaure o cliente");
    }
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
    await logAudit(ctx, ctx.user, {
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
  },
});

export const update = engineeringMutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    floors: v.optional(floorsValidator),
    customerId: v.optional(v.union(v.id("customers"), v.null())),
    legacyNumber: v.optional(v.number()),
    client: v.optional(v.union(v.string(), v.null())),
    address: v.optional(v.union(v.string(), v.null())),
    status: v.optional(projectStatus),
    responsibleId: v.optional(v.union(v.id("users"), v.null())),
    startDate: v.optional(v.union(v.number(), v.null())),
    endDate: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Obra não encontrada");
    if (isProjectArchived(project)) {
      throw new Error("Obra arquivada — restaure antes de editar");
    }

    const before = projectSnapshot(project);
    const updates: Record<string, unknown> = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("O nome da obra é obrigatório");
      updates.name = name;
    }
    if (args.floors !== undefined) {
      updates.floors = normalizeFloors(args.floors);
    }
    if (args.customerId !== undefined) {
      if (args.customerId === null) {
        throw new Error("A obra precisa estar vinculada a um cliente");
      }
      const customer = await ctx.db.get("customers", args.customerId);
      if (!customer) throw new Error("Cliente não encontrado");
      if (customer.archivedAt || !customer.active) {
        throw new Error("Cliente inativo — selecione outro ou restaure o cliente");
      }
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
        throw new Error("Use archive para arquivar a obra");
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
    await logAudit(ctx, ctx.user, {
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
  },
});

// Define quais usuários do portal podem ver a obra.
export const setPortalUsers = engineeringMutation({
  args: {
    projectId: v.id("projects"),
    portalUserIds: v.array(v.id("users")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Obra não encontrada");
    if (isProjectArchived(project)) {
      throw new Error("Obra arquivada — restaure antes de alterar acessos");
    }

    const before = projectSnapshot(project);
    const valid: Id<"users">[] = [];
    for (const userId of args.portalUserIds) {
      const user = await ctx.db.get("users", userId);
      if (user) valid.push(user._id);
    }

    await ctx.db.patch("projects", args.projectId, {
      portalUserIds: valid.length > 0 ? valid : undefined,
      // Mantém legado em sincronia durante a transição.
      clientIds: valid.length > 0 ? valid : undefined,
    });

    const afterDoc = await ctx.db.get("projects", args.projectId);
    await logAudit(ctx, ctx.user, {
      action: "set_portal_users",
      tableName: "projects",
      recordId: args.projectId,
      entityLabel: project.name,
      details: `${valid.length} usuário(s)`,
      changes: diffFields(before, projectSnapshot(afterDoc!), [
        "portalUserIds",
        "clientIds",
      ]),
      snapshotBefore: before,
      snapshotAfter: afterDoc ? projectSnapshot(afterDoc) : undefined,
    });
    return null;
  },
});

/** @deprecated Use setPortalUsers */
export const setClients = engineeringMutation({
  args: {
    projectId: v.id("projects"),
    clientIds: v.array(v.id("users")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Obra não encontrada");
    if (isProjectArchived(project)) {
      throw new Error("Obra arquivada — restaure antes de alterar acessos");
    }

    const before = projectSnapshot(project);
    const valid: Id<"users">[] = [];
    for (const userId of args.clientIds) {
      const user = await ctx.db.get("users", userId);
      if (user) valid.push(user._id);
    }

    await ctx.db.patch("projects", args.projectId, {
      portalUserIds: valid.length > 0 ? valid : undefined,
      clientIds: valid.length > 0 ? valid : undefined,
    });

    const afterDoc = await ctx.db.get("projects", args.projectId);
    await logAudit(ctx, ctx.user, {
      action: "set_clients",
      tableName: "projects",
      recordId: args.projectId,
      entityLabel: project.name,
      details: `${valid.length} cliente(s)`,
      changes: diffFields(before, projectSnapshot(afterDoc!), [
        "portalUserIds",
        "clientIds",
      ]),
      snapshotBefore: before,
      snapshotAfter: afterDoc ? projectSnapshot(afterDoc) : undefined,
    });
    return null;
  },
});

export const archive = engineeringMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Obra não encontrada");
    if (isProjectArchived(project)) return null;

    const now = Date.now();
    const before = projectSnapshot(project);
    await ctx.db.patch("projects", args.projectId, {
      status: "archived",
      archivedAt: now,
      archivedByUserId: ctx.user._id,
    });

    await logAudit(ctx, ctx.user, {
      action: "archive",
      tableName: "projects",
      recordId: args.projectId,
      entityLabel: project.name,
      snapshotBefore: before,
      snapshotAfter: {
        ...before,
        status: "archived",
        archivedAt: now,
      },
    });
    return null;
  },
});

export const restore = engineeringMutation({
  args: {
    projectId: v.id("projects"),
    status: v.optional(
      v.union(
        v.literal("planning"),
        v.literal("in_progress"),
        v.literal("completed"),
        v.literal("paused")
      )
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Obra não encontrada");
    if (!isProjectArchived(project)) return null;

    const before = projectSnapshot(project);
    const nextStatus = args.status ?? "planning";
    await ctx.db.patch("projects", args.projectId, {
      status: nextStatus,
      archivedAt: undefined,
      archivedByUserId: undefined,
    });

    await logAudit(ctx, ctx.user, {
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
    return null;
  },
});

// Define quais técnicos podem listar QRs/equipamentos desta obra em campo.
export const setTechnicians = engineeringMutation({
  args: {
    projectId: v.id("projects"),
    technicianIds: v.array(v.id("users")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Obra não encontrada");
    if (isProjectArchived(project)) {
      throw new Error("Obra arquivada — restaure antes de alterar técnicos");
    }

    const valid: Id<"users">[] = [];
    for (const userId of args.technicianIds) {
      const user = await ctx.db.get("users", userId);
      if (!user || !user.isActive) continue;
      // Aceita qr_operator e staff (técnicos internos também atuam em campo).
      if (user.role === "client") continue;
      valid.push(user._id);
    }

    await ctx.db.patch("projects", args.projectId, {
      technicianIds: valid.length > 0 ? valid : undefined,
    });
    await logAudit(ctx, ctx.user, {
      action: "set_technicians",
      tableName: "projects",
      recordId: args.projectId,
      entityLabel: project.name,
      details: `${valid.length} técnico(s)`,
    });
    return null;
  },
});

// Técnicos atribuídos à obra (para UI de edição).
export const getAssignedTechnicians = engineeringQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      _id: v.id("users"),
      name: v.string(),
      role: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) return [];

    const out: Array<{ _id: Id<"users">; name: string; role: string }> = [];
    for (const userId of project.technicianIds ?? []) {
      const user = await ctx.db.get("users", userId);
      if (!user) continue;
      out.push({ _id: user._id, name: user.name, role: user.role });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  },
});

/** Compatibilidade: arquiva em vez de excluir permanentemente. */
export const remove = engineeringMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Obra não encontrada");
    if (isProjectArchived(project)) return null;

    const now = Date.now();
    const before = projectSnapshot(project);
    await ctx.db.patch("projects", args.projectId, {
      status: "archived",
      archivedAt: now,
      archivedByUserId: ctx.user._id,
    });

    await logAudit(ctx, ctx.user, {
      action: "archive",
      tableName: "projects",
      recordId: args.projectId,
      entityLabel: project.name,
      details: "Compat: remove → archive",
      snapshotBefore: before,
      snapshotAfter: {
        ...before,
        status: "archived",
        archivedAt: now,
      },
    });
    return null;
  },
});

// --- Gerador por padrão (estilo aba "Aptos") ---
//
// Cria, para cada andar selecionado, os apartamentos (finais) e a lista padrão
// de equipamentos por sistema. Modelos/ambientes podem ser refinados depois no
// editor ou via assistente de IA.

const systemTemplateValidator = v.object({
  // Nome do sistema, ex: "VRF 1", "VRF 2", "Split".
  name: v.string(),
  // Quantidade de evaporadoras (unidades internas) deste sistema.
  evaporadoras: v.number(),
  // Modelo/capacidade padrão da condensadora (opcional).
  condensadoraModelo: v.optional(v.string()),
  condensadoraCapacidade: v.optional(v.string()),
});

const finalTemplateValidator = v.object({
  type: unitTypeValidator,
  systems: v.array(systemTemplateValidator),
});

export const generateLayout = engineeringMutation({
  args: {
    projectId: v.id("projects"),
    // Andares onde aplicar o padrão (devem existir em project.floors).
    floors: v.array(v.number()),
    // Um template por "final" (posição). finals[0] = Final 1, etc.
    finals: v.array(finalTemplateValidator),
    // Se true, apaga unidades/itens existentes nos andares antes de gerar.
    replace: v.optional(v.boolean()),
  },
  returns: v.object({ units: v.number(), items: v.number() }),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Obra não encontrada");
    if (args.finals.length === 0) {
      throw new Error("Defina ao menos um apartamento (final) no padrão");
    }

    const targetFloors = Array.from(new Set(args.floors.map((n) => Math.floor(n))));

    if (args.replace) {
      const existingUnits = await ctx.db
        .query("projectUnits")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
      for (const unit of existingUnits) {
        if (!targetFloors.includes(unit.floor)) continue;
        const unitItems = await ctx.db
          .query("projectEquipment")
          .withIndex("by_unit", (q) => q.eq("unitId", unit._id))
          .collect();
        for (const item of unitItems) {
          if (item.linkedEquipmentId) {
            await ctx.db.patch("equipment", item.linkedEquipmentId, {
              projectEquipmentId: undefined,
            });
          }
          await ctx.db.delete("projectEquipment", item._id);
        }
        await ctx.db.delete("projectUnits", unit._id);
      }
    }

    let unitCount = 0;
    let itemCount = 0;

    for (const floor of targetFloors) {
      for (let i = 0; i < args.finals.length; i++) {
        const template = args.finals[i];
        const final = i + 1;
        const unitId: Id<"projectUnits"> = await ctx.db.insert("projectUnits", {
          projectId: args.projectId,
          floor,
          final,
          label: autoUnitLabel(floor, final),
          type: template.type,
          floorSpan: 1,
        });
        unitCount++;

        for (const system of template.systems) {
          // Uma condensadora por sistema.
          await ctx.db.insert("projectEquipment", {
            projectId: args.projectId,
            unitId,
            system: system.name,
            ambiente: "Área Técnica",
            kind: "condensadora",
            modelo: system.condensadoraModelo?.trim() ?? "",
            capacidade: system.condensadoraCapacidade?.trim() ?? "",
            status: "installing",
          });
          itemCount++;

          const evapCount = Math.max(0, Math.floor(system.evaporadoras));
          for (let e = 0; e < evapCount; e++) {
            await ctx.db.insert("projectEquipment", {
              projectId: args.projectId,
              unitId,
              system: system.name,
              ambiente: `Ambiente ${e + 1}`,
              kind: "evaporadora",
              modelo: "",
              capacidade: "",
              status: "installing",
            });
            itemCount++;
          }
        }
      }
    }

    return { units: unitCount, items: itemCount };
  },
});

// --- Hierarquia nova: árvore Torre → Andar → Ambiente → Equipamento ---
//
// Usada pelo painel visual da obra. Retorna a árvore completa com contagens
// agregadas de status por andar/torre para colorir a grade.

const hierarchyItemValidator = v.object({
  _id: v.id("projectEquipment"),
  system: v.string(),
  systemId: v.union(v.id("systems"), v.null()),
  ambiente: v.string(),
  kind: equipKindValidator,
  modelo: v.string(),
  capacidade: v.string(),
  status: equipmentStatusValidator,
  serialNumber: v.union(v.string(), v.null()),
  deadline: v.union(v.number(), v.null()),
  linkedEquipmentId: v.union(v.id("equipment"), v.null()),
  token: v.union(v.string(), v.null()),
  installedAt: v.union(v.number(), v.null()),
  installationDate: v.union(v.number(), v.null()),
  testDate: v.union(v.number(), v.null()),
});

export const hierarchyReturnValidator = v.union(
  v.object({
    _id: v.id("projects"),
    name: v.string(),
    // Sistemas da obra (inclui sistemas ainda sem equipamentos).
    systems: v.array(
      v.object({
        _id: v.id("systems"),
        name: v.string(),
        type: v.union(v.string(), v.null()),
        totalItems: v.number(),
        installedItems: v.number(),
      })
    ),
    towers: v.array(
      v.object({
        _id: v.id("towers"),
        name: v.string(),
        order: v.number(),
        floors: v.array(
          v.object({
            _id: v.id("floors"),
            number: v.number(),
            label: v.string(),
            environments: v.array(
              v.object({
                _id: v.id("environments"),
                name: v.string(),
                type: v.union(v.string(), v.null()),
                order: v.number(),
                col: v.union(v.number(), v.null()),
                colSpan: v.union(v.number(), v.null()),
                rowSpan: v.union(v.number(), v.null()),
                // Retângulos extras de regiões não-retangulares (forma em L).
                segments: v.union(
                  v.array(
                    v.object({
                      colOffset: v.number(),
                      colSpan: v.union(v.number(), v.null()),
                      rowOffset: v.union(v.number(), v.null()),
                      rowSpan: v.union(v.number(), v.null()),
                    })
                  ),
                  v.null()
                ),
                equipment: v.array(hierarchyItemValidator),
              })
            ),
            totalItems: v.number(),
            installedItems: v.number(),
          })
        ),
      })
    ),
  }),
  v.null()
);

export const getHierarchy = engineeringQuery({
  args: { projectId: v.id("projects") },
  returns: hierarchyReturnValidator,
  handler: async (ctx, args) => {
    return await buildProjectHierarchy(ctx, args.projectId);
  },
});
