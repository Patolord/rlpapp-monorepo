import { equipmentStatusValidator } from "./schema/engineering";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { authedQuery } from "./lib/rbac";
import { assertTechnicianProjectAccess } from "./model/engineering/projects";
import {
  getFieldProjectSummary,
  getMyFieldProject,
  listBrowsableFieldProjects,
  listBrowsableQrPage,
  listMyFieldProjects,
  listProjectQrRows,
} from "./model/engineering/fieldPortal";

export { assertTechnicianProjectAccess };

// Portal do técnico em campo: lista obras atribuídas (technicianIds) e os
// QRs/equipamentos de cada obra. Staff enxerga todas as obras.

const myProjectValidator = v.object({
  _id: v.id("projects"),
  name: v.string(),
  slug: v.union(v.string(), v.null()),
  legacyNumber: v.union(v.number(), v.null()),
  client: v.union(v.string(), v.null()),
  address: v.union(v.string(), v.null()),
  status: v.union(v.string(), v.null()),
  qrCount: v.number(),
  registeredCount: v.number(),
  // Documentos (PDF) que este usuário pode ver nesta obra.
  documentCount: v.number(),
});

export const listMyProjects = authedQuery({
  args: {},
  returns: v.array(myProjectValidator),
  handler: async (ctx) => {
    return await listMyFieldProjects(ctx, ctx.user);
  },
});

// Resumo de uma obra para o hub do técnico. Aceita slug ou id na URL.
// Retorna null quando a obra não existe; lança erro quando não há acesso.
export const getMyProject = authedQuery({
  args: { identifier: v.string() },
  returns: v.union(myProjectValidator, v.null()),
  handler: async (ctx, args) => {
    return await getMyFieldProject(ctx, ctx.user, args.identifier);
  },
});

const qrRowValidator = v.object({
  _id: v.id("qrCodes"),
  token: v.string(),
  qrStatus: v.union(v.literal("active"), v.literal("inactive")),
  equipmentId: v.union(v.id("equipment"), v.null()),
  description: v.union(v.string(), v.null()),
  status: v.union(equipmentStatusValidator, v.null()),
  ambiente: v.union(v.string(), v.null()),
  modelo: v.union(v.string(), v.null()),
  batchName: v.union(v.string(), v.null()),
});
export const listQrsByProject = authedQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(qrRowValidator),
  handler: async (ctx, args) => {
    return await listProjectQrRows(ctx, ctx.user, args.projectId);
  },
});

const browsableProjectValidator = v.object({
  _id: v.id("projects"),
  name: v.string(),
  legacyNumber: v.union(v.number(), v.null()),
  client: v.union(v.string(), v.null()),
  address: v.union(v.string(), v.null()),
  status: v.union(v.string(), v.null()),
  qrCount: v.number(),
  registeredCount: v.number(),
});

const qrBrowseFilterValidator = v.union(
  v.literal("all"),
  v.literal("registered"),
  v.literal("free")
);

// Obra aberta no app de campo. Diferente de getMyProject, nunca lança
// "acesso negado": quem não está atribuído ainda consegue abrir a obra
// (válvula de escape para um técnico deslocado de última hora), e a UI
// sinaliza isso pelo campo `assigned`. Retorna null se não existe/arquivada.
export const getFieldProject = authedQuery({
  // Slug ou id (mesma regra de getMyProject).
  args: { identifier: v.string() },
  returns: v.union(
    v.object({
      ...browsableProjectValidator.fields,
      slug: v.union(v.string(), v.null()),
      // Documentos (PDF) que este usuário pode ver (0 se não atribuído).
      documentCount: v.number(),
      assigned: v.boolean(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    return await getFieldProjectSummary(ctx, ctx.user, args.identifier);
  },
});

// Catálogo de campo: qualquer usuário autenticado pode localizar etiquetas de
// equipamento por obra, mesmo sem estar atribuído como técnico. Isso não concede
// permissões administrativas sobre a obra ou sobre os lotes.
export const listBrowsableProjects = authedQuery({
  args: {},
  returns: v.array(browsableProjectValidator),
  handler: async (ctx) => {
    return await listBrowsableFieldProjects(ctx);
  },
});

// Busca e filtro são aplicados no servidor antes da paginação; filtrar só a
// página carregada no cliente escondia etiquetas de obras grandes.
export const listBrowsableQrsByProject = authedQuery({
  args: {
    projectId: v.id("projects"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    filter: v.optional(qrBrowseFilterValidator),
  },
  returns: v.object({
    page: v.array(qrRowValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
    pageStatus: v.optional(v.union(v.string(), v.null())),
    splitCursor: v.optional(v.union(v.string(), v.null())),
  }),
  handler: async (ctx, args) => {
    return await listBrowsableQrPage(ctx, args);
  },
});
