import { v } from "convex/values";
import { engineeringMutation } from "./lib/rbac";
import { logAudit, logEquipmentHistory } from "./lib/audit";
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

/**
 * Coage um valor de posição/tamanho da matriz para inteiro >= 1.
 * Valores inválidos são ignorados (undefined) para não abortar a batch.
 */
function gridValue(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Math.floor(value);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return n;
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
            col: gridValue(intent.col),
            colSpan: gridValue(intent.colSpan),
            rowSpan: gridValue(intent.rowSpan),
            createdAt: Date.now(),
          });
          summary.push(`Ambiente "${name}" criado`);
          applied++;
          break;
        }

        case "resize_environment": {
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
          const envId = await resolveEnvironment(ctx, floorId, intent.name);
          if (!envId) {
            summary.push(`Ambiente "${intent.name}" não encontrado`);
            break;
          }
          const updates: Record<string, number> = {};
          const col = gridValue(intent.col);
          if (col !== undefined) updates.col = col;
          const colSpan = gridValue(intent.colSpan);
          if (colSpan !== undefined) updates.colSpan = colSpan;
          const rowSpan = gridValue(intent.rowSpan);
          if (rowSpan !== undefined) updates.rowSpan = rowSpan;
          if (Object.keys(updates).length === 0) {
            summary.push(
              `Nenhum tamanho válido informado para "${intent.name}"`
            );
            break;
          }
          await ctx.db.patch("environments", envId, updates);
          const parts: string[] = [];
          if (updates.col !== undefined) parts.push(`coluna ${updates.col}`);
          if (updates.colSpan !== undefined)
            parts.push(`largura ${updates.colSpan}`);
          if (updates.rowSpan !== undefined)
            parts.push(`${updates.rowSpan} andar(es)`);
          summary.push(
            `Ambiente "${intent.name}" redimensionado (${parts.join(", ")})`
          );
          applied++;
          break;
        }

        case "create_system": {
          const name = intent.name.trim();
          if (!name) break;
          const existing = await ctx.db
            .query("systems")
            .withIndex("by_project", (q) =>
              q.eq("projectId", args.projectId)
            )
            .collect();
          const match = existing.find(
            (s) => s.name.toLowerCase() === name.toLowerCase()
          );
          if (match) {
            const updates: Record<string, string> = {};
            if (intent.systemType?.trim())
              updates.type = intent.systemType.trim();
            if (intent.obs?.trim()) updates.obs = intent.obs.trim();
            if (Object.keys(updates).length > 0) {
              await ctx.db.patch("systems", match._id, updates);
              summary.push(`Sistema "${match.name}" atualizado`);
              applied++;
            } else {
              summary.push(`Sistema "${match.name}" já existe`);
            }
            break;
          }
          await ctx.db.insert("systems", {
            projectId: args.projectId,
            name,
            type: intent.systemType?.trim() || undefined,
            obs: intent.obs?.trim() || undefined,
            createdAt: Date.now(),
          });
          summary.push(`Sistema "${name}" criado`);
          applied++;
          break;
        }

        case "assign_qr": {
          const token = intent.token.trim();
          if (!token) break;
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

          // Tokens gerados pelo sistema são maiúsculos; tenta o texto exato e,
          // se não achar, a versão em maiúsculas (a IA pode transcrever errado).
          let qr = await ctx.db
            .query("qrCodes")
            .withIndex("by_token", (q) => q.eq("token", token))
            .unique();
          if (!qr && token !== token.toUpperCase()) {
            qr = await ctx.db
              .query("qrCodes")
              .withIndex("by_token", (q) => q.eq("token", token.toUpperCase()))
              .unique();
          }
          if (!qr) {
            summary.push(`QR code "${token}" não encontrado`);
            break;
          }
          if (qr.equipmentId) {
            summary.push(`QR code "${token}" já está vinculado`);
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
          // Prefere itens ainda sem equipamento real vinculado.
          const target =
            candidates.find((e) => !e.linkedEquipmentId) ?? candidates[0];
          if (!target) {
            summary.push(
              `Nenhum equipamento encontrado em "${intent.environmentName}" para o QR "${token}"`
            );
            break;
          }
          if (target.linkedEquipmentId) {
            summary.push(
              `Equipamento em "${intent.environmentName}" já possui QR vinculado`
            );
            break;
          }

          // Cria o equipamento real (placeholder) e vincula QR ↔ item planejado.
          const equipmentId = await ctx.db.insert("equipment", {
            description: `${target.system} · ${target.ambiente}`.trim(),
            status: target.status,
            createdAt: Date.now(),
            projectEquipmentId: target._id,
          });
          await ctx.db.patch("projectEquipment", target._id, {
            linkedEquipmentId: equipmentId,
          });
          await ctx.db.patch("qrCodes", qr._id, {
            equipmentId,
            projectId: target.projectId,
          });
          await logEquipmentHistory(ctx, ctx.user, {
            equipmentId: target._id,
            action: "qr_assigned",
            newValue: qr.token,
          });
          summary.push(
            `QR "${qr.token}" vinculado a ${target.system} (${
              target.kind === "condensadora" ? "Cond." : "Evap."
            }) em ${intent.environmentName}`
          );
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
