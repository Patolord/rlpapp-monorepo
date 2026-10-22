import { create } from "zustand";
import {
  type CatalogEntry,
  type CatalogStore,
  emptyCatalogStore,
  fetchRemoteCatalog,
  kindForUnit,
  loadCatalogStore,
  saveCatalogStore,
  unitForKind,
} from "./lib/catalog";
import type { Pt } from "./lib/geom";
import { useDoc } from "./lib/session";
import { guessSymbol } from "./lib/symbols";
import {
  activeDrawing,
  DEFAULT_GROUP,
  type Drawing,
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
  | "zone"
  | "similar";

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

/** Small view preferences kept per machine (not part of the project file). */
function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`takeoff.pref.${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(`takeoff.pref.${key}`, JSON.stringify(value));
  } catch {
    // storage unavailable: keep the in-memory value only
  }
}

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
  /** Zone id (or "" for "Sem local") the item list and viewer focus on; null = everything. */
  zoneFilter: string | null;
  /** Draw locations on the plan at all. */
  zonesVisible: boolean;
  /** 0..1 opacity of location fills and outlines. */
  zoneOpacity: number;
  /** Hatch fill of areas and locations: 0..1 multiplier, and whether it is drawn at all. */
  fillOpacity: number;
  fillsVisible: boolean;
  snap: boolean;
  ortho: boolean;
  calibration: Calibration | null;
  pendingZone: PendingZone | null;
  scalePickerOpen: boolean;
  status: string | null;
  paletteOpen: boolean;
  legendCandidates: string[] | null;
  catalog: CatalogStore;

  resetProject(project?: Project, filePath?: string | null): void;
  /** Size the active drawing's page list to the opened document. */
  ensurePages(n: number): void;
  addDrawing(path: string | null, name: string): string;
  updateDrawing(id: string, patch: Partial<Drawing>): void;
  removeDrawing(id: string): void;
  setActiveDrawing(id: string | null): void;
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
  /** Several measurements of one item in a single undo step. */
  addMeasurements(itemId: string, page: number, pointsList: Pt[][]): number;
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
  setZoneFilter(zoneId: string | null): void;
  setZonesVisible(visible: boolean): void;
  setZoneOpacity(opacity: number): void;
  setFillOpacity(opacity: number): void;
  setFillsVisible(visible: boolean): void;
  toggleSnap(): void;
  toggleOrtho(): void;
  setCalibration(c: Calibration | null): void;
  setScalePickerOpen(open: boolean): void;
  setStatus(msg: string | null): void;

  setPaletteOpen(open: boolean): void;
  setLegendCandidates(lines: string[] | null): void;
  /** Create items for several names at once (legend capture). */
  addItemsBulk(entries: { name: string; kind: Kind; group: string }[]): void;
  /** Rename the active item, or create one when there is none. */
  nameActiveItem(name: string): void;
  addItemFromCatalog(entry: CatalogEntry): string;
  saveItemToCatalog(itemId: string): Promise<void>;
  loadCatalog(): Promise<void>;
  setCatalogUrl(url: string): void;
  /** Fetch the company catalog from the configured URL; returns how many entries arrived. */
  refreshCatalog(): Promise<number>;
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
  zoneFilter: null,
  zonesVisible: readPref("zonesVisible", true),
  zoneOpacity: readPref("zoneOpacity", 1),
  fillOpacity: readPref("fillOpacity", 1),
  fillsVisible: readPref("fillsVisible", true),
  snap: true,
  ortho: false,
  calibration: null,
  pendingZone: null,
  scalePickerOpen: false,
  status: null,
  paletteOpen: false,
  legendCandidates: null,
  catalog: emptyCatalogStore(),

  resetProject: (project = emptyProject(), filePath = null) =>
    set({
      project,
      filePath,
      dirty: false,
      past: [],
      future: [],
      page: 0,
      selection: [],
      zoneFilter: null,
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

  addDrawing: (path, name) => {
    const id = newId();
    get().commit((p) => ({
      ...p,
      drawings: [...p.drawings, { id, path, name, pages: [] }],
    }));
    return id;
  },

  updateDrawing: (id, patch) =>
    get().commit((p) => ({
      ...p,
      drawings: p.drawings.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    })),

  removeDrawing: (id) => {
    get().commit((p) => {
      const drawings = p.drawings.filter((d) => d.id !== id);
      return {
        ...p,
        drawings,
        activeDrawingId: p.activeDrawingId === id ? (drawings[0]?.id ?? null) : p.activeDrawingId,
        measurements: p.measurements.filter((m) => m.drawingId !== id),
        zones: p.zones.filter((z) => z.drawingId !== id),
      };
    });
    set({ selection: [], zoneFilter: null, page: 0 });
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
      calibration: null,
      pendingZone: null,
    });
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
      const name = partial.name ?? nextName(p.items, partial.kind);
      const item: Item = {
        id,
        name,
        symbol: partial.symbol ?? (partial.kind === "count" ? guessSymbol(name) : undefined),
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
    const drawingId = get().project.activeDrawingId ?? "";
    get().commit((p) => ({
      ...p,
      measurements: [...p.measurements, { id, itemId, drawingId, page, points }],
    }));
    return id;
  },

  addMeasurements: (itemId, page, pointsList) => {
    if (pointsList.length === 0) return 0;
    const drawingId = get().project.activeDrawingId ?? "";
    get().commit((p) => ({
      ...p,
      measurements: [
        ...p.measurements,
        ...pointsList.map((points) => ({ id: newId(), itemId, drawingId, page, points })),
      ],
    }));
    return pointsList.length;
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
    const { zoneFilter } = get();
    set({ selection: [], zoneFilter: zoneFilter && set_.has(zoneFilter) ? null : zoneFilter });
  },

  addZone: (name, page, points) => {
    const id = newId();
    const drawingId = get().project.activeDrawingId ?? "";
    get().commit((p) => ({
      ...p,
      zones: [
        ...p.zones,
        {
          id,
          name,
          drawingId,
          page,
          points,
          color: ZONE_COLORS[p.zones.length % ZONE_COLORS.length],
        },
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
  setZoneFilter: (zoneFilter) => set({ zoneFilter }),
  setZonesVisible: (zonesVisible) => {
    writePref("zonesVisible", zonesVisible);
    set({ zonesVisible });
  },
  setFillOpacity: (v) => {
    const fillOpacity = Math.min(1, Math.max(0, v));
    writePref("fillOpacity", fillOpacity);
    set({ fillOpacity });
  },
  setFillsVisible: (fillsVisible) => {
    writePref("fillsVisible", fillsVisible);
    set({ fillsVisible });
  },
  setZoneOpacity: (v) => {
    const zoneOpacity = Math.min(1, Math.max(0, v));
    writePref("zoneOpacity", zoneOpacity);
    set({ zoneOpacity });
  },
  toggleSnap: () => set((s) => ({ snap: !s.snap })),
  toggleOrtho: () => set((s) => ({ ortho: !s.ortho })),
  setCalibration: (calibration) => set({ calibration }),
  setScalePickerOpen: (scalePickerOpen) => set({ scalePickerOpen }),
  setStatus: (status) => set({ status }),

  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setLegendCandidates: (legendCandidates) => set({ legendCandidates }),

  addItemsBulk: (entries) => {
    if (entries.length === 0) return;
    let lastId: string | null = null;
    get().commit((p) => {
      const items = [...p.items];
      for (const e of entries) {
        if (items.some((i) => i.name.toLowerCase() === e.name.toLowerCase())) continue;
        lastId = newId();
        items.push({
          id: lastId,
          name: e.name,
          symbol: e.kind === "count" ? guessSymbol(e.name) : undefined,
          kind: e.kind,
          color: ITEM_COLORS[items.length % ITEM_COLORS.length],
          group: e.group || DEFAULT_GROUP,
          materialPrice: 0,
          laborPrice: 0,
          wastePct: 0,
        });
      }
      return { ...p, items };
    });
    if (lastId) get().setActiveItem(lastId);
  },

  nameActiveItem: (name) => {
    const { activeItemId, project, tool } = get();
    const active = project.items.find((i) => i.id === activeItemId);
    if (active) {
      const symbol =
        active.kind === "count" && (!active.symbol || active.symbol === "dot")
          ? guessSymbol(name)
          : active.symbol;
      get().updateItem(active.id, { name, symbol });
      set({ status: `Item renomeado: ${name}` });
    } else {
      const kind = KIND_OF_TOOL[tool] ?? "count";
      get().addItem({ kind, name });
      set({ status: `Item criado: ${name}` });
    }
  },

  addItemFromCatalog: (entry) => {
    const kind = kindForUnit(entry.unit);
    const id = get().addItem({
      kind,
      name: entry.name,
      group: entry.group,
      materialPrice: entry.materialPrice,
      laborPrice: entry.laborPrice,
    });
    get().setActiveItem(id);
    return id;
  },

  saveItemToCatalog: async (itemId) => {
    const { project, catalog } = get();
    const item = project.items.find((i) => i.id === itemId);
    if (!item) return;
    const entry: CatalogEntry = {
      name: item.name,
      group: item.group,
      unit: unitForKind(item.kind),
      materialPrice: item.materialPrice,
      laborPrice: item.laborPrice,
      source: "saved",
    };
    const saved = [
      entry,
      ...catalog.saved.filter((e) => e.name.toLowerCase() !== item.name.toLowerCase()),
    ];
    const next = { ...catalog, saved };
    set({ catalog: next, status: `Salvo no catálogo: ${item.name}` });
    await saveCatalogStore(next);
  },

  loadCatalog: async () => {
    set({ catalog: await loadCatalogStore() });
  },

  setCatalogUrl: (remoteUrl) => {
    const next = { ...get().catalog, remoteUrl };
    set({ catalog: next });
    void saveCatalogStore(next);
  },

  refreshCatalog: async () => {
    const { catalog } = get();
    if (!catalog.remoteUrl) return 0;
    const remote = await fetchRemoteCatalog(catalog.remoteUrl);
    const next = { ...catalog, remote, fetchedAt: new Date().toISOString() };
    set({ catalog: next });
    await saveCatalogStore(next);
    return remote.length;
  },
}));

/** Measurements on the given page of the active drawing. */
export const measurementsOnPage = (project: Project, page: number): Measurement[] =>
  project.measurements.filter((m) => m.drawingId === project.activeDrawingId && m.page === page);
