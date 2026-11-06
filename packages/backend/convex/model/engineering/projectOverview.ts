import type { Infer } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { type Role, resolveRoles } from "../../lib/rbac";
import { isProjectArchived, resolveCustomerLabel } from "./projects";
import type {
  projectListItemValidator,
  projectOverviewValidator,
} from "./projectValidators";

export type ProjectListItem = Infer<typeof projectListItemValidator>;
export type ProjectOverview = Infer<typeof projectOverviewValidator>;
export type AssignedTechnician = { _id: Id<"users">; name: string; roles: Role[] };

export type ListProjectsInput = {
  includeArchived?: boolean;
};

/** Listagem de obras com progresso por ACs, unidades e torres. */
export async function listProjects(
  ctx: QueryCtx,
  args: ListProjectsInput
): Promise<ProjectListItem[]> {
  let projects = await ctx.db.query("projects").order("desc").collect();
  const customerLabelCache = new Map<string, string | null>();
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

      const customerName = await resolveCustomerLabel(
        ctx,
        project,
        customerLabelCache
      );

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
}

/** Visão completa de uma obra (árvore andares → aptos → itens). */
export async function getProjectOverview(
  ctx: QueryCtx,
  projectId: Id<"projects">
): Promise<ProjectOverview | null> {
  const project = await ctx.db.get("projects", projectId);
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
}

/** Técnicos atribuídos à obra (para UI de edição), em ordem alfabética. */
export async function listAssignedTechnicians(
  ctx: QueryCtx,
  projectId: Id<"projects">
): Promise<AssignedTechnician[]> {
  const project = await ctx.db.get("projects", projectId);
  if (!project) return [];

  const out: AssignedTechnician[] = [];
  for (const userId of project.technicianIds ?? []) {
    const user = await ctx.db.get("users", userId);
    if (!user) continue;
    out.push({ _id: user._id, name: user.name, roles: resolveRoles(user) });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
