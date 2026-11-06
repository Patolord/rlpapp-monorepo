import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { logEquipmentHistory } from "../../lib/audit";
import { findOrCreateSystemInProject } from "../engineering/systems";
import {
  norm,
  resolveEnvironment,
  resolveFloor,
  resolveTowerOrReport,
  type AiIntentOf,
  type ApplyIntentsState,
} from "./intents";

/** Intents de equipamentos da obra: QR, itens planejados, checklists e prazos. */

/**
 * Resolve torre → andar → ambiente pelo nome, registrando no resumo o
 * primeiro nível não encontrado (mensagens curtas, sem citar a torre).
 */
async function resolveEnvironmentOrReport(
  ctx: MutationCtx,
  state: ApplyIntentsState,
  intent: { towerName: string; floorNumber: number; environmentName: string }
) {
  const towerId = await resolveTowerOrReport(ctx, state, intent.towerName);
  if (!towerId) return null;
  const floorId = await resolveFloor(ctx, towerId, intent.floorNumber);
  if (!floorId) {
    state.summary.push(`Andar ${intent.floorNumber} não encontrado`);
    return null;
  }
  const envId = await resolveEnvironment(ctx, floorId, intent.environmentName);
  if (!envId) {
    state.summary.push(`Ambiente "${intent.environmentName}" não encontrado`);
    return null;
  }
  return { towerId, floorId, envId };
}

/** Itens planejados do ambiente, filtrados por tipo e sistema quando informados. */
async function listEnvironmentCandidates(
  ctx: MutationCtx,
  envId: Id<"environments">,
  filter: { kind?: Doc<"projectEquipment">["kind"]; system?: string }
) {
  let candidates = await ctx.db
    .query("projectEquipment")
    .withIndex("by_environment", (q) => q.eq("environmentId", envId))
    .collect();
  if (filter.kind) {
    candidates = candidates.filter((e) => e.kind === filter.kind);
  }
  if (filter.system) {
    const sysKey = norm(filter.system);
    candidates = candidates.filter((e) => norm(e.system) === sysKey);
  }
  return candidates;
}

export async function applyAssignQr(
  ctx: MutationCtx,
  user: Doc<"users">,
  state: ApplyIntentsState,
  intent: AiIntentOf<"assign_qr">
) {
  const token = intent.token.trim();
  if (!token) return;
  const resolved = await resolveEnvironmentOrReport(ctx, state, intent);
  if (!resolved) return;

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
    state.summary.push(`QR code "${token}" não encontrado`);
    return;
  }
  if (qr.equipmentId) {
    state.summary.push(`QR code "${token}" já está vinculado`);
    return;
  }

  const candidates = await listEnvironmentCandidates(ctx, resolved.envId, intent);
  // Prefere itens ainda sem equipamento real vinculado.
  const target = candidates.find((e) => !e.linkedEquipmentId) ?? candidates[0];
  if (!target) {
    state.summary.push(
      `Nenhum equipamento encontrado em "${intent.environmentName}" para o QR "${token}"`
    );
    return;
  }
  if (target.linkedEquipmentId) {
    state.summary.push(
      `Equipamento em "${intent.environmentName}" já possui QR vinculado`
    );
    return;
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
  await logEquipmentHistory(ctx, user, {
    equipmentId: target._id,
    action: "qr_assigned",
    newValue: qr.token,
  });
  state.summary.push(
    `QR "${qr.token}" vinculado a ${target.system} (${
      target.kind === "condensadora" ? "Cond." : "Evap."
    }) em ${intent.environmentName}`
  );
  state.applied++;
}

export async function applyAddEquipment(
  ctx: MutationCtx,
  state: ApplyIntentsState,
  intent: AiIntentOf<"add_equipment">
) {
  const resolved = await resolveEnvironmentOrReport(ctx, state, intent);
  if (!resolved) return;
  const system = await findOrCreateSystemInProject(
    ctx,
    state.projectId,
    intent.system
  );
  await ctx.db.insert("projectEquipment", {
    projectId: state.projectId,
    environmentId: resolved.envId,
    towerId: resolved.towerId,
    floorId: resolved.floorId,
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
  state.summary.push(
    `Equipamento "${intent.system}" adicionado em ${intent.environmentName}`
  );
  state.applied++;
}

export async function applyUpdateEquipment(
  ctx: MutationCtx,
  state: ApplyIntentsState,
  intent: AiIntentOf<"update_equipment">
) {
  const resolved = await resolveEnvironmentOrReport(ctx, state, intent);
  if (!resolved) return;
  const candidates = await listEnvironmentCandidates(ctx, resolved.envId, intent);
  if (candidates.length === 0) {
    state.summary.push(
      `Nenhum equipamento encontrado em "${intent.environmentName}"`
    );
    return;
  }
  const updates: Record<string, unknown> = {};
  if (intent.deadline !== undefined) updates.deadline = intent.deadline;
  if (intent.modelo !== undefined) updates.modelo = intent.modelo;
  if (intent.capacidade !== undefined) updates.capacidade = intent.capacidade;
  if (intent.status !== undefined) updates.status = intent.status;
  if (Object.keys(updates).length === 0) {
    state.summary.push("Nenhuma alteração especificada");
    return;
  }
  for (const eq of candidates) {
    await ctx.db.patch("projectEquipment", eq._id, updates);
  }
  state.summary.push(
    `${candidates.length} equipamento(s) atualizado(s) em "${intent.environmentName}"`
  );
  state.applied++;
}

export async function applySetFloorDeadline(
  ctx: MutationCtx,
  state: ApplyIntentsState,
  intent: AiIntentOf<"set_floor_deadline">
) {
  const towerId = await resolveTowerOrReport(ctx, state, intent.towerName);
  if (!towerId) return;
  const floorId = await resolveFloor(ctx, towerId, intent.floorNumber);
  if (!floorId) {
    state.summary.push(
      `Andar ${intent.floorNumber} não encontrado na torre "${intent.towerName}"`
    );
    return;
  }
  const floorEquipments = await ctx.db
    .query("projectEquipment")
    .withIndex("by_project", (q) => q.eq("projectId", state.projectId))
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
  state.summary.push(
    `Prazo de ${updated} equipamento(s) do ${intent.floorNumber}º andar alterado para ${dateStr}`
  );
  if (updated > 0) state.applied++;
}

export async function applyCreateChecklistTemplate(
  ctx: MutationCtx,
  state: ApplyIntentsState,
  intent: AiIntentOf<"create_checklist_template">
) {
  const name = intent.name.trim();
  if (!name) return;
  await ctx.db.insert("checklistTemplates", {
    projectId: state.projectId,
    name,
    items: intent.items
      .map((i) => ({ label: i.label.trim(), required: i.required }))
      .filter((i) => i.label),
    createdAt: Date.now(),
  });
  state.summary.push(`Checklist "${name}" criado`);
  state.applied++;
}
