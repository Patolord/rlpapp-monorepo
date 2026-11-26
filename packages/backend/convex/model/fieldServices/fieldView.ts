import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { hasPermission } from "../../lib/rbac";
import { assertTechnicianProjectAccess } from "../engineering/projects";
import { loadPlannedLines, type PlannedLine } from "./budgetPlan";
import { loadActiveDisciplines, summarizeDiscipline } from "./disciplines";
import {
  loadDisciplineStages,
  loadRecentProjectStages,
  loadServiceStages,
  summarizeServices,
  toStageRows,
} from "./stages";

// O que o técnico vê no app: disciplinas da obra, os serviços (locais) de cada
// uma, as etapas e os materiais previstos de um serviço, a equipe e o que ele
// mesmo fez. Tudo exige estar na obra (ou enxergar todas as obras).

/** Situação de um serviço: sem etapa, parado esperando continuar ou concluído. */
export type ServiceStatus = "todo" | "waiting" | "concluded";

function statusOf(last: Doc<"serviceStages"> | null): ServiceStatus {
  if (!last) return "todo";
  return last.outcome === "concluded" ? "concluded" : "waiting";
}

function byLocationName(a: { location: string | null }, b: { location: string | null }): number {
  // Sem local (a disciplina inteira) vem primeiro; o resto em ordem natural,
  // para "Apto 2" ficar antes de "Apto 10".
  if (a.location === null) return b.location === null ? 0 : -1;
  if (b.location === null) return 1;
  return a.location.localeCompare(b.location, "pt-BR", { numeric: true, sensitivity: "base" });
}

export async function listFieldDisciplines(
  ctx: QueryCtx,
  user: Doc<"users">,
  projectId: Id<"projects">
) {
  await assertTechnicianProjectAccess(ctx, user, projectId);
  const disciplines = await loadActiveDisciplines(ctx, projectId);
  const rows = [];
  for (const discipline of disciplines) {
    rows.push(await summarizeDiscipline(ctx, discipline));
  }
  return rows;
}

async function loadFieldDiscipline(
  ctx: QueryCtx,
  user: Doc<"users">,
  disciplineId: Id<"projectDisciplines">
): Promise<Doc<"projectDisciplines"> | null> {
  const discipline = await ctx.db.get("projectDisciplines", disciplineId);
  if (!discipline || discipline.archivedAt !== undefined) return null;
  await assertTechnicianProjectAccess(ctx, user, discipline.projectId);
  return discipline;
}

async function plannedLinesOf(
  ctx: QueryCtx,
  discipline: Doc<"projectDisciplines">
): Promise<PlannedLine[]> {
  if (!discipline.budgetSheet) return [];
  return await loadPlannedLines(ctx, discipline.projectId, discipline.budgetSheet);
}

/** Uma disciplina com seus serviços: os locais do orçamento e os que já têm etapa. */
export async function getFieldDiscipline(
  ctx: QueryCtx,
  user: Doc<"users">,
  disciplineId: Id<"projectDisciplines">
) {
  const discipline = await loadFieldDiscipline(ctx, user, disciplineId);
  if (!discipline) return null;

  const planned = await plannedLinesOf(ctx, discipline);
  const started = summarizeServices(await loadDisciplineStages(ctx, discipline._id));

  const services = new Map<
    string,
    {
      locationKey: string;
      location: string | null;
      status: ServiceStatus;
      pendingNote: string | null;
      lastStageAt: number | null;
      stageCount: number;
      materialCount: number;
    }
  >();
  for (const line of planned) {
    const current = services.get(line.locationKey);
    if (current) {
      current.materialCount += 1;
      continue;
    }
    services.set(line.locationKey, {
      locationKey: line.locationKey,
      location: line.location,
      status: "todo",
      pendingNote: null,
      lastStageAt: null,
      stageCount: 0,
      materialCount: 1,
    });
  }
  for (const service of started.values()) {
    const current = services.get(service.locationKey);
    const status = statusOf(service.last);
    services.set(service.locationKey, {
      locationKey: service.locationKey,
      // O nome do orçamento vale sobre o digitado em campo.
      location: current?.location ?? service.location,
      status,
      pendingNote: status === "waiting" ? (service.last.pendingNote ?? null) : null,
      lastStageAt: service.last.createdAt,
      stageCount: service.stageCount,
      materialCount: current?.materialCount ?? 0,
    });
  }

  return {
    _id: discipline._id,
    projectId: discipline.projectId,
    name: discipline.name,
    fieldTeam: discipline.fieldTeam,
    hasBudget: discipline.budgetSheet !== undefined,
    services: [...services.values()].sort(byLocationName),
  };
}

/** Um serviço (disciplina + local): etapas, situação e materiais previstos. */
export async function getFieldService(
  ctx: QueryCtx,
  user: Doc<"users">,
  input: { disciplineId: Id<"projectDisciplines">; locationKey: string }
) {
  const discipline = await loadFieldDiscipline(ctx, user, input.disciplineId);
  if (!discipline) return null;

  const stages = (await loadServiceStages(ctx, discipline._id, input.locationKey)).sort(
    (a, b) => b.createdAt - a.createdAt
  );
  const planned = (await plannedLinesOf(ctx, discipline)).filter(
    (line) => line.locationKey === input.locationKey
  );
  const last = stages[0] ?? null;
  const status = statusOf(last);

  return {
    disciplineId: discipline._id,
    disciplineName: discipline.name,
    projectId: discipline.projectId,
    fieldTeam: discipline.fieldTeam,
    locationKey: input.locationKey,
    location: planned[0]?.location ?? last?.location ?? null,
    status,
    pendingNote: status === "waiting" ? (last?.pendingNote ?? null) : null,
    stages: await toStageRows(ctx, stages, new Map([[discipline._id, discipline.name]])),
    materials: planned.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
    })),
  };
}

/** Quem está na obra, para o técnico ver a equipe e marcar quem fez a etapa. */
export async function listFieldTeam(
  ctx: QueryCtx,
  user: Doc<"users">,
  projectId: Id<"projects">
) {
  const project = await assertTechnicianProjectAccess(ctx, user, projectId);
  const members = [];
  for (const technicianId of project.technicianIds ?? []) {
    const technician = await ctx.db.get("users", technicianId);
    if (!technician || !technician.isActive) continue;
    members.push({
      _id: technician._id,
      name: technician.name,
      // Técnico líder é quem enxerga todas as obras no campo.
      leader: hasPermission(technician, "campo.todas_obras"),
      isMe: technician._id === user._id,
    });
  }
  members.sort((a, b) => Number(b.leader) - Number(a.leader) || a.name.localeCompare(b.name, "pt-BR"));

  const responsible = project.responsibleId
    ? await ctx.db.get("users", project.responsibleId)
    : null;
  return { members, responsibleName: responsible?.name ?? null };
}

/** As etapas em que o usuário participou (ou que registrou) nesta obra. */
export async function listMyStages(
  ctx: QueryCtx,
  user: Doc<"users">,
  projectId: Id<"projects">
) {
  await assertTechnicianProjectAccess(ctx, user, projectId);
  const mine = (await loadRecentProjectStages(ctx, projectId, 500))
    .filter(
      (stage) => stage.createdByUserId === user._id || stage.participantIds.includes(user._id)
    )
    .slice(0, 100);

  const names = new Map<Id<"projectDisciplines">, string>();
  for (const stage of mine) {
    if (names.has(stage.disciplineId)) continue;
    const discipline = await ctx.db.get("projectDisciplines", stage.disciplineId);
    if (discipline) names.set(discipline._id, discipline.name);
  }
  return await toStageRows(ctx, mine, names);
}
