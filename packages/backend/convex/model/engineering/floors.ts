import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import { deleteSystemsIfOrphaned } from "./systems";

export function defaultFloorLabel(n: number): string {
  return n === 0 ? "Térreo" : `${n}º Andar`;
}

export function normalizeFloors(floors: Array<{ number: number; label: string }>) {
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

/** Andares de uma torre, do mais alto para o mais baixo. */
export async function listTowerFloors(ctx: QueryCtx, towerId: Id<"towers">) {
  const floors = await ctx.db
    .query("floors")
    .withIndex("by_tower", (q) => q.eq("towerId", towerId))
    .collect();
  return floors
    .sort((a, b) => b.number - a.number)
    .map((f) => ({
      _id: f._id,
      towerId: f.towerId,
      projectId: f.projectId,
      number: f.number,
      label: f.label,
      createdAt: f.createdAt,
    }));
}

/** Cria andares numa torre, ignorando números que já existem. */
export async function createTowerFloors(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: {
    towerId: Id<"towers">;
    floors: Array<{ number: number; label?: string }>;
  }
): Promise<Id<"floors">[]> {
  const tower = await ctx.db.get("towers", input.towerId);
  if (!tower) throw new Error("Torre não encontrada");

  const existing = await ctx.db
    .query("floors")
    .withIndex("by_tower", (q) => q.eq("towerId", input.towerId))
    .collect();
  const seen = new Set(existing.map((f) => f.number));

  const created: Id<"floors">[] = [];
  for (const floor of input.floors) {
    const number = Math.floor(floor.number);
    if (seen.has(number)) continue;
    seen.add(number);
    const floorId = await ctx.db.insert("floors", {
      towerId: input.towerId,
      projectId: tower.projectId,
      number,
      label: floor.label?.trim() || defaultFloorLabel(number),
      createdAt: Date.now(),
    });
    created.push(floorId);
  }

  await logAudit(ctx, user, {
    action: "create",
    tableName: "floors",
    recordId: input.towerId,
    details: `${created.length} andar(es)`,
  });
  return created;
}

export async function updateFloor(
  ctx: MutationCtx,
  input: { floorId: Id<"floors">; label?: string; number?: number }
) {
  const floor = await ctx.db.get("floors", input.floorId);
  if (!floor) throw new Error("Andar não encontrado");

  const updates: Partial<{ label: string; number: number }> = {};
  if (input.label !== undefined) {
    updates.label = input.label.trim() || defaultFloorLabel(floor.number);
  }
  if (input.number !== undefined) updates.number = Math.floor(input.number);

  await ctx.db.patch("floors", input.floorId, updates);
}

/** Apaga o andar em cascata (ambientes, equipamentos e sistemas órfãos). */
export async function removeFloor(
  ctx: MutationCtx,
  user: Doc<"users">,
  floorId: Id<"floors">
) {
  const floor = await ctx.db.get("floors", floorId);
  if (!floor) return;
  const affectedSystemIds = await cascadeDeleteFloor(ctx, floorId);
  await ctx.db.delete("floors", floorId);
  // Cascata: sistemas que ficaram sem equipamentos são removidos também.
  await deleteSystemsIfOrphaned(ctx, user, affectedSystemIds);
  await logAudit(ctx, user, {
    action: "delete",
    tableName: "floors",
    recordId: floorId,
    details: floor.label,
  });
}

// Helper de cascata: apaga ambientes e equipamentos de um andar.
// Retorna os sistemas afetados para checagem de órfãos pelo chamador.
async function cascadeDeleteFloor(
  ctx: MutationCtx,
  floorId: Id<"floors">
): Promise<Set<Id<"systems">>> {
  const affectedSystemIds = new Set<Id<"systems">>();
  const environments = await ctx.db
    .query("environments")
    .withIndex("by_floor", (q) => q.eq("floorId", floorId))
    .collect();
  for (const env of environments) {
    const items = await ctx.db
      .query("projectEquipment")
      .withIndex("by_environment", (q) => q.eq("environmentId", env._id))
      .collect();
    for (const item of items) {
      if (item.systemId) affectedSystemIds.add(item.systemId);
      if (item.linkedEquipmentId) {
        await ctx.db.patch("equipment", item.linkedEquipmentId, {
          projectEquipmentId: undefined,
        });
      }
      await ctx.db.delete("projectEquipment", item._id);
    }
    await ctx.db.delete("environments", env._id);
  }
  return affectedSystemIds;
}
