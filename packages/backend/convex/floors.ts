import { v } from "convex/values";
import { engineeringMutation, engineeringQuery } from "./lib/rbac";
import { logAudit, logEquipmentHistory } from "./lib/audit";
import { deleteSystemsIfOrphaned } from "./systems";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

function defaultFloorLabel(n: number): string {
  return n === 0 ? "Térreo" : `${n}º Andar`;
}

// Lista os andares de uma torre (ordenados do mais alto para o mais baixo).
export const listByTower = engineeringQuery({
  args: { towerId: v.id("towers") },
  returns: v.array(
    v.object({
      _id: v.id("floors"),
      towerId: v.id("towers"),
      projectId: v.id("projects"),
      number: v.number(),
      label: v.string(),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const floors = await ctx.db
      .query("floors")
      .withIndex("by_tower", (q) => q.eq("towerId", args.towerId))
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
  },
});

// Cria um ou mais andares numa torre.
export const create = engineeringMutation({
  args: {
    towerId: v.id("towers"),
    floors: v.array(
      v.object({
        number: v.number(),
        label: v.optional(v.string()),
      })
    ),
  },
  returns: v.array(v.id("floors")),
  handler: async (ctx, args) => {
    const tower = await ctx.db.get("towers", args.towerId);
    if (!tower) throw new Error("Torre não encontrada");

    const existing = await ctx.db
      .query("floors")
      .withIndex("by_tower", (q) => q.eq("towerId", args.towerId))
      .collect();
    const seen = new Set(existing.map((f) => f.number));

    const created: Id<"floors">[] = [];
    for (const floor of args.floors) {
      const number = Math.floor(floor.number);
      if (seen.has(number)) continue;
      seen.add(number);
      const floorId = await ctx.db.insert("floors", {
        towerId: args.towerId,
        projectId: tower.projectId,
        number,
        label: floor.label?.trim() || defaultFloorLabel(number),
        createdAt: Date.now(),
      });
      created.push(floorId);
    }

    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "floors",
      recordId: args.towerId,
      details: `${created.length} andar(es)`,
    });
    return created;
  },
});

export const update = engineeringMutation({
  args: {
    floorId: v.id("floors"),
    label: v.optional(v.string()),
    number: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const floor = await ctx.db.get("floors", args.floorId);
    if (!floor) throw new Error("Andar não encontrado");

    const updates: Partial<{ label: string; number: number }> = {};
    if (args.label !== undefined) {
      updates.label = args.label.trim() || defaultFloorLabel(floor.number);
    }
    if (args.number !== undefined) updates.number = Math.floor(args.number);

    await ctx.db.patch("floors", args.floorId, updates);
    return null;
  },
});

