import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { authedQuery } from "./lib/rbac";
import {
  activityItemValidator,
  listProjectFieldActivity,
  listTechnicianActivityForProject,
  listTechnicianActivityProjects,
  listTechnicianActivityUsers,
} from "./model/engineering/technicianActivity";
import { accessRoles } from "./schema/identity";

// Histórico unificado de serviços do técnico (qr_operator ou staff), agrupado
// por obra: cadastro de equipamento, registros de instalação/manutenção
// (maintenanceLogs) + ações de campo instalar/testar/finalizar
// (equipmentHistory via fieldAction).

// Usuários cujo histórico pode ser consultado no Registro de campo. Retorna
// null para quem só pode ver o próprio histórico.
export const listActivityUsers = authedQuery({
  args: {},
  returns: v.union(
    v.array(
      v.object({
        _id: v.id("users"),
        name: v.string(),
        roles: v.array(accessRoles),
        isActive: v.boolean(),
      })
    ),
    v.null()
  ),
  handler: async (ctx) => {
    return await listTechnicianActivityUsers(ctx, ctx.user);
  },
});

// Obras nas quais o usuário realizou serviços, com contagem e data da
// última atividade. projectId/projectName nulos = grupo "Sem obra".
export const listMineProjects = authedQuery({
  args: { userId: v.optional(v.id("users")) },
  returns: v.array(
    v.object({
      projectId: v.union(v.id("projects"), v.null()),
      projectName: v.union(v.string(), v.null()),
      count: v.number(),
      lastActivityAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    return await listTechnicianActivityProjects(ctx, ctx.user, args);
  },
});

// Página de serviços do usuário logado em uma obra (ou sem obra, se null).
// Paginação por offset sobre a lista mesclada (teto por fonte), compatível com
// usePaginatedQuery.
export const listMineForProject = authedQuery({
  args: {
    projectId: v.union(v.id("projects"), v.null()),
    paginationOpts: paginationOptsValidator,
    userId: v.optional(v.id("users")),
  },
  returns: v.object({
    page: v.array(activityItemValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    return await listTechnicianActivityForProject(ctx, ctx.user, args);
  },
});

// Serviços de campo de uma obra, de todos os técnicos (aba "Serviços" do
// Buscar por obra). userId opcional filtra por técnico.
export const listProjectActivity = authedQuery({
  args: {
    projectId: v.id("projects"),
    paginationOpts: paginationOptsValidator,
    userId: v.optional(v.id("users")),
  },
  returns: v.object({
    page: v.array(
      v.object({
        ...activityItemValidator.fields,
        authorName: v.union(v.string(), v.null()),
      })
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    return await listProjectFieldActivity(ctx, ctx.user, args);
  },
});
