import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import { isProjectArchived } from "../engineering/projects";
import { listBudgetSheets } from "./budgetPlan";
import { loadDisciplineStages, summarizeServices } from "./stages";

// Disciplinas de uma obra. A engenharia monta a lista de cada obra a partir
// das mais comuns, das abas do orçamento publicado ou criando na hora.

/** Nomes mais usados, oferecidos como atalho na criação. */
const COMMON_DISCIPLINE_NAMES = [
  "Infra AC",
  "Instalação AC",
  "Exaustão de lavabos",
  "Pressurização",
  "AC Pesado",
];

const MAX_NAME = 60;
/** Teto de disciplinas por obra (ativas e arquivadas). */
const DISCIPLINE_SCAN_LIMIT = 200;

function cleanName(name: string): string {
  const text = name.trim().replace(/\s+/g, " ");
  if (!text) throw new Error("Informe o nome da disciplina");
  if (text.length > MAX_NAME) throw new Error(`Use até ${MAX_NAME} caracteres no nome`);
  return text;
}

/** Disciplinas ativas da obra, na ordem definida pela engenharia. */
export async function loadActiveDisciplines(
  ctx: QueryCtx,
  projectId: Id<"projects">
): Promise<Doc<"projectDisciplines">[]> {
  const all = await ctx.db
    .query("projectDisciplines")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .take(DISCIPLINE_SCAN_LIMIT);
  return all
    .filter((discipline) => discipline.archivedAt === undefined)
    .sort((a, b) => a.order - b.order);
}

function assertUniqueName(
  disciplines: Doc<"projectDisciplines">[],
  name: string,
  exceptId?: Id<"projectDisciplines">
): void {
  const taken = disciplines.some(
    (discipline) =>
      discipline._id !== exceptId && discipline.name.toLowerCase() === name.toLowerCase()
  );
  if (taken) throw new Error(`Esta obra já tem a disciplina "${name}"`);
}

export async function createDiscipline(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: {
    projectId: Id<"projects">;
    name: string;
    budgetSheet?: string;
    fieldTeam: boolean;
  }
): Promise<Id<"projectDisciplines">> {
  const project = await ctx.db.get("projects", input.projectId);
  if (!project) throw new Error("Obra não encontrada");
  if (isProjectArchived(project)) throw new Error("Esta obra está arquivada");

  const name = cleanName(input.name);
  const disciplines = await loadActiveDisciplines(ctx, input.projectId);
  assertUniqueName(disciplines, name);

  const disciplineId = await ctx.db.insert("projectDisciplines", {
    projectId: input.projectId,
    name,
    budgetSheet: input.budgetSheet?.trim() || undefined,
    fieldTeam: input.fieldTeam,
    order: disciplines.reduce((max, discipline) => Math.max(max, discipline.order), 0) + 1,
    createdByUserId: user._id,
    createdAt: Date.now(),
  });
  await logAudit(ctx, user, {
    action: "create",
    tableName: "projectDisciplines",
    recordId: disciplineId,
    entityLabel: `${project.name}: ${name}`,
  });
  return disciplineId;
}

export async function updateDiscipline(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: {
    disciplineId: Id<"projectDisciplines">;
    name?: string;
    /** `null` desliga a disciplina do orçamento. */
    budgetSheet?: string | null;
    fieldTeam?: boolean;
  }
): Promise<void> {
  const discipline = await ctx.db.get("projectDisciplines", input.disciplineId);
  if (!discipline || discipline.archivedAt !== undefined) {
    throw new Error("Disciplina não encontrada");
  }

  const patch: Partial<Doc<"projectDisciplines">> = {};
  if (input.name !== undefined) {
    const name = cleanName(input.name);
    assertUniqueName(await loadActiveDisciplines(ctx, discipline.projectId), name, discipline._id);
    patch.name = name;
  }
  if (input.budgetSheet !== undefined) {
    patch.budgetSheet = input.budgetSheet?.trim() || undefined;
  }
  if (input.fieldTeam !== undefined) patch.fieldTeam = input.fieldTeam;

  await ctx.db.patch("projectDisciplines", discipline._id, patch);
  await logAudit(ctx, user, {
    action: "update",
    tableName: "projectDisciplines",
    recordId: discipline._id,
    entityLabel: patch.name ?? discipline.name,
    snapshotBefore: discipline,
  });
}

/** Tira a disciplina da obra sem apagar as etapas já registradas nela. */
export async function archiveDiscipline(
  ctx: MutationCtx,
  user: Doc<"users">,
  disciplineId: Id<"projectDisciplines">
): Promise<void> {
  const discipline = await ctx.db.get("projectDisciplines", disciplineId);
  if (!discipline || discipline.archivedAt !== undefined) return;
  await ctx.db.patch("projectDisciplines", disciplineId, { archivedAt: Date.now() });
  await logAudit(ctx, user, {
    action: "archive",
    tableName: "projectDisciplines",
    recordId: disciplineId,
    entityLabel: discipline.name,
  });
}

/** Nomes ainda não usados na obra: os mais comuns e as abas do orçamento. */
export async function listDisciplineSuggestions(
  ctx: QueryCtx,
  projectId: Id<"projects">
): Promise<{ common: string[]; budgetSheets: string[] }> {
  const used = new Set(
    (await loadActiveDisciplines(ctx, projectId)).map((discipline) =>
      discipline.name.toLowerCase()
    )
  );
  const budgetSheets = await listBudgetSheets(ctx, projectId);
  const fromBudget = new Set(budgetSheets.map((sheet) => sheet.toLowerCase()));
  return {
    common: COMMON_DISCIPLINE_NAMES.filter(
      (name) => !used.has(name.toLowerCase()) && !fromBudget.has(name.toLowerCase())
    ),
    budgetSheets: budgetSheets.filter((sheet) => !used.has(sheet.toLowerCase())),
  };
}

/** Andamento de uma disciplina: quantos serviços (locais) em cada situação. */
export async function summarizeDiscipline(ctx: QueryCtx, discipline: Doc<"projectDisciplines">) {
  const stages = await loadDisciplineStages(ctx, discipline._id);
  const services = [...summarizeServices(stages).values()];
  let last: Doc<"serviceStages"> | null = null;
  for (const stage of stages) {
    if (!last || stage.createdAt > last.createdAt) last = stage;
  }
  return {
    _id: discipline._id,
    name: discipline.name,
    budgetSheet: discipline.budgetSheet ?? null,
    fieldTeam: discipline.fieldTeam,
    stageCount: stages.length,
    openCount: services.filter((service) => service.last.outcome === "continues").length,
    concludedCount: services.filter((service) => service.last.outcome === "concluded").length,
    lastStage: last
      ? {
          description: last.description,
          location: last.location ?? null,
          createdAt: last.createdAt,
        }
      : null,
  };
}
