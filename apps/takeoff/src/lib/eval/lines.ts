/**
 * How the candidate set up its budget lines, next to what it measured: on which discipline tab
 * each quantity sits, and which lines it made off the catalog. The quantities report merges a
 * material across tabs and pairs lines by catalog material, so neither mistake shows there; both
 * were real misses of the agent's first runs (every system on one tab; "Evaporadora Daikin"
 * typed in while the catalog had the company's equivalent).
 */
import { normalizeDiscipline } from "../catalog";
import { dist } from "../geom";
import { measurementQty, pageScale, repeatOf } from "../quantities";
import { foldName } from "../text";
import type { Item, Project } from "../types";

/** Item id → common key of the two takeoffs (compare.ts `itemKeys`). */
export interface LineKeys {
  refKey: Map<string, string>;
  candKey: Map<string, string>;
  label: Map<string, Item>;
}

export interface DisciplineRow {
  item: string;
  /** Quantity per tab, in the line's unit. */
  reference: Record<string, number>;
  candidate: Record<string, number>;
}

export interface DisciplinesReport {
  /**
   * Over the lines both takeoffs have, the mean share of the quantity they share that sits on the
   * reference's tab; null when no line is in both.
   */
  right: number | null;
  /** Lines with quantity on another tab than the reference's. */
  wrong: DisciplineRow[];
  referenceTabs: string[];
  candidateTabs: string[];
}

export interface OffCatalogLine {
  item: string;
  /** The reference's catalog material marked where this line's marks are, if any. */
  equivalent: string | null;
}

export interface CatalogReport {
  /** Candidate lines not linked to a company material (derived lines aside). */
  offCatalog: OffCatalogLine[];
  /** Of those, how many sit where the reference marked a catalog material. */
  hadEquivalent: number;
}

const NO_TAB = "(sem disciplina)";
const tabOf = (p: Project, i: Item) =>
  normalizeDiscipline(i.system?.trim() || p.system.trim()) || NO_TAB;

/** Measured quantity per line key and tab. */
function byTab(p: Project, keys: Map<string, string>) {
  const items = new Map(p.items.map((i) => [i.id, i]));
  const out = new Map<string, Map<string, number>>();
  for (const m of p.measurements) {
    const item = items.get(m.itemId);
    const key = keys.get(m.itemId);
    if (!item || !key) continue;
    const q = measurementQty(m, item.kind, pageScale(p, m.drawingId, m.page));
    if (!q) continue;
    const tabs = out.get(key) ?? new Map<string, number>();
    const tab = tabOf(p, item);
    tabs.set(tab, (tabs.get(tab) ?? 0) + q * (item.factor ?? 1) * repeatOf(p, m, item.kind));
    out.set(key, tabs);
  }
  return out;
}

const sum = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);

export function compareDisciplines(ref: Project, cand: Project, keys: LineKeys): DisciplinesReport {
  const r = byTab(ref, keys.refKey);
  const c = byTab(cand, keys.candKey);
  const wrong: DisciplineRow[] = [];
  let shares = 0;
  let lines = 0;
  for (const [key, rt] of r) {
    const ct = c.get(key);
    if (!ct) continue;
    const common = Math.min(sum(rt), sum(ct));
    if (common === 0) continue;
    let same = 0;
    for (const [tab, q] of rt) same += Math.min(q, ct.get(tab) ?? 0);
    shares += same / common;
    lines++;
    if (same < common - 1e-9) {
      wrong.push({
        item: keys.label.get(key)?.name ?? key,
        reference: Object.fromEntries(rt),
        candidate: Object.fromEntries(ct),
      });
    }
  }
  const tabs = (p: Project) =>
    [...new Set(p.items.filter((i) => !i.derived).map((i) => tabOf(p, i)))].sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    );
  return {
    right: lines === 0 ? null : shares / lines,
    wrong,
    referenceTabs: tabs(ref),
    candidateTabs: tabs(cand),
  };
}

/**
 * Candidate lines off the catalog, each with the reference's catalog material whose count marks
 * its own marks land on (within `tolerance` page points): the equivalent it should have used.
 */
export function compareCatalog(
  ref: Project,
  cand: Project,
  drawings: Map<string, string>,
  tolerance: number,
): CatalogReport {
  const toRef = new Map([...drawings].map(([r, c]) => [c, r]));
  const refItems = new Map(ref.items.map((i) => [i.id, i]));
  const offCatalog: OffCatalogLine[] = [];
  for (const item of cand.items) {
    if (item.derived || item.catalogId) continue;
    const votes = new Map<string, number>();
    const marks = cand.measurements.filter((m) => m.itemId === item.id && item.kind === "count");
    for (const m of marks) {
      const drawingId = toRef.get(m.drawingId);
      const hits = ref.measurements.filter((r) => {
        const ri = refItems.get(r.itemId);
        return (
          ri?.catalogId &&
          ri.kind === "count" &&
          r.drawingId === drawingId &&
          r.page === m.page &&
          dist(r.points[0], m.points[0]) <= tolerance
        );
      });
      for (const h of hits) {
        const name = refItems.get(h.itemId)?.name ?? "";
        votes.set(name, (votes.get(name) ?? 0) + 1);
      }
    }
    const best = [...votes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    offCatalog.push({ item: item.name, equivalent: best?.[0] ?? null });
  }
  offCatalog.sort((a, b) => foldName(a.item).localeCompare(foldName(b.item)));
  return { offCatalog, hadEquivalent: offCatalog.filter((l) => l.equivalent).length };
}
