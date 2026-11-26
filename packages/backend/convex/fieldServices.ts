import { v } from "convex/values";
import { authedMutation, authedQuery, servicosMutation, servicosQuery } from "./lib/rbac";
import {
  archiveDiscipline,
  createDiscipline,
  listDisciplineSuggestions,
  updateDiscipline,
} from "./model/fieldServices/disciplines";
import {
  getFieldDiscipline,
  getFieldService,
  listFieldDisciplines,
  listFieldTeam,
  listMyStages,
} from "./model/fieldServices/fieldView";
import { listOfficeDisciplines, listOfficeStages } from "./model/fieldServices/officeView";
import {
  registerStage,
  removeOwnStage,
  setStageReviewed,
  stageRowValidator,
} from "./model/fieldServices/stages";
import { serviceStageOutcome } from "./schema/fieldServices";

// Serviços de campo: a engenharia define as disciplinas de cada obra e a
// equipe registra pelo app as etapas de cada serviço (disciplina + local).
// As funções do técnico usam `authed*`; o acesso à obra é conferido no modelo.

const disciplineSummaryValidator = v.object({
  _id: v.id("projectDisciplines"),
  name: v.string(),
  budgetSheet: v.union(v.string(), v.null()),
  fieldTeam: v.boolean(),
  stageCount: v.number(),
  // Serviços (locais) cuja última etapa continua depois / foi concluída.
  openCount: v.number(),
  concludedCount: v.number(),
  lastStage: v.union(
    v.object({
      description: v.string(),
      location: v.union(v.string(), v.null()),
      createdAt: v.number(),
    }),
    v.null()
  ),
});

const serviceStatusValidator = v.union(
  v.literal("todo"),
  v.literal("waiting"),
  v.literal("concluded")
);

// ---------------------------------------------------------------------------
// App do técnico
// ---------------------------------------------------------------------------

export const listDisciplines = authedQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(disciplineSummaryValidator),
  handler: async (ctx, args) => await listFieldDisciplines(ctx, ctx.user, args.projectId),
});

// Uma disciplina com os serviços dela: os locais do orçamento e os que já têm etapa.
export const getDiscipline = authedQuery({
  args: { disciplineId: v.id("projectDisciplines") },
  returns: v.union(
    v.object({
      _id: v.id("projectDisciplines"),
      projectId: v.id("projects"),
      name: v.string(),
      fieldTeam: v.boolean(),
      hasBudget: v.boolean(),
      services: v.array(
        v.object({
          locationKey: v.string(),
          location: v.union(v.string(), v.null()),
          status: serviceStatusValidator,
          pendingNote: v.union(v.string(), v.null()),
          lastStageAt: v.union(v.number(), v.null()),
          stageCount: v.number(),
          materialCount: v.number(),
        })
      ),
    }),
    v.null()
  ),
  handler: async (ctx, args) => await getFieldDiscipline(ctx, ctx.user, args.disciplineId),
});

// Um serviço (disciplina + local): etapas, situação e materiais previstos no
// orçamento (sem preço).
export const getService = authedQuery({
  args: { disciplineId: v.id("projectDisciplines"), locationKey: v.string() },
  returns: v.union(
    v.object({
      disciplineId: v.id("projectDisciplines"),
      disciplineName: v.string(),
      projectId: v.id("projects"),
      fieldTeam: v.boolean(),
      locationKey: v.string(),
      location: v.union(v.string(), v.null()),
      status: serviceStatusValidator,
      pendingNote: v.union(v.string(), v.null()),
      stages: v.array(stageRowValidator),
      materials: v.array(
        v.object({
          description: v.string(),
          quantity: v.union(v.number(), v.null()),
          unit: v.union(v.string(), v.null()),
        })
      ),
    }),
    v.null()
  ),
  handler: async (ctx, args) => await getFieldService(ctx, ctx.user, args),
});

export const listTeam = authedQuery({
  args: { projectId: v.id("projects") },
  returns: v.object({
    members: v.array(
      v.object({
        _id: v.id("users"),
        name: v.string(),
        leader: v.boolean(),
        isMe: v.boolean(),
      })
    ),
    responsibleName: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => await listFieldTeam(ctx, ctx.user, args.projectId),
});

// Etapas em que o usuário participou nesta obra (o "o que eu fiz").
export const listMine = authedQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(stageRowValidator),
  handler: async (ctx, args) => await listMyStages(ctx, ctx.user, args.projectId),
});

export const generateUploadUrl = authedMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

export const registerServiceStage = authedMutation({
  args: {
    disciplineId: v.id("projectDisciplines"),
    location: v.optional(v.string()),
    description: v.string(),
    outcome: serviceStageOutcome,
    pendingNote: v.optional(v.string()),
    participantIds: v.array(v.id("users")),
    photoIds: v.array(v.id("_storage")),
  },
  returns: v.id("serviceStages"),
  handler: async (ctx, args) => await registerStage(ctx, ctx.user, args),
});

// Quem registrou apaga a própria etapa enquanto a engenharia não conferiu.
export const removeStage = authedMutation({
  args: { stageId: v.id("serviceStages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await removeOwnStage(ctx, ctx.user, args.stageId);
    return null;
  },
});

// ---------------------------------------------------------------------------
// Dashboard (engenharia)
// ---------------------------------------------------------------------------

export const listOfficeDisciplinesByProject = servicosQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(disciplineSummaryValidator),
  handler: async (ctx, args) => await listOfficeDisciplines(ctx, args.projectId),
});

// Nomes para criar uma disciplina: os mais comuns e as abas do orçamento da obra.
export const disciplineSuggestions = servicosQuery({
  args: { projectId: v.id("projects") },
  returns: v.object({ common: v.array(v.string()), budgetSheets: v.array(v.string()) }),
  handler: async (ctx, args) => await listDisciplineSuggestions(ctx, args.projectId),
});

// Histórico de etapas da obra, da mais nova para a mais antiga.
export const listOfficeStagesByProject = servicosQuery({
  args: { projectId: v.id("projects"), limit: v.optional(v.number()) },
  returns: v.array(v.object({ ...stageRowValidator.fields, createdByName: v.string() })),
  handler: async (ctx, args) =>
    await listOfficeStages(ctx, { projectId: args.projectId, limit: args.limit ?? 100 }),
});

export const createProjectDiscipline = servicosMutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    budgetSheet: v.optional(v.string()),
    fieldTeam: v.boolean(),
  },
  returns: v.id("projectDisciplines"),
  handler: async (ctx, args) => await createDiscipline(ctx, ctx.user, args),
});

export const updateProjectDiscipline = servicosMutation({
  args: {
    disciplineId: v.id("projectDisciplines"),
    name: v.optional(v.string()),
    // `null` desliga a disciplina do orçamento.
    budgetSheet: v.optional(v.union(v.string(), v.null())),
    fieldTeam: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updateDiscipline(ctx, ctx.user, args);
    return null;
  },
});

export const archiveProjectDiscipline = servicosMutation({
  args: { disciplineId: v.id("projectDisciplines") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await archiveDiscipline(ctx, ctx.user, args.disciplineId);
    return null;
  },
});

export const reviewStage = servicosMutation({
  args: { stageId: v.id("serviceStages"), reviewed: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await setStageReviewed(ctx, ctx.user, args);
    return null;
  },
});
