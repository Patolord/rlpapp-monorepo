import { v } from "convex/values";
import { engineeringMutation } from "./lib/rbac";
import { logAudit } from "./lib/audit";
import { projectStatus } from "./schema";
import { findOrCreateSystemInProject } from "./systems";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const equipKindValidator = v.union(
  v.literal("condensadora"),
  v.literal("evaporadora")
);

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

const norm = (s: string) => s.trim().toLowerCase();

/** Resolve uma torre por nome (case-insensitive), com cache da batch. */
async function resolveTower(
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

async function resolveFloor(
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

async function resolveEnvironment(
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

function defaultFloorLabel(n: number): string {
  return n === 0 ? "Térreo" : `${n}º Andar`;
}

export const applyIntents = engineeringMutation({
  args: {
    projectId: v.id("projects"),
    intents: v.array(aiIntentValidator),
  },
  returns: v.object({
    applied: v.number(),
    summary: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Obra não encontrada");

    const towerCache = new Map<string, Id<"towers">>();
    const summary: string[] = [];
    let applied = 0;

    for (const intent of args.intents) {
      switch (intent.type) {
        case "update_project": {
          const updates: Record<string, unknown> = {};
          if (intent.client !== undefined) updates.client = intent.client.trim();
          if (intent.address !== undefined)
            updates.address = intent.address.trim();
          if (intent.status !== undefined) updates.status = intent.status;
          if (intent.startDate !== undefined)
            updates.startDate = intent.startDate;
          if (intent.endDate !== undefined) updates.endDate = intent.endDate;
          if (Object.keys(updates).length > 0) {
            await ctx.db.patch("projects", args.projectId, updates);
            summary.push("Dados da obra atualizados");
            applied++;
          }
          break;
        }

        case "create_tower": {
          const name = intent.name.trim();
          if (!name) break;
          const existing = await resolveTower(
            ctx,
            args.projectId,
            towerCache,
            name
          );
          if (existing) {
            summary.push(`Torre "${name}" já existe`);
            break;
          }
          const towers = await ctx.db
            .query("towers")
            .withIndex("by_project", (q) =>
              q.eq("projectId", args.projectId)
            )
            .collect();
          const towerId = await ctx.db.insert("towers", {
            projectId: args.projectId,
            name,
            order: towers.length,
            createdAt: Date.now(),
          });
          towerCache.set(norm(name), towerId);
          summary.push(`Torre "${name}" criada`);
          applied++;
          break;
        }

        case "duplicate_tower": {
          const sourceId = await resolveTower(
            ctx,
            args.projectId,
            towerCache,
            intent.towerName
          );
          if (!sourceId) {
            summary.push(`Torre "${intent.towerName}" não encontrada`);
            break;
          }
          const count = await duplicateTowerDeep(
            ctx,
            sourceId,
            intent.newName?.trim()
          );
          summary.push(
            `Torre "${intent.towerName}" duplicada (${count} andar(es))`
          );
          applied++;
          break;
        }

        case "create_floors": {
          const towerId = await resolveTower(
            ctx,
            args.projectId,
            towerCache,
            intent.towerName
          );
          if (!towerId) {
            summary.push(`Torre "${intent.towerName}" não encontrada`);
            break;
          }
          const existing = await ctx.db
            .query("floors")
            .withIndex("by_tower", (q) => q.eq("towerId", towerId))
            .collect();
          const seen = new Set(existing.map((f) => f.number));
          const from = Math.floor(Math.min(intent.from, intent.to));
          const to = Math.floor(Math.max(intent.from, intent.to));
          let created = 0;
          for (let n = from; n <= to; n++) {
            if (seen.has(n)) continue;
            await ctx.db.insert("floors", {
              towerId,
              projectId: args.projectId,
              number: n,
              label: defaultFloorLabel(n),
              createdAt: Date.now(),
            });
            created++;
          }
          summary.push(
            `${created} andar(es) criados na torre "${intent.towerName}"`
          );
          if (created > 0) applied++;
          break;
        }

        case "create_environment": {
          const towerId = await resolveTower(
            ctx,
            args.projectId,
            towerCache,
            intent.towerName
          );
          if (!towerId) {
            summary.push(`Torre "${intent.towerName}" não encontrada`);
            break;
          }
          const floorId = await resolveFloor(ctx, towerId, intent.floorNumber);
          if (!floorId) {
            summary.push(
              `Andar ${intent.floorNumber} não encontrado na torre "${intent.towerName}"`
            );
            break;
          }
          const name = intent.name.trim();
          const existing = await resolveEnvironment(ctx, floorId, name);
          if (existing) {
            summary.push(`Ambiente "${name}" já existe`);
            break;
          }
          const envs = await ctx.db
            .query("environments")
            .withIndex("by_floor", (q) => q.eq("floorId", floorId))
            .collect();
          await ctx.db.insert("environments", {
            floorId,
            towerId,
            projectId: args.projectId,
            name,
            type: intent.envType?.trim() || undefined,
            order: envs.length,
            createdAt: Date.now(),
          });
          summary.push(`Ambiente "${name}" criado`);
          applied++;
          break;
        }

        case "add_equipment": {
          const towerId = await resolveTower(
            ctx,
            args.projectId,
            towerCache,
            intent.towerName
          );
          if (!towerId) {
            summary.push(`Torre "${intent.towerName}" não encontrada`);
            break;
          }
          const floorId = await resolveFloor(ctx, towerId, intent.floorNumber);
          if (!floorId) {
            summary.push(`Andar ${intent.floorNumber} não encontrado`);
            break;
          }
          const envId = await resolveEnvironment(
            ctx,
            floorId,
            intent.environmentName
          );
          if (!envId) {
            summary.push(
              `Ambiente "${intent.environmentName}" não encontrado`
            );
            break;
          }
          const system = await findOrCreateSystemInProject(
            ctx,
            args.projectId,
            intent.system
          );
          await ctx.db.insert("projectEquipment", {
            projectId: args.projectId,
            environmentId: envId,
            towerId,
            floorId,
            system: system.name,
            systemId: system.systemId,
            ambiente: intent.environmentName.trim(),
            kind: intent.kind,
            modelo: intent.modelo?.trim() ?? "",
            capacidade: intent.capacidade?.trim() ?? "",
            serialNumber: intent.serialNumber?.trim() || undefined,
            deadline: intent.deadline,
            status: "installing",
          });
          summary.push(
            `Equipamento "${intent.system}" adicionado em ${intent.environmentName}`
          );
          applied++;
          break;
        }

        case "create_checklist_template": {
          const name = intent.name.trim();
          if (!name) break;
          await ctx.db.insert("checklistTemplates", {
            projectId: args.projectId,
            name,
            items: intent.items
              .map((i) => ({ label: i.label.trim(), required: i.required }))
              .filter((i) => i.label),
            createdAt: Date.now(),
          });
          summary.push(`Checklist "${name}" criado`);
          applied++;
          break;
        }

        case "set_floor_deadline": {
          const towerId = await resolveTower(
            ctx,
            args.projectId,
            towerCache,
            intent.towerName
          );
          if (!towerId) {
            summary.push(`Torre "${intent.towerName}" não encontrada`);
            break;
          }
          const floorId = await resolveFloor(ctx, towerId, intent.floorNumber);
          if (!floorId) {
            summary.push(
              `Andar ${intent.floorNumber} não encontrado na torre "${intent.towerName}"`
            );
            break;
          }
          const floorEquipments = await ctx.db
            .query("projectEquipment")
            .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
            .collect();
          const matching = floorEquipments.filter(
            (e) => e.floorId === floorId && e.towerId === towerId
          );
          let updated = 0;
          for (const eq of matching) {
            await ctx.db.patch("projectEquipment", eq._id, {
              deadline: intent.deadline,
            });
            updated++;
          }
          const dateStr = new Date(intent.deadline).toLocaleDateString("pt-BR");
          summary.push(
            `Prazo de ${updated} equipamento(s) do ${intent.floorNumber}º andar alterado para ${dateStr}`
          );
          if (updated > 0) applied++;
          break;
        }

        case "update_equipment": {
          const towerId = await resolveTower(
            ctx,
            args.projectId,
            towerCache,
            intent.towerName
          );
          if (!towerId) {
            summary.push(`Torre "${intent.towerName}" não encontrada`);
            break;
          }
          const floorId = await resolveFloor(ctx, towerId, intent.floorNumber);
          if (!floorId) {
            summary.push(`Andar ${intent.floorNumber} não encontrado`);
            break;
          }
          const envId = await resolveEnvironment(
            ctx,
            floorId,
            intent.environmentName
          );
          if (!envId) {
            summary.push(
              `Ambiente "${intent.environmentName}" não encontrado`
            );
            break;
          }
          const envEquipments = await ctx.db
            .query("projectEquipment")
            .withIndex("by_environment", (q) => q.eq("environmentId", envId))
            .collect();
          let candidates = envEquipments;
          if (intent.kind) {
            candidates = candidates.filter((e) => e.kind === intent.kind);
          }
          if (intent.system) {
            const sysKey = norm(intent.system);
            candidates = candidates.filter((e) => norm(e.system) === sysKey);
          }
          if (candidates.length === 0) {
            summary.push(
              `Nenhum equipamento encontrado em "${intent.environmentName}"`
            );
            break;
          }
          const updates: Record<string, unknown> = {};
          if (intent.deadline !== undefined) updates.deadline = intent.deadline;
          if (intent.modelo !== undefined) updates.modelo = intent.modelo;
          if (intent.capacidade !== undefined)
            updates.capacidade = intent.capacidade;
          if (intent.status !== undefined) updates.status = intent.status;
          if (Object.keys(updates).length === 0) {
            summary.push("Nenhuma alteração especificada");
            break;
          }
          for (const eq of candidates) {
            await ctx.db.patch("projectEquipment", eq._id, updates);
          }
          summary.push(
            `${candidates.length} equipamento(s) atualizado(s) em "${intent.environmentName}"`
          );
          applied++;
          break;
        }

        case "rename_environment": {
          const towerId = await resolveTower(
            ctx,
            args.projectId,
            towerCache,
            intent.towerName
          );
          if (!towerId) {
            summary.push(`Torre "${intent.towerName}" não encontrada`);
            break;
          }
          const floorId = await resolveFloor(ctx, towerId, intent.floorNumber);
          if (!floorId) {
            summary.push(`Andar ${intent.floorNumber} não encontrado`);
            break;
          }
          const envId = await resolveEnvironment(ctx, floorId, intent.oldName);
          if (!envId) {
            summary.push(`Ambiente "${intent.oldName}" não encontrado`);
            break;
          }
          await ctx.db.patch("environments", envId, {
            name: intent.newName.trim(),
          });
          summary.push(
            `Ambiente "${intent.oldName}" renomeado para "${intent.newName}"`
          );
          applied++;
          break;
        }
      }
    }

    await logAudit(ctx, ctx.user, {
      action: "ai_apply",
      tableName: "projects",
      recordId: args.projectId,
      details: `${applied} intent(s) aplicados`,
    });

    return { applied, summary };
  },
});

// Duplica uma torre com toda a hierarquia. Reaproveitada pelo intent.
async function duplicateTowerDeep(
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
