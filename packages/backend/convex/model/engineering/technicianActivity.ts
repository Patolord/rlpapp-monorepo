import type { PaginationOptions } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { hasPermission, resolveRoles } from "../../lib/rbac";
import {
  collectMyActivity,
  collectProjectActivity,
  type ActivityItem,
} from "./technicianActivitySources";

// Histórico unificado de serviços do técnico, agrupado por obra, e serviços de
// campo de uma obra. As fontes e a normalização ficam em
// `technicianActivitySources.ts`.

const logStatusValidator = v.union(
  v.literal("installing"),
  v.literal("operational"),
  v.literal("warning"),
  v.literal("error")
);

export const activityItemValidator = v.object({
  kind: v.union(
    v.literal("maintenanceLog"),
    v.literal("fieldAction"),
    v.literal("registration")
  ),
  id: v.string(),
  createdAt: v.number(),
  // Descrição do equipamento real ou modelo/ambiente do item planejado.
  title: v.string(),
  // "Cadastro" | "Instalação" | "Manutenção" | "Instalado" | "Testado" | "Finalizado"
  label: v.string(),
  // Presente apenas em maintenanceLogs / registration.
  status: v.union(logStatusValidator, v.null()),
  qrToken: v.union(v.string(), v.null()),
  notes: v.union(v.string(), v.null()),
});

// Normaliza projectId (obras apagadas viram "Sem obra") e devolve o mapa de
// nomes das obras existentes.
async function resolveProjects(
  ctx: QueryCtx,
  items: ActivityItem[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const missing = new Set<string>();
  for (const item of items) {
    if (!item.projectId) continue;
    if (names.has(item.projectId) || missing.has(item.projectId)) continue;
    const project = await ctx.db.get("projects", item.projectId);
    if (project) {
      names.set(item.projectId, project.name);
    } else {
      missing.add(item.projectId);
    }
  }
  for (const item of items) {
    if (item.projectId && missing.has(item.projectId)) {
      item.projectId = null;
    }
  }
  return names;
}

// Sem userId, o histórico é do próprio usuário. Consultar o histórico de outro
// técnico exige campo.equipe.
function resolveTargetUserId(
  user: Doc<"users">,
  userId: Id<"users"> | undefined
): Id<"users"> {
  if (!userId || userId === user._id) return user._id;
  if (!hasPermission(user, "campo.equipe")) {
    throw new Error("Sem permissão para ver o histórico de outros usuários");
  }
  return userId;
}

// Usuários cujo histórico pode ser consultado no Registro de campo. Retorna
// null para quem só pode ver o próprio histórico.
export async function listTechnicianActivityUsers(
  ctx: QueryCtx,
  user: Doc<"users">
) {
  if (!hasPermission(user, "campo.equipe")) return null;
  const users = await ctx.db.query("users").collect();
  return users
    .map((row) => ({
      _id: row._id,
      name: row.name,
      roles: resolveRoles(row),
      isActive: row.isActive,
    }))
    .sort(
      (a, b) =>
        Number(b.isActive) - Number(a.isActive) ||
        a.name.localeCompare(b.name, "pt-BR")
    );
}

// Obras nas quais o usuário realizou serviços, com contagem e data da
// última atividade. projectId/projectName nulos = grupo "Sem obra".
export async function listTechnicianActivityProjects(
  ctx: QueryCtx,
  user: Doc<"users">,
  input: { userId?: Id<"users"> }
) {
  const items = await collectMyActivity(
    ctx,
    resolveTargetUserId(user, input.userId)
  );
  const projectNames = await resolveProjects(ctx, items);

  const groups = new Map<
    string,
    {
      projectId: Id<"projects"> | null;
      count: number;
      lastActivityAt: number;
    }
  >();
  for (const item of items) {
    const key = item.projectId ?? "none";
    const group = groups.get(key);
    if (group) {
      group.count += 1;
      if (item.createdAt > group.lastActivityAt) {
        group.lastActivityAt = item.createdAt;
      }
    } else {
      groups.set(key, {
        projectId: item.projectId,
        count: 1,
        lastActivityAt: item.createdAt,
      });
    }
  }

  const result = [...groups.values()].map((group) => ({
    projectId: group.projectId,
    projectName: group.projectId
      ? (projectNames.get(group.projectId) ?? null)
      : null,
    count: group.count,
    lastActivityAt: group.lastActivityAt,
  }));

  result.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  return result;
}

// Página de serviços do técnico em uma obra (ou sem obra, se null).
// Paginação por offset sobre a lista mesclada (teto por fonte), compatível com
// usePaginatedQuery.
export async function listTechnicianActivityForProject(
  ctx: QueryCtx,
  user: Doc<"users">,
  input: {
    projectId: Id<"projects"> | null;
    paginationOpts: PaginationOptions;
    userId?: Id<"users">;
  }
) {
  const items = await collectMyActivity(
    ctx,
    resolveTargetUserId(user, input.userId)
  );
  // Normaliza obras apagadas para "Sem obra" (mesmo critério do
  // listMineProjects).
  await resolveProjects(ctx, items);

  const filtered = items.filter(
    (item) => item.projectId === (input.projectId ?? null)
  );

  const offset = input.paginationOpts.cursor
    ? parseInt(input.paginationOpts.cursor, 10)
    : 0;
  const end = offset + input.paginationOpts.numItems;
  const page = filtered.slice(offset, end).map((item) => {
    const {
      projectId: _projectId,
      authorId: _authorId,
      authorFallback: _authorFallback,
      ...rest
    } = item;
    return rest;
  });

  return {
    page,
    isDone: end >= filtered.length,
    continueCursor: String(end),
  };
}

// Serviços de campo de uma obra, de todos os técnicos (aba "Serviços" do
// Buscar por obra). userId opcional filtra por técnico.
export async function listProjectFieldActivity(
  ctx: QueryCtx,
  user: Doc<"users">,
  input: {
    projectId: Id<"projects">;
    paginationOpts: PaginationOptions;
    userId?: Id<"users">;
  }
) {
  if (!hasPermission(user, "obras.read")) {
    throw new Error("Sem permissão para ver os serviços da obra");
  }

  const items = (await collectProjectActivity(ctx, input.projectId)).filter(
    (item) => !input.userId || item.authorId === input.userId
  );

  const offset = input.paginationOpts.cursor
    ? parseInt(input.paginationOpts.cursor, 10)
    : 0;
  const end = offset + input.paginationOpts.numItems;

  const authorNames = new Map<Id<"users">, string | null>();
  const page = [];
  for (const item of items.slice(offset, end)) {
    const {
      projectId: _projectId,
      authorId,
      authorFallback,
      ...rest
    } = item;
    let authorName = authorFallback;
    if (authorId) {
      if (!authorNames.has(authorId)) {
        const author = await ctx.db.get("users", authorId);
        authorNames.set(authorId, author?.name ?? null);
      }
      authorName = authorNames.get(authorId) ?? authorFallback;
    }
    page.push({ ...rest, authorName });
  }

  return {
    page,
    isDone: end >= items.length,
    continueCursor: String(end),
  };
}
