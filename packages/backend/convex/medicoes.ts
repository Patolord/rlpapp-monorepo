import { v } from "convex/values";
import {
  medicoesAprovarMutation,
  medicoesMutation,
  medicoesQuery,
} from "./lib/rbac";
import { medicaoBasis, medicaoStatus } from "./schema/contracts";
import { projectStatus } from "./schema/engineering";
import { logAudit } from "./lib/audit";
import {
  changeMedicaoStatus,
  createContractMedicao,
  getMedicoesOverview,
  getProjectInstallProgress,
  listMeasurableContracts,
  listProjectMedicoes,
  updateDraftMedicao,
} from "./model/contracts/medicoes";
import { notFound, ruleViolation } from "./lib/domainErrors";

const contractSummaryValidator = v.object({
  _id: v.id("contracts"),
  projectId: v.id("projects"),
  title: v.string(),
  valueCents: v.number(),
  notes: v.union(v.string(), v.null()),
  signedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  medicaoCount: v.number(),
  medidoCents: v.number(),
  aprovadoCents: v.number(),
  pagoCents: v.number(),
  saldoCents: v.number(),
});

const medicaoValidator = v.object({
  _id: v.id("medicoes"),
  projectId: v.id("projects"),
  contractId: v.id("contracts"),
  contractTitle: v.string(),
  sequence: v.number(),
  description: v.union(v.string(), v.null()),
  basis: medicaoBasis,
  percent: v.union(v.number(), v.null()),
  amountCents: v.number(),
  status: medicaoStatus,
  referenceDate: v.number(),
  approvedAt: v.union(v.number(), v.null()),
  paidAt: v.union(v.number(), v.null()),
  createdByName: v.union(v.string(), v.null()),
  createdAt: v.number(),
});

// ---------------------------------------------------------------------------
// Contratos
// ---------------------------------------------------------------------------

/**
 * Lista contratos elegíveis para medições nesta obra (venda ao cliente).
 * Criação/edição de contratos passa a ser feita em `api.contracts`.
 */
export const listContracts = medicoesQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(contractSummaryValidator),
  handler: async (ctx, args) => {
    return await listMeasurableContracts(ctx, args.projectId);
  },
});

// ---------------------------------------------------------------------------
// Medições
// ---------------------------------------------------------------------------

export const listMedicoes = medicoesQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(medicaoValidator),
  handler: async (ctx, args) => {
    return await listProjectMedicoes(ctx, args.projectId);
  },
});

/** Progresso de instalação da obra — sugestão de % para medições por progresso. */
export const getProgress = medicoesQuery({
  args: { projectId: v.id("projects") },
  returns: v.object({
    totalItems: v.number(),
    installedItems: v.number(),
    percent: v.number(),
  }),
  handler: async (ctx, args) => await getProjectInstallProgress(ctx, args.projectId),
});

export const createMedicao = medicoesMutation({
  args: {
    contractId: v.id("contracts"),
    description: v.optional(v.string()),
    basis: medicaoBasis,
    percent: v.optional(v.number()),
    amountCents: v.optional(v.number()),
    referenceDate: v.number(),
  },
  returns: v.id("medicoes"),
  handler: async (ctx, args) => {
    return await createContractMedicao(ctx, ctx.user, args);
  },
});

export const updateMedicao = medicoesMutation({
  args: {
    medicaoId: v.id("medicoes"),
    description: v.optional(v.string()),
    basis: v.optional(medicaoBasis),
    percent: v.optional(v.number()),
    amountCents: v.optional(v.number()),
    referenceDate: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updateDraftMedicao(ctx, ctx.user, args);
    return null;
  },
});

export const setMedicaoStatus = medicoesAprovarMutation({
  args: {
    medicaoId: v.id("medicoes"),
    status: medicaoStatus,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await changeMedicaoStatus(ctx, ctx.user, args);
    return null;
  },
});

export const removeMedicao = medicoesMutation({
  args: { medicaoId: v.id("medicoes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const medicao = await ctx.db.get("medicoes", args.medicaoId);
    if (!medicao) throw notFound("Medição não encontrada");
    if (medicao.status !== "rascunho") {
      throw ruleViolation("Apenas medições em rascunho podem ser excluídas");
    }

    await ctx.db.delete("medicoes", args.medicaoId);

    await logAudit(ctx, ctx.user, {
      action: "delete",
      tableName: "medicoes",
      recordId: args.medicaoId,
      details: `Medição nº ${medicao.sequence} excluída`,
    });

    return null;
  },
});

// ---------------------------------------------------------------------------
// Visão global (todas as obras)
// ---------------------------------------------------------------------------

export const getOverview = medicoesQuery({
  args: {},
  returns: v.array(
    v.object({
      projectId: v.id("projects"),
      projectName: v.string(),
      projectSlug: v.string(),
      legacyNumber: v.union(v.number(), v.null()),
      client: v.union(v.string(), v.null()),
      status: v.union(projectStatus, v.null()),
      contractCount: v.number(),
      contractTotalCents: v.number(),
      medidoCents: v.number(),
      aprovadoCents: v.number(),
      pagoCents: v.number(),
      saldoCents: v.number(),
    })
  ),
  handler: async (ctx) => {
    return await getMedicoesOverview(ctx);
  },
});
