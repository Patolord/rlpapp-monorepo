import type { QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";

/**
 * Constrói a árvore Torre → Andar → Ambiente → Equipamento de uma obra.
 * Compartilhado entre a query de engenharia (getHierarchy) e o portal do cliente.
 */
export async function buildProjectHierarchy(
  ctx: QueryCtx,
  projectId: Id<"projects">
) {
  const project = await ctx.db.get("projects", projectId);
  if (!project) return null;

  const towers = await ctx.db
    .query("towers")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  const systems = await ctx.db
    .query("systems")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  const floors = await ctx.db
    .query("floors")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  const environments = await ctx.db
    .query("environments")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  const items = await ctx.db
    .query("projectEquipment")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();

  const tokenByEquipment = new Map<Id<"equipment">, string>();
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

  const itemsByEnv = new Map<Id<"environments">, typeof items>();
  for (const item of items) {
    if (!item.environmentId) continue;
    const list = itemsByEnv.get(item.environmentId) ?? [];
    list.push(item);
    itemsByEnv.set(item.environmentId, list);
  }

  const envsByFloor = new Map<Id<"floors">, typeof environments>();
  for (const env of environments) {
    const list = envsByFloor.get(env.floorId) ?? [];
    list.push(env);
    envsByFloor.set(env.floorId, list);
  }

  const floorsByTower = new Map<Id<"towers">, typeof floors>();
  for (const floor of floors) {
    const list = floorsByTower.get(floor.towerId) ?? [];
    list.push(floor);
    floorsByTower.set(floor.towerId, list);
  }

  const towersOut = towers
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((tower) => {
      const towerFloors = (floorsByTower.get(tower._id) ?? [])
        .slice()
        .sort((a, b) => b.number - a.number)
        .map((floor) => {
          const floorEnvs = (envsByFloor.get(floor._id) ?? [])
            .slice()
            .sort((a, b) => a.order - b.order);

          let totalItems = 0;
          let installedItems = 0;
          const envsOut = floorEnvs.map((env) => {
            const envItems = (itemsByEnv.get(env._id) ?? [])
              .slice()
              .sort(
                (a, b) =>
                  a.system.localeCompare(b.system) ||
                  (a.kind === b.kind ? 0 : a.kind === "condensadora" ? -1 : 1)
              );
            totalItems += envItems.length;
            installedItems += envItems.filter(
              (i) => i.status === "operational"
            ).length;
            return {
              _id: env._id,
              name: env.name,
              type: env.type ?? null,
              order: env.order,
              col: env.col ?? null,
              colSpan: env.colSpan ?? null,
              rowSpan: env.rowSpan ?? null,
              segments:
                env.segments?.map((seg) => ({
                  colOffset: seg.colOffset,
                  colSpan: seg.colSpan ?? null,
                  rowOffset: seg.rowOffset ?? null,
                  rowSpan: seg.rowSpan ?? null,
                })) ?? null,
              equipment: envItems.map((e) => ({
                _id: e._id,
                system: e.system,
                systemId: e.systemId ?? null,
                ambiente: e.ambiente,
                kind: e.kind,
                modelo: e.modelo,
                capacidade: e.capacidade,
                status: e.status,
                serialNumber: e.serialNumber ?? null,
                deadline: e.deadline ?? null,
                linkedEquipmentId: e.linkedEquipmentId ?? null,
                token: e.linkedEquipmentId
                  ? tokenByEquipment.get(e.linkedEquipmentId) ?? null
                  : null,
                installedAt: e.installedAt ?? null,
                installationDate: e.installationDate ?? null,
                testDate: e.testDate ?? null,
              })),
            };
          });

          return {
            _id: floor._id,
            number: floor.number,
            label: floor.label,
            environments: envsOut,
            totalItems,
            installedItems,
          };
        });

      return {
        _id: tower._id,
        name: tower.name,
        order: tower.order,
        floors: towerFloors,
      };
    });

  // Contagens por sistema (somente itens da hierarquia nova, com ambiente).
  const hierarchyItems = items.filter((i) => i.environmentId);
  const systemsOut = systems
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((system) => {
      const systemItems = hierarchyItems.filter(
        (i) => i.systemId === system._id
      );
      return {
        _id: system._id,
        name: system.name,
        type: system.type ?? null,
        totalItems: systemItems.length,
        installedItems: systemItems.filter((i) => i.status === "operational")
          .length,
      };
    });

  return {
    _id: project._id,
    name: project.name,
    systems: systemsOut,
    towers: towersOut,
  };
}
