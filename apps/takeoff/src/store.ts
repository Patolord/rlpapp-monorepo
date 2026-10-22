import { create } from "zustand";
import type { Pt } from "./lib/geom";
import { useDoc } from "./lib/session";
import {
  DEFAULT_GROUP,
  emptyProject,
  ITEM_COLORS,
  type Item,
  type Measurement,
  newId,
  type Project,
  ZONE_COLORS,
  type Zone,
} from "./lib/types";
import type { Kind, PageScale } from "./lib/units";

export type Tool =
  | "select"
  | "pan"
  | "count"
  | "linear"
  | "area"
  | "rect"
  | "magic"
  | "calibrate"
  | "zone";

export interface PendingZone {
  page: number;
  points: Pt[];
}

export const KIND_OF_TOOL: Partial<Record<Tool, Kind>> = {
  count: "count",
  linear: "linear",
  area: "area",
  rect: "area",
  magic: "area",
};

export const TOOL_OF_KIND: Record<Kind, Tool> = { count: "count", linear: "linear", area: "area" };

export interface Calibration {
  page: number;
  a: Pt;
  b: Pt;
}

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
  >
>;

export interface State {
  project: Project;
  filePath: string | null;
  dirty: boolean;
  past: Project[];
  future: Project[];
  page: number;
  tool: Tool;
  activeItemId: string | null;
  selection: string[];
  snap: boolean;
  ortho: boolean;
  calibration: Calibration | null;
  pendingZone: PendingZone | null;
  scalePickerOpen: boolean;
  status: string | null;

  resetProject(project?: Project, filePath?: string | null): void;
  ensurePages(n: number): void;
  setFilePath(path: string | null): void;
  markSaved(): void;

  commit(mutate: (p: Project) => Project): void;
  undo(): void;
  redo(): void;

  addItem(partial: Partial<Item> & { kind: Kind }): string;
  updateItem(id: string, patch: Partial<Item>): void;
  removeItem(id: string): void;
  resolveItem(kind: Kind): string;

  addMeasurement(itemId: string, page: number, points: Pt[]): string;
  updateMeasurement(id: string, patch: Partial<Measurement>): void;
  moveMeasurements(ids: string[], dx: number, dy: number): void;
  /** Removes measurements and zones with the given ids. */
  removeMeasurements(ids: string[]): void;

  addZone(name: string, page: number, points: Pt[]): string;
  updateZone(id: string, patch: Partial<Zone>): void;
  setPendingZone(z: PendingZone | null): void;

  setPageScale(scale: PageScale | null, which: "current" | "all"): void;
  setProjectMeta(patch: ProjectMeta): void;

  setPage(page: number): void;
  setTool(tool: Tool): void;
  setActiveItem(id: string | null): void;
  setSelection(ids: string[]): void;
  toggleSnap(): void;
  toggleOrtho(): void;
  setCalibration(c: Calibration | null): void;
  setScalePickerOpen(open: boolean): void;
  setStatus(msg: string | null): void;
}

const nextName = (items: Item[], kind: Kind) => {
  const base = kind === "count" ? "Contagem" : kind === "linear" ? "Linear" : "Área";
  let n = 1;
  while (items.some((i) => i.name === `${base} ${n}`)) n++;
  return `${base} ${n}`;
};

