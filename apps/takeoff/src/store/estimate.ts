import { mergeCatalog } from "../lib/catalog";
import { applyEstimate, type Estimate, estimateLines } from "../lib/estimate";
import { mod } from "../lib/platform";
import { readPref, type Slice, writePref } from "./shared";

/** Takeoff by estimate: items generated from assumptions, without the drawing (lib/estimate). */
export interface EstimateSlice {
  estimateOpen: boolean;
  /** The assumptions last used, the dialog's starting point (kept per machine). */
  lastEstimate: Estimate | null;
  setEstimateOpen(open: boolean): void;
  /**
   * Add the estimate's quantities to the budget, in one undo step; remembers the assumptions.
   * Returns how many budget lines received a quantity.
   */
  addEstimate(estimate: Estimate): number;
}

export const createEstimateSlice: Slice<EstimateSlice> = (set, get) => ({
  estimateOpen: false,
  lastEstimate: readPref<Estimate | null>("lastEstimate", null),

  setEstimateOpen: (estimateOpen) => set({ estimateOpen }),

  addEstimate: (estimate) => {
    const { catalog } = get();
    writePref("lastEstimate", estimate);
    set({ lastEstimate: estimate });
    const lines = estimateLines(estimate, catalog.kits);
    if (lines.length === 0) return 0;
    const entries = mergeCatalog(catalog);
    let count = 0;
    let created = 0;
    let lastId: string | null = null;
    get().commit((p) => {
      const r = applyEstimate(p, lines, catalog, entries, estimate.system);
      count = r.results.length;
      created = r.results.filter((x) => x.created).length;
      lastId = r.results.at(-1)?.item.id ?? null;
      return r.project;
    });
    if (lastId) set({ activeItemId: lastId });
    set({
      status: `Estimativa: ${count} ${count === 1 ? "item" : "itens"} no orçamento${
        created > 0 ? ` (${created} ${created === 1 ? "novo" : "novos"})` : ""
      } · ${mod("Z")} desfaz`,
    });
    return count;
  },
});
