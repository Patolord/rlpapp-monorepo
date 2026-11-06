import type { MutationCtx } from "../../_generated/server";
import { defaultFloorLabel } from "../engineering/floors";
import {
  duplicateTowerDeep,
  gridValue,
  norm,
  resolveEnvironment,
  resolveFloor,
  resolveTower,
  resolveTowerOrReport,
  type AiIntentOf,
  type ApplyIntentsState,
} from "./intents";

/** Intents de estrutura da obra: dados, torres, andares, ambientes e sistemas. */

export async function applyUpdateProject(
  ctx: MutationCtx,
  state: ApplyIntentsState,
  intent: AiIntentOf<"update_project">
) {
  const updates: Record<string, unknown> = {};
  if (intent.client !== undefined) updates.client = intent.client.trim();
  if (intent.address !== undefined) updates.address = intent.address.trim();
  if (intent.status !== undefined) updates.status = intent.status;
  if (intent.startDate !== undefined) updates.startDate = intent.startDate;
  if (intent.endDate !== undefined) updates.endDate = intent.endDate;
  if (Object.keys(updates).length > 0) {
    await ctx.db.patch("projects", state.projectId, updates);
    state.summary.push("Dados da obra atualizados");
    state.applied++;
  }
}

export async function applyCreateTower(
  ctx: MutationCtx,
  state: ApplyIntentsState,
  intent: AiIntentOf<"create_tower">
) {
  const name = intent.name.trim();
  if (!name) return;
  const existing = await resolveTower(
    ctx,
    state.projectId,
    state.towerCache,
    name
  );
  if (existing) {
    state.summary.push(`Torre "${name}" já existe`);
    return;
  }
  const towers = await ctx.db
    .query("towers")
    .withIndex("by_project", (q) => q.eq("projectId", state.projectId))
    .collect();
  const towerId = await ctx.db.insert("towers", {
    projectId: state.projectId,
    name,
    order: towers.length,
    createdAt: Date.now(),
  });
  state.towerCache.set(norm(name), towerId);
  state.summary.push(`Torre "${name}" criada`);
  state.applied++;
}

export async function applyDuplicateTower(
  ctx: MutationCtx,
  state: ApplyIntentsState,
  intent: AiIntentOf<"duplicate_tower">
) {
  const sourceId = await resolveTowerOrReport(ctx, state, intent.towerName);
  if (!sourceId) return;
  const count = await duplicateTowerDeep(ctx, sourceId, intent.newName?.trim());
  state.summary.push(`Torre "${intent.towerName}" duplicada (${count} andar(es))`);
  state.applied++;
}

export async function applyCreateFloors(
  ctx: MutationCtx,
  state: ApplyIntentsState,
  intent: AiIntentOf<"create_floors">
) {
  const towerId = await resolveTowerOrReport(ctx, state, intent.towerName);
  if (!towerId) return;
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
      projectId: state.projectId,
      number: n,
      label: defaultFloorLabel(n),
      createdAt: Date.now(),
    });
    created++;
  }
  state.summary.push(
    `${created} andar(es) criados na torre "${intent.towerName}"`
  );
  if (created > 0) state.applied++;
}

export async function applyCreateEnvironment(
  ctx: MutationCtx,
  state: ApplyIntentsState,
  intent: AiIntentOf<"create_environment">
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
  const name = intent.name.trim();
  const existing = await resolveEnvironment(ctx, floorId, name);
  if (existing) {
    state.summary.push(`Ambiente "${name}" já existe`);
    return;
  }
  const envs = await ctx.db
    .query("environments")
    .withIndex("by_floor", (q) => q.eq("floorId", floorId))
    .collect();
  await ctx.db.insert("environments", {
    floorId,
    towerId,
    projectId: state.projectId,
    name,
    type: intent.envType?.trim() || undefined,
    order: envs.length,
    col: gridValue(intent.col),
    colSpan: gridValue(intent.colSpan),
    rowSpan: gridValue(intent.rowSpan),
    createdAt: Date.now(),
  });
  state.summary.push(`Ambiente "${name}" criado`);
  state.applied++;
}

export async function applyResizeEnvironment(
  ctx: MutationCtx,
  state: ApplyIntentsState,
  intent: AiIntentOf<"resize_environment">
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
  const envId = await resolveEnvironment(ctx, floorId, intent.name);
  if (!envId) {
    state.summary.push(`Ambiente "${intent.name}" não encontrado`);
    return;
  }
  const updates: Record<string, number> = {};
  const col = gridValue(intent.col);
  if (col !== undefined) updates.col = col;
  const colSpan = gridValue(intent.colSpan);
  if (colSpan !== undefined) updates.colSpan = colSpan;
  const rowSpan = gridValue(intent.rowSpan);
  if (rowSpan !== undefined) updates.rowSpan = rowSpan;
  if (Object.keys(updates).length === 0) {
    state.summary.push(`Nenhum tamanho válido informado para "${intent.name}"`);
    return;
  }
  await ctx.db.patch("environments", envId, updates);
  const parts: string[] = [];
  if (updates.col !== undefined) parts.push(`coluna ${updates.col}`);
  if (updates.colSpan !== undefined) parts.push(`largura ${updates.colSpan}`);
  if (updates.rowSpan !== undefined) parts.push(`${updates.rowSpan} andar(es)`);
  state.summary.push(
    `Ambiente "${intent.name}" redimensionado (${parts.join(", ")})`
  );
  state.applied++;
}

export async function applyRenameEnvironment(
  ctx: MutationCtx,
  state: ApplyIntentsState,
  intent: AiIntentOf<"rename_environment">
) {
  const towerId = await resolveTowerOrReport(ctx, state, intent.towerName);
  if (!towerId) return;
  const floorId = await resolveFloor(ctx, towerId, intent.floorNumber);
  if (!floorId) {
    state.summary.push(`Andar ${intent.floorNumber} não encontrado`);
    return;
  }
  const envId = await resolveEnvironment(ctx, floorId, intent.oldName);
  if (!envId) {
    state.summary.push(`Ambiente "${intent.oldName}" não encontrado`);
    return;
  }
  await ctx.db.patch("environments", envId, { name: intent.newName.trim() });
  state.summary.push(
    `Ambiente "${intent.oldName}" renomeado para "${intent.newName}"`
  );
  state.applied++;
}

export async function applyCreateSystem(
  ctx: MutationCtx,
  state: ApplyIntentsState,
  intent: AiIntentOf<"create_system">
) {
  const name = intent.name.trim();
  if (!name) return;
  const existing = await ctx.db
    .query("systems")
    .withIndex("by_project", (q) => q.eq("projectId", state.projectId))
    .collect();
  const match = existing.find(
    (s) => s.name.toLowerCase() === name.toLowerCase()
  );
  if (match) {
    const updates: Record<string, string> = {};
    if (intent.systemType?.trim()) updates.type = intent.systemType.trim();
    if (intent.obs?.trim()) updates.obs = intent.obs.trim();
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch("systems", match._id, updates);
      state.summary.push(`Sistema "${match.name}" atualizado`);
      state.applied++;
    } else {
      state.summary.push(`Sistema "${match.name}" já existe`);
    }
    return;
  }
  await ctx.db.insert("systems", {
    projectId: state.projectId,
    name,
    type: intent.systemType?.trim() || undefined,
    obs: intent.obs?.trim() || undefined,
    createdAt: Date.now(),
  });
  state.summary.push(`Sistema "${name}" criado`);
  state.applied++;
}
