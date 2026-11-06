import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  obrasGestaoMutation,
  obrasMutation,
  obrasQuery,
  requirePermission,
} from "./lib/rbac";
import { projectStatus } from "./schema/engineering";
import { buildProjectHierarchy, hierarchyReturnValidator } from "./model/engineering/hierarchy";
import { generateProjectLayout } from "./model/engineering/projectLayout";
import {
  archiveProject,
  backfillProjectSlugs,
  createProject,
  createProjectWithOptionalContract,
  restoreProject,
  setProjectClientsLegacy,
  setProjectPortalUsers,
  setProjectTechnicians,
  updateProject,
} from "./model/engineering/projectMutations";
import {
  getProjectOverview,
  listAssignedTechnicians,
  listProjects,
} from "./model/engineering/projectOverview";
import { resolveProjectSlug } from "./model/engineering/projects";
import {
  assignedTechnicianValidator,
  finalTemplateValidator,
  floorsValidator,
  layoutGenerationResultValidator,
  projectListItemValidator,
  projectOverviewValidator,
  projectResolutionValidator,
  projectWithLinkedContractValidator,
} from "./model/engineering/projectValidators";

// --- Listagem de obras (com progresso por ACs) ---

export const list = obrasQuery({
  args: {
    includeArchived: v.optional(v.boolean()),
  },
  returns: v.array(projectListItemValidator),
  handler: async (ctx, args) => {
    return await listProjects(ctx, args);
  },
});

// --- Resolução de obra por slug ou ID legado ---

export const resolve = obrasQuery({
  args: { identifier: v.string() },
  returns: v.union(projectResolutionValidator, v.null()),
  handler: async (ctx, args) => {
    return await resolveProjectSlug(ctx, args.identifier);
  },
});

export const backfillSlugs = internalMutation({
  args: {},
  returns: v.object({ updated: v.number() }),
  handler: async (ctx) => {
    return await backfillProjectSlugs(ctx);
  },
});

// --- Visão completa de uma obra (árvore andares → aptos → itens) ---

export const getOverview = obrasQuery({
  args: { projectId: v.id("projects") },
  returns: v.union(projectOverviewValidator, v.null()),
  handler: async (ctx, args) => {
    return await getProjectOverview(ctx, args.projectId);
  },
});

// --- CRUD de obra ---

export const create = obrasGestaoMutation({
  args: {
    name: v.string(),
    // Andares opcionais: obras novas podem começar vazias e usar torres.
    floors: v.optional(floorsValidator),
    customerId: v.id("customers"),
    legacyNumber: v.number(),
    client: v.optional(v.string()),
    address: v.optional(v.string()),
    status: v.optional(projectStatus),
    responsibleId: v.optional(v.id("users")),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    return await createProject(ctx, ctx.user, args);
  },
});

/** Cria a obra e, se informado, vincula um contrato ainda sem obra — numa única transação. */
export const createWithOptionalContract = obrasGestaoMutation({
  args: {
    name: v.string(),
    customerId: v.id("customers"),
    legacyNumber: v.number(),
    contractId: v.optional(v.id("contracts")),
  },
  returns: projectWithLinkedContractValidator,
  handler: async (ctx, args) => {
    // Vincular um contrato existente à obra nova é edição de contrato.
    if (args.contractId) requirePermission(ctx.user, "contratos.write");
    return await createProjectWithOptionalContract(ctx, ctx.user, args);
  },
});

export const update = obrasMutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    floors: v.optional(floorsValidator),
    customerId: v.optional(v.union(v.id("customers"), v.null())),
    legacyNumber: v.optional(v.number()),
    client: v.optional(v.union(v.string(), v.null())),
    address: v.optional(v.union(v.string(), v.null())),
    status: v.optional(projectStatus),
    responsibleId: v.optional(v.union(v.id("users"), v.null())),
    startDate: v.optional(v.union(v.number(), v.null())),
    endDate: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    return await updateProject(ctx, ctx.user, args);
  },
});

// Define quais usuários do portal podem ver a obra.
export const setPortalUsers = obrasGestaoMutation({
  args: {
    projectId: v.id("projects"),
    portalUserIds: v.array(v.id("users")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await setProjectPortalUsers(ctx, ctx.user, args);
    return null;
  },
});

/** @deprecated Use setPortalUsers */
export const setClients = obrasGestaoMutation({
  args: {
    projectId: v.id("projects"),
    clientIds: v.array(v.id("users")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await setProjectClientsLegacy(ctx, ctx.user, args);
    return null;
  },
});

export const archive = obrasGestaoMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await archiveProject(ctx, ctx.user, args.projectId);
    return null;
  },
});

export const restore = obrasGestaoMutation({
  args: {
    projectId: v.id("projects"),
    status: v.optional(
      v.union(
        v.literal("planning"),
        v.literal("in_progress"),
        v.literal("completed"),
        v.literal("paused")
      )
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await restoreProject(ctx, ctx.user, args);
    return null;
  },
});

// Define quais técnicos podem listar QRs/equipamentos desta obra em campo.
export const setTechnicians = obrasGestaoMutation({
  args: {
    projectId: v.id("projects"),
    technicianIds: v.array(v.id("users")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await setProjectTechnicians(ctx, ctx.user, args);
    return null;
  },
});

// Técnicos atribuídos à obra (para UI de edição).
export const getAssignedTechnicians = obrasQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(assignedTechnicianValidator),
  handler: async (ctx, args) => {
    return await listAssignedTechnicians(ctx, args.projectId);
  },
});

/** Compatibilidade: arquiva em vez de excluir permanentemente. */
export const remove = obrasGestaoMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await archiveProject(ctx, ctx.user, args.projectId, {
      details: "Compat: remove → archive",
    });
    return null;
  },
});

// --- Gerador por padrão (estilo aba "Aptos") ---

export const generateLayout = obrasMutation({
  args: {
    projectId: v.id("projects"),
    // Andares onde aplicar o padrão (devem existir em project.floors).
    floors: v.array(v.number()),
    // Um template por "final" (posição). finals[0] = Final 1, etc.
    finals: v.array(finalTemplateValidator),
    // Se true, apaga unidades/itens existentes nos andares antes de gerar.
    replace: v.optional(v.boolean()),
  },
  returns: layoutGenerationResultValidator,
  handler: async (ctx, args) => {
    return await generateProjectLayout(ctx, args);
  },
});

export const getHierarchy = obrasQuery({
  args: { projectId: v.id("projects") },
  returns: hierarchyReturnValidator,
  handler: async (ctx, args) => {
    return await buildProjectHierarchy(ctx, args.projectId);
  },
});