// Replica um andar típico para outros andares da mesma obra: copia os
// ambientes (com layout da matriz), cria NOVOS sistemas para cada sistema
// presente no andar (sistema é físico, por unidade — não reutiliza o _id) e
// copia os equipamentos planejados (sem QR/vínculo, status "installing").
// Os nomes dos ambientes vêm do mapa `renames` confirmado pelo usuário
// (ex: "201" → "301"); nomes de sistema que contêm o nome da unidade de
// origem são renumerados da mesma forma.
export const replicate = engineeringMutation({
  args: {
    sourceFloorId: v.id("floors"),
    targetFloorIds: v.array(v.id("floors")),
    renames: v.array(
      v.object({
        sourceEnvironmentId: v.id("environments"),
        targetFloorId: v.id("floors"),
        name: v.string(),
      })
    ),
  },
  returns: v.object({
    floors: v.number(),
    environments: v.number(),
    systems: v.number(),
    items: v.number(),
  }),
  handler: async (ctx, args) => {
    const source = await ctx.db.get("floors", args.sourceFloorId);
    if (!source) throw new Error("Andar de origem não encontrado");

    const targetIds = Array.from(new Set(args.targetFloorIds)).filter(
      (id) => id !== args.sourceFloorId
    );
    if (targetIds.length === 0) {
      throw new Error("Selecione pelo menos um andar de destino");
    }

    // Ambientes e equipamentos do andar de origem.
    const sourceEnvs = await ctx.db
      .query("environments")
      .withIndex("by_floor", (q) => q.eq("floorId", args.sourceFloorId))
      .collect();
    if (sourceEnvs.length === 0) {
      throw new Error("O andar de origem não tem ambientes para replicar");
    }

    const itemsByEnv = new Map<Id<"environments">, Doc<"projectEquipment">[]>();
    let itemsPerFloor = 0;
    for (const env of sourceEnvs) {
      const items = await ctx.db
        .query("projectEquipment")
        .withIndex("by_environment", (q) => q.eq("environmentId", env._id))
        .collect();
      itemsByEnv.set(env._id, items);
      itemsPerFloor += items.length;
    }
    if (itemsPerFloor * targetIds.length > 500) {
      throw new Error(
        `Limite de 500 equipamentos por operação excedido (${itemsPerFloor * targetIds.length})`
      );
    }

    // Valida os andares de destino: mesma obra e vazios.
    const targets: Doc<"floors">[] = [];
    for (const targetId of targetIds) {
      const target = await ctx.db.get("floors", targetId);
      if (!target) throw new Error("Andar de destino não encontrado");
      if (target.projectId !== source.projectId) {
        throw new Error("Os andares de destino devem pertencer à mesma obra");
      }
      const existingEnv = await ctx.db
        .query("environments")
        .withIndex("by_floor", (q) => q.eq("floorId", targetId))
        .first();
      if (existingEnv) {
        throw new Error(
          `O andar "${target.label}" já tem ambientes — replique apenas para andares vazios`
        );
      }
      targets.push(target);
    }

    // Mapa de renomes: `${targetFloorId}:${sourceEnvId}` → novo nome.
    const renameByKey = new Map(
      args.renames.map((r) => [
        `${r.targetFloorId}:${r.sourceEnvironmentId}`,
        r.name.trim(),
      ])
    );

    // Sistemas referenciados pelos equipamentos do andar de origem.
    const sourceSystemIds = new Set<Id<"systems">>();
    for (const items of itemsByEnv.values()) {
      for (const item of items) {
        if (item.systemId) sourceSystemIds.add(item.systemId);
      }
    }
    const sourceSystems = new Map<Id<"systems">, Doc<"systems">>();
    for (const systemId of sourceSystemIds) {
      const system = await ctx.db.get("systems", systemId);
      if (system) sourceSystems.set(systemId, system);
    }

    // Nomes de sistema já usados na obra (para desambiguar com sufixo).
    const existingSystems = await ctx.db
      .query("systems")
      .withIndex("by_project", (q) => q.eq("projectId", source.projectId))
      .collect();
    const takenSystemNames = new Set(
      existingSystems.map((s) => s.name.toLowerCase())
    );

    let envCount = 0;
    let systemCount = 0;
    let itemCount = 0;

    for (const target of targets) {
      // Cria os ambientes copiados e guarda o mapeamento origem → cópia.
      const envCopy = new Map<
        Id<"environments">,
        { envId: Id<"environments">; name: string }
      >();
      for (const env of sourceEnvs) {
        const newName =
          renameByKey.get(`${target._id}:${env._id}`) || env.name;
        const newEnvId = await ctx.db.insert("environments", {
          floorId: target._id,
          towerId: target.towerId,
          projectId: target.projectId,
          name: newName,
          type: env.type,
          order: env.order,
          col: env.col,
          colSpan: env.colSpan,
          rowSpan: env.rowSpan,
          segments: env.segments,
          createdAt: Date.now(),
        });
        envCopy.set(env._id, { envId: newEnvId, name: newName });
        envCount++;
      }

      // Novos sistemas por andar de destino (um por sistema de origem),
      // renumerando o nome quando ele contém o nome da unidade de origem.
      const systemCopy = new Map<
        Id<"systems">,
        { systemId: Id<"systems">; name: string }
      >();
      for (const [sourceSystemId, system] of sourceSystems) {
        // Só replica o sistema se ele tem equipamentos neste andar.
        const usedInFloor = sourceEnvs.some((env) =>
          (itemsByEnv.get(env._id) ?? []).some(
            (item) => item.systemId === sourceSystemId
          )
        );
        if (!usedInFloor) continue;

        let name = system.name;
        for (const env of sourceEnvs) {
          const copy = envCopy.get(env._id);
          if (!copy || copy.name === env.name) continue;
          if (env.name && name.includes(env.name)) {
            name = name.replace(env.name, copy.name);
            break;
          }
        }
        let unique = name;
        for (let n = 2; takenSystemNames.has(unique.toLowerCase()); n++) {
          unique = `${name} (${n})`;
        }
        takenSystemNames.add(unique.toLowerCase());

        const newSystemId = await ctx.db.insert("systems", {
          projectId: source.projectId,
          name: unique,
          type: system.type,
          obs: system.obs,
          createdAt: Date.now(),
        });
        systemCopy.set(sourceSystemId, { systemId: newSystemId, name: unique });
        systemCount++;
      }

      // Copia os equipamentos planejados (sem QR/vínculo/serial).
      for (const env of sourceEnvs) {
        const copy = envCopy.get(env._id)!;
        for (const item of itemsByEnv.get(env._id) ?? []) {
          const system = item.systemId
            ? systemCopy.get(item.systemId)
            : undefined;
          const newItemId = await ctx.db.insert("projectEquipment", {
            projectId: target.projectId,
            environmentId: copy.envId,
            towerId: target.towerId,
            floorId: target._id,
            system: system?.name ?? item.system,
            systemId: system?.systemId,
            ambiente: copy.name,
            kind: item.kind,
            modelo: item.modelo,
            capacidade: item.capacidade,
            status: "installing",
          });
          itemCount++;
          await logEquipmentHistory(ctx, ctx.user, {
            equipmentId: newItemId,
            action: "created",
            newValue: system?.name ?? item.system ?? "(sem sistema)",
          });
        }
      }
    }

    await logAudit(ctx, ctx.user, {
      action: "replicate",
      tableName: "floors",
      recordId: args.sourceFloorId,
      details: `${source.label} → ${targets.map((t) => t.label).join(", ")} (${envCount} ambientes, ${itemCount} equipamentos)`,
    });

    return {
      floors: targets.length,
      environments: envCount,
      systems: systemCount,
      items: itemCount,
    };
  },
});

export const remove = engineeringMutation({
  args: { floorId: v.id("floors") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const floor = await ctx.db.get("floors", args.floorId);
    if (!floor) return null;
    const affectedSystemIds = await cascadeDeleteFloor(ctx, args.floorId);
    await ctx.db.delete("floors", args.floorId);
    // Cascata: sistemas que ficaram sem equipamentos são removidos também.
    await deleteSystemsIfOrphaned(ctx, ctx.user, affectedSystemIds);
    await logAudit(ctx, ctx.user, {
      action: "delete",
      tableName: "floors",
      recordId: args.floorId,
      details: floor.label,
    });
    return null;
  },
});

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
