import type { MutationCtx, QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";

/** Normaliza nome de obra para slug URL-friendly (PT-BR). */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug.length > 0 ? slug : "obra";
}

type DbCtx = QueryCtx | MutationCtx;

/** Gera slug único; sufixo numérico em caso de colisão. */
export async function generateUniqueProjectSlug(
  ctx: DbCtx,
  name: string,
  excludeId?: Id<"projects">
): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;

  while (true) {
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", candidate))
      .first();

    if (!existing || (excludeId && existing._id === excludeId)) {
      return candidate;
    }

    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

/** Heurística: IDs Convex são strings alfanuméricas longas sem hífens. */
export function looksLikeConvexId(value: string): boolean {
  return /^[a-z0-9]{20,}$/i.test(value) && !value.includes("-");
}
