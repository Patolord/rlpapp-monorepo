import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";

/** Lista de obras. */
export const OBRAS_LIST_PATH = "/engenharia/obras" as const;

/** Detalhe de obra (index). */
export const OBRA_DETAIL_PATH = "/engenharia/obras/$obraSlug" as const;

export type ObraSlugParams = { obraSlug: string };

export function obraDetailParams(slug: string): ObraSlugParams {
  return { obraSlug: slug };
}

export function obraSubRouteParams(
  slug: string
): ObraSlugParams & { obraSlug: string } {
  return { obraSlug: slug };
}

/** Slug para links; usa slug do backend ou _id como fallback. */
export function obraLinkSlug(project: {
  slug?: string | null;
  _id: Id<"projects"> | string;
}): string {
  return project.slug ?? String(project._id);
}
