import { applyRevision, type PageMap, type Similarity } from "../lib/align";
import { withIdentityOf } from "../lib/appLink";
import { moveItemInBudget } from "../lib/budgetOrder";
import { mergeCatalog } from "../lib/catalog";
import { syncDuctItems } from "../lib/ductItems";
import { basename, useDoc } from "../lib/session";
import {
  activeDrawing,
  type DisciplineSettings,
  type Drawing,
  emptyProject,
  newId,
  type Project,
  pruneLocations,
  type SentToApp,
} from "../lib/types";
import type { PageScale } from "../lib/units";
import { syncVrfItems } from "../lib/vrfItems";
import { syncWeightItems } from "../lib/weights";
import type { Slice } from "./shared";

const HISTORY_LIMIT = 200;

export type ProjectMeta = Partial<
  Pick<
    Project,
    | "name"
    | "unit"
    | "currency"
    | "client"
    | "site"
    | "proposalNumber"
    | "estimator"
    | "system"
    | "bdi"
    | "extrasPct"
    | "sectionsBy"
  >
>;

/** The takeoff file itself: the project model, its drawings, the undo history and dirty flag. */
export interface ProjectSlice {
  project: Project;
  filePath: string | null;
  dirty: boolean;
  past: Project[];
  future: Project[];

  resetProject(project?: Project, filePath?: string | null): void;
  /** Size the active drawing's page list to the opened document. */
  ensurePages(n: number): void;
  addDrawing(path: string | null, name: string): string;
  /** Add several plantas as one undo step; returns their ids in order. */
  addDrawings(entries: { path: string | null; name: string }[]): string[];
  updateDrawing(id: string, patch: Partial<Drawing>): void;
  /** Reorders the plantas: puts `id` right before `beforeId`, or last when it is null. */
  moveDrawing(id: string, beforeId: string | null): void;
  removeDrawing(id: string): void;
  /**
   * Point a drawing at a new revision of its PDF as one undo step: the old file joins its
   * revision history, and its markings and locations follow `pageMap` (old page → new page, null
   * drops them) and the per-old-page alignment `transforms` (see lib/align).
   */
  replaceDrawing(
    id: string,
    path: string,
    pageMap: PageMap,
    transforms: (Similarity | null)[],
    pageCount: number,
  ): void;
  setActiveDrawing(id: string | null): void;
  setFilePath(path: string | null): void;
  markSaved(): void;
  /**
   * The project's identity in the company app (its id, where its approved budget was sent). Not
   * an edit: no undo entry, and undo/redo keep it. Marks the project unsaved.
   */
  setIdentity(identity: { id?: string; sentToApp?: SentToApp }): void;

  /**
   * Apply an edit to the project as one undo step. Derived items (duct networks, VRF systems,
   * weight-priced lines) are brought up to date afterwards; returning the same object is a no-op.
   */
  commit(mutate: (p: Project) => Project): void;
  undo(): void;
  redo(): void;

  setPageScale(scale: PageScale | null, which: "current" | "all"): void;
  setProjectMeta(patch: ProjectMeta): void;
  /** BDI, extras or footer of one discipline tab; `footer: undefined` returns it to the default. */
  setDiscipline(name: string, patch: Partial<DisciplineSettings>): void;
  /** Nudge an item up (-1) or down (+1) inside its group in the budget. */
  moveItemInBudget(id: string, dir: -1 | 1): void;
}

