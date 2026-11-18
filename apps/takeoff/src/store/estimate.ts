import { mergeCatalog } from "../lib/catalog";
import { applyEstimate, type Estimate, type EstimateLine } from "../lib/estimate";
import type { TemplateValues } from "../lib/estimateTemplates";
import { mod } from "../lib/platform";
import { readPref, type Slice, writePref } from "./shared";

/** What the estimate dialog remembers on this machine between openings. */
export interface EstimateMemory {
  /** The calculator last used: a template id, or "custom" for the free-form assumptions. */
  templateId: string;
  /** Parameters last used, per template id. */
  values: Record<string, TemplateValues>;
  /** The free-form assumptions last used. */
  custom: Estimate | null;
  /** Discipline last chosen (blank = each material's own). */
  system: string;
}

const MEMORY_KEY = "estimate";

function readMemory(): EstimateMemory {
  const saved = readPref<Partial<EstimateMemory> | null>(MEMORY_KEY, null);
  return {
    templateId: typeof saved?.templateId === "string" ? saved.templateId : "split",
    values: saved?.values && typeof saved.values === "object" ? saved.values : {},
    custom: saved?.custom ?? readPref<Estimate | null>("lastEstimate", null),
    system: typeof saved?.system === "string" ? saved.system : "",
  };
}

/** Takeoff by estimate: items generated from assumptions, without the drawing (lib/estimate). */
export interface EstimateSlice {
  estimateOpen: boolean;
  estimateMemory: EstimateMemory;
  setEstimateOpen(open: boolean): void;
  /** Remember the dialog's state (the calculator, its values, the discipline). */
  rememberEstimate(memory: EstimateMemory): void;
  /**
   * Add generated lines to the budget, in one undo step. Returns how many budget lines
   * received a quantity.
   */
  addEstimate(lines: readonly EstimateLine[], system?: string): number;
}

export const createEstimateSlice: Slice<EstimateSlice> = (set, get) => ({
  estimateOpen: false,
  estimateMemory: readMemory(),

  setEstimateOpen: (estimateOpen) => set({ estimateOpen }),

  rememberEstimate: (estimateMemory) => {
    writePref(MEMORY_KEY, estimateMemory);
    set({ estimateMemory });
  },

  addEstimate: (lines, system) => {
    if (lines.length === 0) return 0;
    const { catalog } = get();
    const entries = mergeCatalog(catalog);
    let count = 0;
    let created = 0;
    let lastId: string | null = null;
    get().commit((p) => {
      const r = applyEstimate(p, lines, catalog, entries, system);
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
