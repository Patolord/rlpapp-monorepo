import { v, type Infer } from "convex/values";
import type { Doc } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { hasPermission } from "../../lib/rbac";
import { isProjectArchived } from "../engineering/projects";
import { projectStatus } from "../../schema/engineering";

// ---------------------------------------------------------------------------
// Opções do envio (seletor de obra do desktop)
// ---------------------------------------------------------------------------

/** Obras listadas no seletor do desktop (mais que isso: digite para filtrar no app). */
export const MAX_PUBLISH_PROJECTS = 1000;

export const publishProjectOption = v.object({
  _id: v.id("projects"),
  name: v.string(),
  /** Slug da URL da obra no app (ou o id, em obras antigas sem slug). */
  slug: v.string(),
  legacyNumber: v.union(v.number(), v.null()),
  status: v.union(projectStatus, v.null()),
  archived: v.boolean(),
});

export const desktopPublishOptionsArgs = {
  /** Id do projeto no desktop, para dizer se (e onde) ele já foi enviado. */
  externalId: v.optional(v.string()),
};

export const desktopPublishOptionsResult = v.object({
  /**
   * Se o usuário pode enviar (`engenharia.write`, a mesma permissão de
   * `publishFromDesktop`). Sem ela, `projects` vem vazio e `current` null: o
   * desktop explica o motivo em vez de mostrar um erro genérico.
   */
  canPublish: v.boolean(),
  /** Obras ativas por nome (mais a obra do envio anterior, mesmo arquivada). */
  projects: v.array(publishProjectOption),
  /** O orçamento já enviado com este `externalId`, se houver. */
  current: v.union(
    v.null(),
    v.object({
      takeoffId: v.id("takeoffs"),
      projectId: v.union(v.id("projects"), v.null()),
      projectName: v.union(v.string(), v.null()),
      projectSlug: v.union(v.string(), v.null()),
      publishedAt: v.union(v.number(), v.null()),
      publishedByName: v.union(v.string(), v.null()),
    })
  ),
});

export type DesktopPublishOptions = Infer<typeof desktopPublishOptionsResult>;

export function projectOption(project: Doc<"projects">) {
  return {
    _id: project._id,
    name: project.name,
    slug: project.slug ?? project._id,
    legacyNumber: project.legacyNumber ?? null,
    status: project.status ?? null,
    archived: isProjectArchived(project),
  };
}

/**
 * O que o desktop precisa para enviar um orçamento aprovado: se o usuário
 * pode, as obras para escolher e o envio anterior do mesmo projeto.
 */
export async function desktopPublishOptions(
  ctx: QueryCtx,
  user: Doc<"users">,
  externalId: string | undefined
): Promise<DesktopPublishOptions> {
  if (!hasPermission(user, "orcamentos.write")) {
    return { canPublish: false, projects: [], current: null };
  }
  const all = await ctx.db
    .query("projects")
    .withIndex("by_name")
    .take(MAX_PUBLISH_PROJECTS);
  const projects = all.filter((p) => !isProjectArchived(p)).map(projectOption);

  const key = externalId?.trim();
  const takeoff = key
    ? await ctx.db
        .query("takeoffs")
        .withIndex("by_source_external", (q) =>
          q.eq("source", "desktop").eq("externalId", key)
        )
        .unique()
    : null;
  if (!takeoff) return { canPublish: true, projects, current: null };

  const project = takeoff.projectId
    ? await ctx.db.get("projects", takeoff.projectId)
    : null;
  if (project && !projects.some((p) => p._id === project._id)) {
    projects.push(projectOption(project));
  }
  const publisher = takeoff.publishedByUserId
    ? await ctx.db.get("users", takeoff.publishedByUserId)
    : null;
  return {
    canPublish: true,
    projects,
    current: {
      takeoffId: takeoff._id,
      projectId: project?._id ?? null,
      projectName: project?.name ?? null,
      projectSlug: project ? (project.slug ?? project._id) : null,
      publishedAt: takeoff.publishedAt ?? null,
      publishedByName: publisher?.name ?? null,
    },
  };
}