export const useStore = create<State>((set, get) => ({
  project: emptyProject(),
  filePath: null,
  dirty: false,
  past: [],
  future: [],
  page: 0,
  tool: "select",
  activeItemId: null,
  selection: [],
  snap: true,
  ortho: false,
  calibration: null,
  pendingZone: null,
  scalePickerOpen: false,
  status: null,

  resetProject: (project = emptyProject(), filePath = null) =>
    set({
      project,
      filePath,
      dirty: false,
      past: [],
      future: [],
      page: 0,
      selection: [],
      calibration: null,
      pendingZone: null,
      activeItemId: project.items[0]?.id ?? null,
      tool: "select",
    }),

  ensurePages: (n) => {
    const { project } = get();
    if (project.pages.length === n) return;
    const pages = Array.from({ length: n }, (_, i) => project.pages[i] ?? { scale: null });
    set({ project: { ...project, pages } });
  },

  setFilePath: (filePath) => set({ filePath }),
  markSaved: () => set({ dirty: false }),

  commit: (mutate) => {
    const { project, past } = get();
    const next = mutate(project);
    if (next === project) return;
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
      project: prev,
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
      project: next,
      past: [...past, project],
      future: future.slice(1),
      dirty: true,
      selection: [],
    });
  },

  addItem: (partial) => {
    const id = newId();
    get().commit((p) => {
      const last = p.items[p.items.length - 1];
      const item: Item = {
        id,
        name: partial.name ?? nextName(p.items, partial.kind),
        kind: partial.kind,
        color: partial.color ?? ITEM_COLORS[p.items.length % ITEM_COLORS.length],
        group: partial.group ?? last?.group ?? DEFAULT_GROUP,
        materialPrice: partial.materialPrice ?? 0,
        laborPrice: partial.laborPrice ?? 0,
        wastePct: partial.wastePct ?? 0,
      };
      return { ...p, items: [...p.items, item] };
    });
    set({ activeItemId: id });
    return id;
  },

  updateItem: (id, patch) =>
    get().commit((p) => ({
      ...p,
      items: p.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    })),

  removeItem: (id) => {
    get().commit((p) => ({
      ...p,
      items: p.items.filter((i) => i.id !== id),
      measurements: p.measurements.filter((m) => m.itemId !== id),
    }));
    const { activeItemId, project } = get();
    if (activeItemId === id) set({ activeItemId: project.items[0]?.id ?? null });
  },

  resolveItem: (kind) => {
    const { project, activeItemId } = get();
    const active = project.items.find((i) => i.id === activeItemId);
    if (active && active.kind === kind) return active.id;
    const newest = [...project.items].reverse().find((i) => i.kind === kind);
    if (newest) {
      set({ activeItemId: newest.id });
      return newest.id;
    }
    return get().addItem({ kind });
  },

  addMeasurement: (itemId, page, points) => {
    const id = newId();
    get().commit((p) => ({
      ...p,
      measurements: [...p.measurements, { id, itemId, page, points }],
    }));
    return id;
  },

  updateMeasurement: (id, patch) =>
    get().commit((p) => ({
      ...p,
      measurements: p.measurements.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),

  moveMeasurements: (ids, dx, dy) => {
    if (ids.length === 0 || (dx === 0 && dy === 0)) return;
    const set_ = new Set(ids);
    get().commit((p) => ({
      ...p,
      measurements: p.measurements.map((m) =>
        set_.has(m.id) ? { ...m, points: m.points.map((q) => ({ x: q.x + dx, y: q.y + dy })) } : m,
      ),
      zones: p.zones.map((z) =>
        set_.has(z.id) ? { ...z, points: z.points.map((q) => ({ x: q.x + dx, y: q.y + dy })) } : z,
      ),
    }));
  },

  removeMeasurements: (ids) => {
    if (ids.length === 0) return;
    const set_ = new Set(ids);
    get().commit((p) => ({
      ...p,
      measurements: p.measurements.filter((m) => !set_.has(m.id)),
      zones: p.zones.filter((z) => !set_.has(z.id)),
    }));
    set({ selection: [] });
  },

  addZone: (name, page, points) => {
    const id = newId();
    get().commit((p) => ({
      ...p,
      zones: [
        ...p.zones,
        { id, name, page, points, color: ZONE_COLORS[p.zones.length % ZONE_COLORS.length] },
      ],
    }));
    set({ pendingZone: null, selection: [id] });
    return id;
  },

  updateZone: (id, patch) =>
    get().commit((p) => ({
      ...p,
      zones: p.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)),
    })),

  setPendingZone: (pendingZone) => set({ pendingZone }),

  setPageScale: (scale, which) => {
    const { page } = get();
    const n = Math.max(useDoc.getState().numPages, page + 1);
    get().commit((p) => {
      const pages = Array.from(
        { length: Math.max(n, p.pages.length) },
        (_, i) => p.pages[i] ?? { scale: null },
      );
      return {
        ...p,
        pages: pages.map((pm, i) => (which === "all" || i === page ? { ...pm, scale } : pm)),
      };
    });
  },

  setProjectMeta: (patch) => get().commit((p) => ({ ...p, ...patch })),

  setPage: (page) => set({ page, selection: [] }),

  setTool: (tool) => {
    const kind = KIND_OF_TOOL[tool];
    const { project, activeItemId } = get();
    let activeId = activeItemId;
    if (kind) {
      const active = project.items.find((i) => i.id === activeItemId);
      if (!active || active.kind !== kind) {
        activeId = [...project.items].reverse().find((i) => i.kind === kind)?.id ?? null;
      }
    }
    set({ tool, activeItemId: activeId, calibration: null, pendingZone: null });
  },

  setActiveItem: (id) => {
    const { project, tool } = get();
    const item = project.items.find((i) => i.id === id);
    if (!item) {
      set({ activeItemId: id });
      return;
    }
    const compatible = KIND_OF_TOOL[tool] === item.kind;
    set({ activeItemId: id, tool: compatible ? tool : TOOL_OF_KIND[item.kind] });
  },

  setSelection: (selection) => set({ selection }),
  toggleSnap: () => set((s) => ({ snap: !s.snap })),
  toggleOrtho: () => set((s) => ({ ortho: !s.ortho })),
  setCalibration: (calibration) => set({ calibration }),
  setScalePickerOpen: (scalePickerOpen) => set({ scalePickerOpen }),
  setStatus: (status) => set({ status }),
}));

/** Measurements on the given page. */
export const measurementsOnPage = (project: Project, page: number): Measurement[] =>
  project.measurements.filter((m) => m.page === page);