export const createProjectSlice: Slice<ProjectSlice> = (set, get) => ({
  project: emptyProject(),
  filePath: null,
  dirty: false,
  past: [],
  future: [],

  resetProject: (project = emptyProject(), filePath = null) =>
    set({
      // an opened takeoff takes the current prices per kg on its weight-priced lines
      project: syncWeightItems(project, get().catalog.basePrices),
      filePath,
      dirty: false,
      past: [],
      future: [],
      page: 0,
      selection: [],
      zoneFilter: null,
      systemFilter: null,
      similarPreview: null,
      calibration: null,
      pendingZone: null,
      activeItemId: project.items[0]?.id ?? null,
      tool: "select",
    }),

  ensurePages: (n) => {
    const { project } = get();
    const d = activeDrawing(project);
    if (!d || d.pages.length === n) return;
    const pages = Array.from({ length: n }, (_, i) => d.pages[i] ?? { scale: null });
    set({
      project: {
        ...project,
        drawings: project.drawings.map((x) => (x.id === d.id ? { ...x, pages } : x)),
      },
    });
  },

  addDrawing: (path, name) => get().addDrawings([{ path, name }])[0],

  addDrawings: (entries) => {
    const added = entries.map(({ path, name }) => ({ id: newId(), path, name, pages: [] }));
    if (added.length === 0) return [];
    get().commit((p) => ({ ...p, drawings: [...p.drawings, ...added] }));
    return added.map((d) => d.id);
  },

  updateDrawing: (id, patch) =>
    get().commit((p) => ({
      ...p,
      drawings: p.drawings.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    })),

  moveDrawing: (id, beforeId) => {
    if (id === beforeId) return;
    get().commit((p) => {
      const moving = p.drawings.find((d) => d.id === id);
      if (!moving) return p;
      const rest = p.drawings.filter((d) => d.id !== id);
      const at = beforeId ? rest.findIndex((d) => d.id === beforeId) : -1;
      if (beforeId && at < 0) return p;
      const drawings =
        at < 0 ? [...rest, moving] : [...rest.slice(0, at), moving, ...rest.slice(at)];
      return drawings.every((d, i) => d === p.drawings[i]) ? p : { ...p, drawings };
    });
  },

  removeDrawing: (id) => {
    get().commit((p) => {
      const drawings = p.drawings.filter((d) => d.id !== id);
      return pruneLocations({
        ...p,
        drawings,
        activeDrawingId: p.activeDrawingId === id ? (drawings[0]?.id ?? null) : p.activeDrawingId,
        measurements: p.measurements.filter((m) => m.drawingId !== id),
        zones: p.zones.filter((z) => z.drawingId !== id),
      });
    });
    set({ selection: [], zoneFilter: null, page: 0 });
  },

  replaceDrawing: (id, path, pageMap, transforms, pageCount) => {
    const before = get().project;
    get().commit((p) =>
      applyRevision(p, id, {
        path,
        name: basename(path),
        pageMap,
        transforms,
        pageCount,
        now: Date.now(),
      }),
    );
    if (get().project === before || before.activeDrawingId !== id) return;
    const page = Math.min(pageMap[get().page] ?? 0, Math.max(0, pageCount - 1));
    set({ page, selection: [], similarPreview: null, calibration: null, pendingZone: null });
  },

  setActiveDrawing: (id) => {
    const { project } = get();
    if (project.activeDrawingId === id) return;
    // view state, not an edit: no undo entry
    set({
      project: { ...project, activeDrawingId: id },
      dirty: true,
      page: 0,
      selection: [],
      zoneFilter: null,
      systemFilter: null,
      similarPreview: null,
      calibration: null,
      pendingZone: null,
    });
  },

  setFilePath: (filePath) => set({ filePath }),
  markSaved: () => set({ dirty: false }),

  setIdentity: (identity) => {
    const { project } = get();
    const next = withIdentityOf(project, { ...project, ...identity } as Project);
    if (next !== project) set({ project: next, dirty: true });
  },

  commit: (mutate) => {
    const { project, past } = get();
    const mutated = mutate(project);
    if (mutated === project) return;
    // derived prices follow their sources: duct items from the runs, weight lines from R$/kg
    const next = syncWeightItems(
      syncVrfItems(
        syncDuctItems(mutated, () => mergeCatalog(get().catalog), get().catalog.gaugeWeights),
        () => get().vrfPricing(),
        () => get().catalog.vrfBrands,
      ),
      get().catalog.basePrices,
    );
    set({
      project: next,
      past: [...past.slice(-(HISTORY_LIMIT - 1)), project],
      future: [],
      dirty: true,
    });
  },

  undo: () => {
    const { past, future, project } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      project: withIdentityOf(prev, project),
      past: past.slice(0, -1),
      future: [project, ...future],
      dirty: true,
      selection: [],
    });
  },

  redo: () => {
    const { past, future, project } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      project: withIdentityOf(next, project),
      past: [...past, project],
      future: future.slice(1),
      dirty: true,
      selection: [],
    });
  },

  setPageScale: (scale, which) => {
    const { page } = get();
    const n = Math.max(useDoc.getState().numPages, page + 1);
    get().commit((p) => {
      const d = activeDrawing(p);
      if (!d) return p;
      const pages = Array.from(
        { length: Math.max(n, d.pages.length) },
        (_, i) => d.pages[i] ?? { scale: null },
      ).map((pm, i) => (which === "all" || i === page ? { ...pm, scale } : pm));
      return { ...p, drawings: p.drawings.map((x) => (x.id === d.id ? { ...x, pages } : x)) };
    });
  },

  setProjectMeta: (patch) => get().commit((p) => ({ ...p, ...patch })),

  setDiscipline: (name, patch) =>
    get().commit((p) => ({
      ...p,
      disciplines: { ...p.disciplines, [name]: { ...p.disciplines[name], ...patch } },
    })),

  moveItemInBudget: (id, dir) =>
    get().commit((p) => {
      const items = moveItemInBudget(p.items, id, dir);
      return items.some((i, k) => i !== p.items[k]) ? { ...p, items } : p;
    }),
});
