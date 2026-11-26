import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import { serviceStageOutcome } from "../../schema/fieldServices";
import { assertTechnicianProjectAccess, isProjectArchived } from "../engineering/projects";

// Etapas de serviço: o que a equipe registra em campo. Um serviço é o par
// disciplina + local, e a situação dele é a da última etapa registrada.

const MAX_TEXT = 200;
const MAX_LOCATION = 80;
const MAX_PARTICIPANTS = 20;
export const MAX_STAGE_PHOTOS = 10;
/** Teto de etapas lidas por disciplina (e por obra, no histórico). */
const STAGE_SCAN_LIMIT = 500;

/** Local normalizado: é a chave que junta as etapas de um mesmo serviço. */
export function locationKeyOf(location: string | null | undefined): string {
  return (location ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function cleanText(value: string, max: number, label: string): string {
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length > max) {
    throw new Error(`${label}: use até ${max} caracteres`);
  }
  return text;
}

// ---------------------------------------------------------------------------
// Leitura compartilhada
// ---------------------------------------------------------------------------

export async function loadDisciplineStages(
  ctx: QueryCtx,
  disciplineId: Id<"projectDisciplines">
): Promise<Doc<"serviceStages">[]> {
  return await ctx.db
    .query("serviceStages")
    .withIndex("by_discipline_and_locationKey", (q) => q.eq("disciplineId", disciplineId))
    .take(STAGE_SCAN_LIMIT);
}

export async function loadServiceStages(
  ctx: QueryCtx,
  disciplineId: Id<"projectDisciplines">,
  locationKey: string
): Promise<Doc<"serviceStages">[]> {
  return await ctx.db
    .query("serviceStages")
    .withIndex("by_discipline_and_locationKey", (q) =>
      q.eq("disciplineId", disciplineId).eq("locationKey", locationKey)
    )
    .take(STAGE_SCAN_LIMIT);
}

/** Últimas etapas da obra, da mais nova para a mais antiga. */
export async function loadRecentProjectStages(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  limit: number
): Promise<Doc<"serviceStages">[]> {
  return await ctx.db
    .query("serviceStages")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .order("desc")
    .take(Math.min(Math.max(limit, 1), STAGE_SCAN_LIMIT));
}

export type ServiceSummary = {
  locationKey: string;
  location: string | null;
  stageCount: number;
  last: Doc<"serviceStages">;
};

/** Agrupa as etapas por local, guardando a mais recente de cada um. */
export function summarizeServices(stages: Doc<"serviceStages">[]): Map<string, ServiceSummary> {
  const byLocation = new Map<string, ServiceSummary>();
  for (const stage of stages) {
    const current = byLocation.get(stage.locationKey);
    if (!current) {
      byLocation.set(stage.locationKey, {
        locationKey: stage.locationKey,
        location: stage.location ?? null,
        stageCount: 1,
        last: stage,
      });
      continue;
    }
    current.stageCount += 1;
    if (stage.createdAt >= current.last.createdAt) {
      current.last = stage;
      current.location = stage.location ?? current.location;
    }
  }
  return byLocation;
}

export const stageRowValidator = v.object({
  _id: v.id("serviceStages"),
  disciplineId: v.id("projectDisciplines"),
  disciplineName: v.string(),
  location: v.union(v.string(), v.null()),
  locationKey: v.string(),
  description: v.string(),
  outcome: serviceStageOutcome,
  pendingNote: v.union(v.string(), v.null()),
  participants: v.array(v.object({ _id: v.id("users"), name: v.string() })),
  photoUrls: v.array(v.string()),
  createdByUserId: v.id("users"),
  createdAt: v.number(),
  reviewedAt: v.union(v.number(), v.null()),
});

type UserNames = Map<Id<"users">, string>;

async function userName(ctx: QueryCtx, names: UserNames, userId: Id<"users">): Promise<string> {
  const cached = names.get(userId);
  if (cached !== undefined) return cached;
  const user = await ctx.db.get("users", userId);
  const name = user?.name ?? "Usuário removido";
  names.set(userId, name);
  return name;
}

/** Linhas de etapa para as telas (nomes de quem fez e links das fotos). */
export async function toStageRows(
  ctx: QueryCtx,
  stages: Doc<"serviceStages">[],
  disciplineNames: Map<Id<"projectDisciplines">, string>
) {
  const names: UserNames = new Map();
  const rows = [];
  for (const stage of stages) {
    const participants = [];
    for (const userId of stage.participantIds) {
      participants.push({ _id: userId, name: await userName(ctx, names, userId) });
    }
    const urls = await Promise.all(stage.photoIds.map((id) => ctx.storage.getUrl(id)));
    rows.push({
      _id: stage._id,
      disciplineId: stage.disciplineId,
      disciplineName: disciplineNames.get(stage.disciplineId) ?? "Disciplina removida",
      location: stage.location ?? null,
      locationKey: stage.locationKey,
      description: stage.description,
      outcome: stage.outcome,
      pendingNote: stage.pendingNote ?? null,
      participants,
      photoUrls: urls.filter((url): url is string => url !== null),
      createdByUserId: stage.createdByUserId,
      createdAt: stage.createdAt,
      reviewedAt: stage.reviewedAt ?? null,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

/**
 * Registra uma etapa. Quem está na obra (ou vê todas as obras) registra; quem
 * fez pode ser qualquer pessoa da equipe da obra, porque atuam juntos.
 */
export async function registerStage(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: {
    disciplineId: Id<"projectDisciplines">;
    location?: string;
    description: string;
    outcome: "continues" | "concluded";
    pendingNote?: string;
    participantIds: Id<"users">[];
    photoIds: Id<"_storage">[];
  }
): Promise<Id<"serviceStages">> {
  const discipline = await ctx.db.get("projectDisciplines", input.disciplineId);
  if (!discipline || discipline.archivedAt !== undefined) {
    throw new Error("Disciplina não encontrada");
  }
  const project = await assertTechnicianProjectAccess(ctx, user, discipline.projectId);
  if (isProjectArchived(project)) throw new Error("Esta obra está arquivada");
  if (!discipline.fieldTeam) {
    throw new Error("Esta disciplina é de outra equipe; aqui você só acompanha");
  }

  const description = cleanText(input.description, MAX_TEXT, "O que foi feito");
  if (!description) throw new Error("Descreva o que foi feito");
  const location = cleanText(input.location ?? "", MAX_LOCATION, "Local");
  const pendingNote =
    input.outcome === "continues"
      ? cleanText(input.pendingNote ?? "", MAX_TEXT, "O que falta")
      : "";
  if (input.photoIds.length > MAX_STAGE_PHOTOS) {
    throw new Error(`Envie até ${MAX_STAGE_PHOTOS} fotos por etapa`);
  }

  const team = new Set<Id<"users">>(project.technicianIds ?? []);
  const participantIds = [...new Set(input.participantIds)];
  if (participantIds.length === 0) participantIds.push(user._id);
  if (participantIds.length > MAX_PARTICIPANTS) {
    throw new Error(`Marque até ${MAX_PARTICIPANTS} pessoas por etapa`);
  }
  for (const participantId of participantIds) {
    if (participantId !== user._id && !team.has(participantId)) {
      throw new Error("Só quem está na equipe da obra pode ser marcado na etapa");
    }
  }

  const stageId = await ctx.db.insert("serviceStages", {
    projectId: discipline.projectId,
    disciplineId: discipline._id,
    location: location || undefined,
    locationKey: locationKeyOf(location),
    description,
    outcome: input.outcome,
    pendingNote: pendingNote || undefined,
    participantIds,
    photoIds: input.photoIds,
    createdByUserId: user._id,
    createdAt: Date.now(),
  });
  await logAudit(ctx, user, {
    action: "create",
    tableName: "serviceStages",
    recordId: stageId,
    entityLabel: `${discipline.name}${location ? ` · ${location}` : ""}: ${description}`,
  });
  return stageId;
}

/** Quem registrou apaga a própria etapa enquanto a engenharia não conferiu. */
export async function removeOwnStage(
  ctx: MutationCtx,
  user: Doc<"users">,
  stageId: Id<"serviceStages">
): Promise<void> {
  const stage = await ctx.db.get("serviceStages", stageId);
  if (!stage) throw new Error("Etapa não encontrada");
  if (stage.createdByUserId !== user._id) {
    throw new Error("Só quem registrou a etapa pode apagá-la");
  }
  if (stage.reviewedAt !== undefined) {
    throw new Error("A engenharia já conferiu esta etapa");
  }
  for (const photoId of stage.photoIds) {
    await ctx.storage.delete(photoId);
  }
  await ctx.db.delete("serviceStages", stageId);
  await logAudit(ctx, user, {
    action: "delete",
    tableName: "serviceStages",
    recordId: stageId,
    entityLabel: stage.description,
    snapshotBefore: stage,
  });
}

/** Conferência da engenharia: marca (ou desmarca) a etapa como conferida. */
export async function setStageReviewed(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: { stageId: Id<"serviceStages">; reviewed: boolean }
): Promise<void> {
  const stage = await ctx.db.get("serviceStages", input.stageId);
  if (!stage) throw new Error("Etapa não encontrada");
  if ((stage.reviewedAt !== undefined) === input.reviewed) return;
  await ctx.db.patch("serviceStages", stage._id, {
    reviewedAt: input.reviewed ? Date.now() : undefined,
    reviewedByUserId: input.reviewed ? user._id : undefined,
  });
  await logAudit(ctx, user, {
    action: "update",
    tableName: "serviceStages",
    recordId: stage._id,
    entityLabel: stage.description,
    details: input.reviewed ? "Etapa conferida" : "Conferência desfeita",
  });
}
