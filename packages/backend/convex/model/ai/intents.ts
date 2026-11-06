import { equipKindValidator } from "../engineering/validators";
import { v } from "convex/values";
import { projectStatus } from "../../schema/engineering";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

/**
 * Intents da IA. A IA NUNCA escreve no banco diretamente: ela apenas produz
 * estes intents (JSON estruturado). O usuário revisa o preview e, ao confirmar,
 * a mutation `applyIntents` os executa via as funções CRUD existentes.
 *
 * Entidades são referenciadas por NOME dentro da obra (torre/andar/ambiente),
 * permitindo que a IA encadeie criação + povoamento numa única proposta.
 */
export const aiIntentValidator = v.union(
  v.object({
    type: v.literal("update_project"),
    client: v.optional(v.string()),
    address: v.optional(v.string()),
    status: v.optional(projectStatus),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  }),
  v.object({
    type: v.literal("create_tower"),
    name: v.string(),
  }),
  v.object({
    type: v.literal("duplicate_tower"),
    towerName: v.string(),
    newName: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("create_floors"),
    towerName: v.string(),
    from: v.number(),
    to: v.number(),
  }),
  v.object({
    type: v.literal("create_environment"),
    towerName: v.string(),
    floorNumber: v.number(),
    name: v.string(),
    envType: v.optional(v.string()),
    // Posição/tamanho na matriz esquemática (opcionais; inteiros >= 1).
    col: v.optional(v.number()),
    colSpan: v.optional(v.number()),
    rowSpan: v.optional(v.number()),
  }),
  v.object({
    type: v.literal("resize_environment"),
    towerName: v.string(),
    floorNumber: v.number(),
    name: v.string(),
    col: v.optional(v.number()),
    colSpan: v.optional(v.number()),
    rowSpan: v.optional(v.number()),
  }),
  v.object({
    type: v.literal("create_system"),
    name: v.string(),
    systemType: v.optional(v.string()),
    obs: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("assign_qr"),
    token: v.string(),
    towerName: v.string(),
    floorNumber: v.number(),
    environmentName: v.string(),
    system: v.optional(v.string()),
    kind: v.optional(equipKindValidator),
  }),
  v.object({
    type: v.literal("add_equipment"),
    towerName: v.string(),
    floorNumber: v.number(),
    environmentName: v.string(),
    system: v.string(),
    kind: equipKindValidator,
    modelo: v.optional(v.string()),
    capacidade: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    deadline: v.optional(v.number()),
  }),
  v.object({
    type: v.literal("create_checklist_template"),
    name: v.string(),
    items: v.array(
      v.object({ label: v.string(), required: v.boolean() })
    ),
  }),
  v.object({
    type: v.literal("set_floor_deadline"),
    towerName: v.string(),
    floorNumber: v.number(),
    deadline: v.number(),
  }),
  v.object({
    type: v.literal("update_equipment"),
    towerName: v.string(),
    floorNumber: v.number(),
    environmentName: v.string(),
    kind: v.optional(equipKindValidator),
    system: v.optional(v.string()),
    deadline: v.optional(v.number()),
    modelo: v.optional(v.string()),
    capacidade: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("installing"),
        v.literal("operational"),
        v.literal("warning"),
        v.literal("error")
      )
    ),
  }),
  v.object({
    type: v.literal("rename_environment"),
    towerName: v.string(),
    floorNumber: v.number(),
    oldName: v.string(),
    newName: v.string(),
  })
);

export const norm = (s: string) => s.trim().toLowerCase();

/** Resolve uma torre por nome (case-insensitive), com cache da batch. */
export async function resolveTower(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  towerCache: Map<string, Id<"towers">>,
  name: string
): Promise<Id<"towers"> | null> {
  const key = norm(name);
  const cached = towerCache.get(key);
  if (cached) return cached;
  const towers = await ctx.db
    .query("towers")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  const match = towers.find((t) => norm(t.name) === key);
  if (match) {
    towerCache.set(key, match._id);
    return match._id;
  }
  return null;
}

export async function resolveFloor(
  ctx: MutationCtx,
  towerId: Id<"towers">,
  number: number
): Promise<Id<"floors"> | null> {
  const floors = await ctx.db
    .query("floors")
    .withIndex("by_tower", (q) => q.eq("towerId", towerId))
    .collect();
  return floors.find((f) => f.number === Math.floor(number))?._id ?? null;
}

export async function resolveEnvironment(
  ctx: MutationCtx,
  floorId: Id<"floors">,
  name: string
): Promise<Id<"environments"> | null> {
  const envs = await ctx.db
    .query("environments")
    .withIndex("by_floor", (q) => q.eq("floorId", floorId))
    .collect();
  const key = norm(name);
  return envs.find((e) => norm(e.name) === key)?._id ?? null;
}

/**
 * Coage um valor de posição/tamanho da matriz para inteiro >= 1.
 * Valores inválidos são ignorados (undefined) para não abortar a batch.
 */
export function gridValue(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Math.floor(value);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return n;
}

// Duplica uma torre com toda a hierarquia. Reaproveitada pelo intent.
export async function duplicateTowerDeep(
  ctx: MutationCtx,
  towerId: Id<"towers">,
  newName?: string
): Promise<number> {
  const tower = await ctx.db.get("towers", towerId);
  if (!tower) return 0;

  const existing = await ctx.db
    .query("towers")
    .withIndex("by_project", (q) => q.eq("projectId", tower.projectId))
    .collect();

  const newTowerId = await ctx.db.insert("towers", {
    projectId: tower.projectId,
    name: newName || `${tower.name} (cópia)`,
    order: existing.length,
    createdAt: Date.now(),
  });

  const floors = await ctx.db
    .query("floors")
    .withIndex("by_tower", (q) => q.eq("towerId", towerId))
    .collect();

  let floorCount = 0;
  for (const floor of floors) {
    const newFloorId = await ctx.db.insert("floors", {
      towerId: newTowerId,
      projectId: floor.projectId,
      number: floor.number,
      label: floor.label,
      createdAt: Date.now(),
    });
    floorCount++;

    const environments = await ctx.db
      .query("environments")
      .withIndex("by_floor", (q) => q.eq("floorId", floor._id))
      .collect();
    for (const env of environments) {
      const newEnvId = await ctx.db.insert("environments", {
        floorId: newFloorId,
        towerId: newTowerId,
        projectId: env.projectId,
        name: env.name,
        type: env.type,
        order: env.order,
        col: env.col,
        colSpan: env.colSpan,
        rowSpan: env.rowSpan,
        segments: env.segments,
        createdAt: Date.now(),
      });
      const items = await ctx.db
        .query("projectEquipment")
        .withIndex("by_environment", (q) => q.eq("environmentId", env._id))
        .collect();
      for (const item of items) {
        await ctx.db.insert("projectEquipment", {
          projectId: item.projectId,
          environmentId: newEnvId,
          towerId: newTowerId,
          floorId: newFloorId,
          system: item.system,
          // Mesma obra: a cópia continua pertencendo ao mesmo sistema.
          systemId: item.systemId,
          ambiente: item.ambiente,
          kind: item.kind,
          modelo: item.modelo,
          capacidade: item.capacidade,
          status: "installing",
          obs: item.obs,
          deadline: item.deadline,
        });
      }
    }
  }

  return floorCount;
}
