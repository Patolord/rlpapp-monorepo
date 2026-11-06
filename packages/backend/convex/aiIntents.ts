import { defaultFloorLabel } from "./model/engineering/floors";
import { v } from "convex/values";
import { assistenteMutation } from "./lib/rbac";
import { logAudit, logEquipmentHistory } from "./lib/audit";
import { findOrCreateSystemInProject } from "./model/engineering/systems";
import type { Id } from "./_generated/dataModel";
import { aiIntentValidator, norm, resolveTower, resolveFloor, resolveEnvironment, gridValue, duplicateTowerDeep } from "./model/ai/intents";

export const applyIntents = assistenteMutation({
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
