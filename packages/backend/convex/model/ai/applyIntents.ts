import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import {
  applyAddEquipment,
  applyAssignQr,
  applyCreateChecklistTemplate,
  applySetFloorDeadline,
  applyUpdateEquipment,
} from "./equipmentIntents";
import type { AiIntent, ApplyIntentsState } from "./intents";
import {
  applyCreateEnvironment,
  applyCreateFloors,
  applyCreateSystem,
  applyCreateTower,
  applyDuplicateTower,
  applyRenameEnvironment,
  applyResizeEnvironment,
  applyUpdateProject,
} from "./structureIntents";

/**
 * Aplica, em ordem, os intents revisados pelo usuário. Intents que não se
 * aplicam (entidade inexistente, duplicada...) entram no resumo sem abortar a
 * batch.
 */
export async function applyAiIntents(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: { projectId: Id<"projects">; intents: AiIntent[] }
): Promise<{ applied: number; summary: string[] }> {
  const project = await ctx.db.get("projects", input.projectId);
  if (!project) throw new Error("Obra não encontrada");

  const state: ApplyIntentsState = {
    projectId: input.projectId,
    towerCache: new Map(),
    summary: [],
    applied: 0,
  };

  for (const intent of input.intents) {
    switch (intent.type) {
      case "update_project":
        await applyUpdateProject(ctx, state, intent);
        break;
      case "create_tower":
        await applyCreateTower(ctx, state, intent);
        break;
      case "duplicate_tower":
        await applyDuplicateTower(ctx, state, intent);
        break;
      case "create_floors":
        await applyCreateFloors(ctx, state, intent);
        break;
      case "create_environment":
        await applyCreateEnvironment(ctx, state, intent);
        break;
      case "resize_environment":
        await applyResizeEnvironment(ctx, state, intent);
        break;
      case "create_system":
        await applyCreateSystem(ctx, state, intent);
        break;
      case "assign_qr":
        await applyAssignQr(ctx, user, state, intent);
        break;
      case "add_equipment":
        await applyAddEquipment(ctx, state, intent);
        break;
      case "create_checklist_template":
        await applyCreateChecklistTemplate(ctx, state, intent);
        break;
      case "set_floor_deadline":
        await applySetFloorDeadline(ctx, state, intent);
        break;
      case "update_equipment":
        await applyUpdateEquipment(ctx, state, intent);
        break;
      case "rename_environment":
        await applyRenameEnvironment(ctx, state, intent);
        break;
    }
  }

  await logAudit(ctx, user, {
    action: "ai_apply",
    tableName: "projects",
    recordId: input.projectId,
    details: `${state.applied} intent(s) aplicados`,
  });

  return { applied: state.applied, summary: state.summary };
}
