import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { locationKeyOf } from "./stages";

// O que o orçamento publicado pelo takeoff prevê para uma disciplina: cada
// linha tem a aba (disciplina) e a seção (local). O técnico vê descrição,
// quantidade e unidade; preço fica só com o escritório.

/** Teto de linhas de orçamento lidas por obra. */
const BUDGET_SCAN_LIMIT = 4000;

export type PlannedLine = {
  locationKey: string;
  location: string | null;
  description: string;
  quantity: number | null;
  unit: string | null;
};

function sameSheet(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

async function loadBudgetItems(ctx: QueryCtx, projectId: Id<"projects">) {
  const items = await ctx.db
    .query("takeoffItems")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .take(BUDGET_SCAN_LIMIT);
  return items.filter((item) => item.sheet !== undefined && item.externalRemovedAt === undefined);
}

/** Abas (disciplinas) do orçamento publicado para a obra, em ordem alfabética. */
export async function listBudgetSheets(
  ctx: QueryCtx,
  projectId: Id<"projects">
): Promise<string[]> {
  const sheets = new Map<string, string>();
  for (const item of await loadBudgetItems(ctx, projectId)) {
    const name = item.sheet!.trim();
    if (name && !sheets.has(name.toLowerCase())) sheets.set(name.toLowerCase(), name);
  }
  return [...sheets.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/**
 * Linhas previstas de uma aba, somando as repetidas (mesmo local, descrição e
 * unidade) na ordem da planilha.
 */
export async function loadPlannedLines(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  sheet: string
): Promise<PlannedLine[]> {
  const items = (await loadBudgetItems(ctx, projectId))
    .filter((item) => sameSheet(item.sheet!, sheet))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const merged = new Map<string, PlannedLine>();
  for (const item of items) {
    const location = item.section?.trim() || null;
    const locationKey = locationKeyOf(location);
    const unit = item.unit?.trim() || null;
    const key = `${locationKey}\u0000${item.rawDescription.trim().toLowerCase()}\u0000${unit ?? ""}`;
    const current = merged.get(key);
    if (current) {
      if (item.quantity !== undefined) current.quantity = (current.quantity ?? 0) + item.quantity;
      continue;
    }
    merged.set(key, {
      locationKey,
      location,
      description: item.rawDescription.trim(),
      quantity: item.quantity ?? null,
      unit,
    });
  }
  return [...merged.values()];
}
