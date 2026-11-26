import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { loadActiveDisciplines, summarizeDiscipline } from "./disciplines";
import { loadRecentProjectStages, toStageRows } from "./stages";

// O que a engenharia acompanha no dashboard: as disciplinas da obra com o
// andamento de cada uma e o histórico de etapas, da mais nova para a mais antiga.

export async function listOfficeDisciplines(ctx: QueryCtx, projectId: Id<"projects">) {
  const rows = [];
  for (const discipline of await loadActiveDisciplines(ctx, projectId)) {
    rows.push(await summarizeDiscipline(ctx, discipline));
  }
  return rows;
}

export async function listOfficeStages(
  ctx: QueryCtx,
  input: { projectId: Id<"projects">; limit: number }
) {
  const stages = await loadRecentProjectStages(ctx, input.projectId, input.limit);
  const disciplineNames = new Map<Id<"projectDisciplines">, string>();
  const authors = new Map<Id<"users">, Doc<"users"> | null>();
  for (const stage of stages) {
    if (!disciplineNames.has(stage.disciplineId)) {
      // Inclui as arquivadas: a etapa continua no histórico.
      const discipline = await ctx.db.get("projectDisciplines", stage.disciplineId);
      if (discipline) disciplineNames.set(discipline._id, discipline.name);
    }
    if (!authors.has(stage.createdByUserId)) {
      authors.set(stage.createdByUserId, await ctx.db.get("users", stage.createdByUserId));
    }
  }
  const rows = await toStageRows(ctx, stages, disciplineNames);
  return rows.map((row) => ({
    ...row,
    createdByName: authors.get(row.createdByUserId)?.name ?? "Usuário removido",
  }));
}
