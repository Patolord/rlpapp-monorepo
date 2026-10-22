import { create } from "zustand";
import {
  type CatalogEntry,
  type CatalogStore,
  emptyCatalogStore,
  fetchRemoteCatalog,
  foldName,
  kindForUnit,
  loadCatalogStore,
  mergeCatalog,
  normalizeDiscipline,
  saveCatalogStore,
  unitForKind,
} from "./lib/catalog";
import { ductNetworks, newDuctNetwork, syncDuctItems } from "./lib/ductItems";
import {
  DEFAULT_DUCT_SETTINGS,
  DEFAULT_DUCT_SPEC,
  type DuctSettings,
  type DuctSpec,
  ductLabel,
  gaugeName,
} from "./lib/ducts";
import type { Pt } from "./lib/geom";
import type { Kit } from "./lib/kits";
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
  | "similar"
  | "kit"
  | "duct";

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
  duct: "linear",
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
  /** Discipline the item list and the viewer show; null = all. */
  systemFilter: string | null;
  /** Item list and locations limited to the planta in view. */
  drawingOnly: boolean;
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
  /** A duct run was drawn and waits for its section in the dialog. */
  pendingDuct: PendingZone | null;
  /** Measurements whose duct spec is being edited in the dialog. */
  ductEditIds: string[] | null;
  /** Last section/finishes used, the dialog's starting point. */
  lastDuctSpec: DuctSpec;
  scalePickerOpen: boolean;
  status: string | null;
  paletteOpen: boolean;
  aboutOpen: boolean;
  newProjectOpen: boolean;
  /** Recently opened project files, newest first (per machine). */
  recentProjects: { path: string; name: string; openedAt: string }[];
  legendCandidates: string[] | null;
  /** Image-search results waiting for the user to confirm (see Viewer.runSimilar). */
  similarPreview: SimilarPreview | null;
  /** Smallest similarity score shown in the preview (0.5..0.95, remembered). */
  similarThreshold: number;
  /** Preset the Kit tool draws with. */
  activeKitId: string | null;
  kitPickerOpen: boolean;
  kitsEditorOpen: boolean;
  /** Side panel (items, locais, orçamento): shown, and its width in CSS px (remembered). */
  sidebarOpen: boolean;
  sidebarWidth: number;
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
  /** Set the vertical length of linear measurements (0 clears it). */
  setVertical(ids: string[], vertical: number): void;
  /** Set how many times the measurements count (1 clears it). */
  setRepeat(ids: string[], repeat: number): void;

  addZone(name: string, page: number, points: Pt[]): string;
  updateZone(id: string, patch: Partial<Zone>): void;
  setPendingZone(z: PendingZone | null): void;
  setPendingDuct(p: PendingZone | null): void;
  setDuctEditIds(ids: string[] | null): void;
  /** Create the duct run: one measurement on the "Duto A×B cm" item; derived items follow. */
  /** Another "Rede de dutos" item (another network in the budget); returns its id. */
  addDuctNetwork(name?: string, system?: string): string;
  /** Draw a run on a network (the given one, the active one, or the last; created if none). */
  addDuctRun(
    spec: DuctSpec,
    page: number,
    points: Pt[],
    vertical?: number,
    networkId?: string,
  ): void;
  /** Move duct runs to another network. */
  setDuctNetwork(ids: string[], networkId: string): void;
  /** Change the section/finishes of duct runs (moves them to the right "Duto A×B cm" item). */
  updateDuctSpec(ids: string[], spec: DuctSpec, vertical?: number): void;
  setDuctSettings(settings: DuctSettings): void;
  /** Unit price of a duct material in this takeoff (bill row name). */
  setDuctPrice(name: string, price: number): void;

  setPageScale(scale: PageScale | null, which: "current" | "all"): void;
  setProjectMeta(patch: ProjectMeta): void;

  setPage(page: number): void;
  setTool(tool: Tool): void;
  setActiveItem(id: string | null): void;
  /** Items as currently listed in the panel (filters applied); arrows step through these. */
  visibleItemIds: string[];
  setVisibleItemIds(ids: string[]): void;
  /** Make the previous (-1) or next (+1) listed item the active one. */
  stepActiveItem(delta: 1 | -1): void;
  setSelection(ids: string[]): void;
  setZoneFilter(zoneId: string | null): void;
  setSystemFilter(system: string | null): void;
  setDrawingOnly(on: boolean): void;
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
  setAboutOpen(open: boolean): void;
  setNewProjectOpen(open: boolean): void;
  pushRecent(path: string, name: string): void;
  setLegendCandidates(lines: string[] | null): void;
  setSimilarPreview(preview: SimilarPreview | null): void;
  setSimilarThreshold(threshold: number): void;
  /** Exclude (or re-include) one preview match by its index. */
  toggleSimilarMatch(index: number): void;
  /** Turn the visible, non-excluded preview matches into count marks. */
  acceptSimilar(): void;
  setActiveKit(id: string | null): void;
  setKitPickerOpen(open: boolean): void;
  setKitsEditorOpen(open: boolean): void;
  setSidebarOpen(open: boolean): void;
  setSidebarWidth(px: number): void;
  saveKits(kits: Kit[]): Promise<void>;
  /** One drawn run: a measurement per kit component, items created from the catalog as needed. */
  addKitRun(kitId: string, page: number, points: Pt[]): number;
  /** Make linked measurements independent again. */
  unlinkMeasurements(ids: string[]): void;
  /** Add an item to a kit group with the group's geometry. */
  addToGroup(linkId: string, itemId: string): void;
  /** Create items for several names at once (legend capture). */
  addItemsBulk(entries: { name: string; kind: Kind; group: string; system?: string }[]): void;
  /** Rename the active item, or create one when there is none. */
  nameActiveItem(name: string): void;
  addItemFromCatalog(entry: CatalogEntry): string;
  saveItemToCatalog(itemId: string): Promise<void>;
  loadCatalog(): Promise<void>;
  setCatalogUrl(url: string): void;
  /** Give every item of the same discipline (or group) the same colour. */
  colorItemsBy(by: "system" | "group"): void;
  /** Fetch the company catalog from the configured URL; returns how many entries arrived. */
  refreshCatalog(): Promise<number>;
}

const nextName = (items: Item[], kind: Kind) => {
  const base = kind === "count" ? "Contagem" : kind === "linear" ? "Linear" : "Área";
  let n = 1;
  while (items.some((i) => i.name === `${base} ${n}`)) n++;
  return `${base} ${n}`;
};

export interface SimilarMatch {
  /** Centre in page points. */
  x: number;
  y: number;
  /** 0..1 similarity to the boxed symbol. */
  score: number;
}

export interface SimilarPreview {
  drawingId: string | null;
  page: number;
  /** Count item that receives the marks. */
  itemId: string;
  matches: SimilarMatch[];
  /** Indexes into `matches` the user clicked away. */
  excluded: number[];
  /** Size of the boxed symbol in page points (drawn as a ghost frame). */
  w: number;
  h: number;
}

/** Narrowest the side panel goes (the item price row must fit on one line). */
export const SIDEBAR_MIN = 540;

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
  systemFilter: null,
  drawingOnly: false,
  zonesVisible: readPref("zonesVisible", true),
  zoneOpacity: readPref("zoneOpacity", 1),
  fillOpacity: readPref("fillOpacity", 1),
  fillsVisible: readPref("fillsVisible", true),
  snap: true,
  ortho: false,
  calibration: null,
  pendingZone: null,
  pendingDuct: null,
  ductEditIds: null,
  lastDuctSpec: readPref("lastDuctSpec", DEFAULT_DUCT_SPEC),
  scalePickerOpen: false,
  status: null,
  paletteOpen: false,
  aboutOpen: false,
  newProjectOpen: false,
  recentProjects: readPref("recentProjects", []),
  legendCandidates: null,
  similarPreview: null,
  similarThreshold: readPref("similarThreshold", 0.75),
  activeKitId: readPref("activeKitId", null),
  kitPickerOpen: false,
  kitsEditorOpen: false,
  sidebarOpen: readPref("sidebarOpen", true),
  sidebarWidth: readPref("sidebarWidth", 580),
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
      systemFilter: null,
      similarPreview: null,
      calibration: null,
      pendingZone: null,
    });
  },

  setFilePath: (filePath) => set({ filePath }),
  markSaved: () => set({ dirty: false }),

  commit: (mutate) => {
    const { project, past } = get();
    const mutated = mutate(project);
    if (mutated === project) return;
    const next = syncDuctItems(mutated, () => mergeCatalog(get().catalog));
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
      const active = p.items.find((i) => i.id === get().activeItemId);
      const item: Item = {
        id,
        name,
        symbol: partial.symbol ?? (partial.kind === "count" ? guessSymbol(name) : undefined),
        kind: partial.kind,
        color: partial.color ?? ITEM_COLORS[p.items.length % ITEM_COLORS.length],
        group: partial.group ?? last?.group ?? DEFAULT_GROUP,
        // discipline (worksheet): explicit, else the active item's, else the project default
        system: partial.system ?? active?.system ?? p.system ?? "",
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
    if (active && active.kind === kind && !active.derived) return active.id;
    const newest = [...project.items].reverse().find((i) => i.kind === kind && !i.derived);
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

  setVertical: (ids, vertical) => {
    const set_ = new Set(ids);
    const v = vertical > 0 ? vertical : undefined;
    get().commit((p) => ({
      ...p,
      measurements: p.measurements.map((m) =>
        set_.has(m.id) && (m.vertical ?? undefined) !== v ? { ...m, vertical: v } : m,
      ),
    }));
  },
  setRepeat: (ids, repeat) => {
    const set_ = new Set(ids);
    const r = repeat > 1 ? Math.round(repeat) : undefined;
    get().commit((p) => ({
      ...p,
      measurements: p.measurements.map((m) =>
        set_.has(m.id) && (m.repeat ?? undefined) !== r ? { ...m, repeat: r } : m,
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
  setPendingDuct: (pendingDuct) => set({ pendingDuct }),
  setDuctEditIds: (ductEditIds) => set({ ductEditIds }),
  addDuctNetwork: (name, system) => {
    const item = newDuctNetwork(get().project, name, system);
    get().commit((p) => ({ ...p, items: [...p.items, item] }));
    set({ activeItemId: item.id, status: `${item.name} criada: os próximos dutos entram nela` });
    return item.id;
  },
  addDuctRun: (spec, page, points, vertical, networkId) => {
    const { project, activeItemId } = get();
    const networks = ductNetworks(project);
    let target =
      networks.find((n) => n.id === networkId) ??
      networks.find((n) => n.id === activeItemId) ??
      networks[networks.length - 1];
    const created = target ? null : newDuctNetwork(project);
    target = target ?? (created as Item);
    const itemId = target.id;
    const drawingId = project.activeDrawingId ?? "";
    writePref("lastDuctSpec", spec);
    get().commit((p) => ({
      ...p,
      items: created ? [...p.items, created] : p.items,
      measurements: [
        ...p.measurements,
        {
          id: newId(),
          itemId,
          drawingId,
          page,
          points,
          duct: spec,
          vertical: vertical && vertical > 0 ? vertical : undefined,
        },
      ],
    }));
    const norma = (get().project.duct ?? DEFAULT_DUCT_SETTINGS).norma;
    set({
      lastDuctSpec: spec,
      activeItemId: itemId,
      status: `${ductLabel(spec)} em ${target.name}: chapa ${gaugeName(spec.a, norma)} · rede recalculada`,
    });
  },
  updateDuctSpec: (ids, spec, vertical) => {
    const set_ = new Set(ids);
    writePref("lastDuctSpec", spec);
    get().commit((p) => ({
      ...p,
      measurements: p.measurements.map((m) =>
        set_.has(m.id) && m.duct
          ? {
              ...m,
              duct: spec,
              vertical: vertical === undefined ? m.vertical : vertical > 0 ? vertical : undefined,
            }
          : m,
      ),
    }));
    set({
      lastDuctSpec: spec,
      status: `${ids.length} ${ids.length === 1 ? "duto alterado" : "dutos alterados"} para ${ductLabel(spec)}`,
    });
  },
  setDuctNetwork: (ids, networkId) => {
    const set_ = new Set(ids);
    const target = get().project.items.find((i) => i.id === networkId && i.derived === "duct");
    if (!target) return;
    get().commit((p) => ({
      ...p,
      measurements: p.measurements.map((m) =>
        set_.has(m.id) && m.duct ? { ...m, itemId: networkId } : m,
      ),
    }));
    set({
      status: `${ids.length} ${ids.length === 1 ? "trecho movido" : "trechos movidos"} para ${target.name}`,
    });
  },
  setDuctSettings: (duct) => get().commit((p) => ({ ...p, duct })),
  setDuctPrice: (name, price) =>
    get().commit((p) => ({ ...p, ductPrices: { ...p.ductPrices, [name]: price } })),

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
    // picking the Kit tool starts by asking which preset to draw with
    if (tool === "kit" && get().tool !== "kit") set({ kitPickerOpen: true });
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

  visibleItemIds: [],
  setVisibleItemIds: (ids) => {
    const cur = get().visibleItemIds;
    if (cur.length === ids.length && cur.every((v, i) => v === ids[i])) return;
    set({ visibleItemIds: ids });
  },
  stepActiveItem: (delta) => {
    const { visibleItemIds, project, activeItemId } = get();
    const ids = visibleItemIds.length > 0 ? visibleItemIds : project.items.map((i) => i.id);
    if (ids.length === 0) return;
    const at = activeItemId ? ids.indexOf(activeItemId) : -1;
    const next = at < 0 ? (delta > 0 ? 0 : ids.length - 1) : (at + delta + ids.length) % ids.length;
    get().setActiveItem(ids[next]);
  },
  setSelection: (selection) => {
    // a kit group is selected as a whole: its members overlap exactly on the page
    const { measurements } = get().project;
    const sel = new Set(selection);
    const links = new Set<string>();
    for (const m of measurements) if (m.linkId && sel.has(m.id)) links.add(m.linkId);
    if (links.size > 0) {
      for (const m of measurements) if (m.linkId && links.has(m.linkId)) sel.add(m.id);
    }
    set({ selection: sel.size === selection.length ? selection : [...sel] });
  },
  setZoneFilter: (zoneFilter) => set({ zoneFilter }),
  setSystemFilter: (systemFilter) => set({ systemFilter }),
  setDrawingOnly: (drawingOnly) => set({ drawingOnly }),
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
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
  setNewProjectOpen: (newProjectOpen) => set({ newProjectOpen }),
  pushRecent: (path, name) => {
    const rest = get().recentProjects.filter((r) => r.path !== path);
    const recentProjects = [{ path, name, openedAt: new Date().toISOString() }, ...rest].slice(
      0,
      8,
    );
    writePref("recentProjects", recentProjects);
    set({ recentProjects });
  },
  setLegendCandidates: (legendCandidates) => set({ legendCandidates }),
  setActiveKit: (activeKitId) => {
    writePref("activeKitId", activeKitId);
    set({ activeKitId });
  },
  setKitPickerOpen: (kitPickerOpen) => set({ kitPickerOpen }),
  setKitsEditorOpen: (kitsEditorOpen) => set({ kitsEditorOpen }),
  setSidebarOpen: (sidebarOpen) => {
    writePref("sidebarOpen", sidebarOpen);
    set({ sidebarOpen });
  },
  setSidebarWidth: (px) => {
    // wide enough for the item price row on one line, never more than 60% of the window
    const max = Math.max(SIDEBAR_MIN, Math.floor(window.innerWidth * 0.6));
    const sidebarWidth = Math.round(Math.min(max, Math.max(SIDEBAR_MIN, px)));
    writePref("sidebarWidth", sidebarWidth);
    set({ sidebarWidth });
  },
  saveKits: async (kits) => {
    const catalog = { ...get().catalog, kits };
    set({ catalog, status: `${kits.length} presets de kit salvos` });
    try {
      await saveCatalogStore(catalog);
    } catch (e) {
      set({
        status: `Não foi possível gravar os presets: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  },
  addKitRun: (kitId, page, points) => {
    const { project, catalog } = get();
    const kit = catalog.kits.find((k) => k.id === kitId);
    if (!kit || kit.components.length === 0 || points.length === 0) return 0;
    const drawingId = project.activeDrawingId ?? "";
    const linkId = newId();
    const entries = mergeCatalog(catalog);
    get().commit((p) => {
      let items = p.items;
      const measurements = [...p.measurements];
      for (const c of kit.components) {
        let item = items.find((i) => i.kind === c.kind && foldName(i.name) === foldName(c.name));
        if (!item) {
          const cat = entries.find((e) => foldName(e.name) === foldName(c.name));
          item = {
            id: newId(),
            name: c.name,
            kind: c.kind,
            color: ITEM_COLORS[items.length % ITEM_COLORS.length],
            group: c.group || cat?.group || "Geral",
            materialPrice: cat?.materialPrice ?? 0,
            laborPrice: cat?.laborPrice ?? 0,
            wastePct: 0,
            system: normalizeDiscipline(c.system || cat?.system) ?? p.system,
            symbol: c.kind === "count" ? guessSymbol(c.name) : undefined,
            factor: c.factor !== 1 ? c.factor : undefined,
          };
          items = [...items, item];
        }
        measurements.push({
          id: newId(),
          itemId: item.id,
          drawingId,
          page,
          points: c.kind === "count" ? [points[0]] : points,
          linkId,
        });
      }
      return { ...p, items, measurements };
    });
    set({ status: `Kit ${kit.name}: ${kit.components.length} itens medidos de uma vez` });
    return kit.components.length;
  },
  unlinkMeasurements: (ids) => {
    const set_ = new Set(ids);
    get().commit((p) => ({
      ...p,
      measurements: p.measurements.map((m) =>
        set_.has(m.id) && m.linkId ? { ...m, linkId: undefined } : m,
      ),
    }));
    set({ status: "Medições desagrupadas: agora são independentes" });
  },
  addToGroup: (linkId, itemId) => {
    const { project } = get();
    const sample = project.measurements.find((m) => m.linkId === linkId);
    const item = project.items.find((i) => i.id === itemId);
    if (!sample || !item) return;
    const id = newId();
    get().commit((p) => ({
      ...p,
      measurements: [
        ...p.measurements,
        {
          id,
          itemId,
          drawingId: sample.drawingId,
          page: sample.page,
          points: item.kind === "count" ? [sample.points[0]] : sample.points,
          linkId,
        },
      ],
    }));
    set({ selection: [...get().selection, id], status: `${item.name} adicionado ao grupo` });
  },
  setSimilarPreview: (similarPreview) => set({ similarPreview }),
  setSimilarThreshold: (similarThreshold) => {
    writePref("similarThreshold", similarThreshold);
    set({ similarThreshold });
  },
  toggleSimilarMatch: (index) => {
    const pv = get().similarPreview;
    if (!pv) return;
    const excluded = pv.excluded.includes(index)
      ? pv.excluded.filter((i) => i !== index)
      : [...pv.excluded, index];
    set({ similarPreview: { ...pv, excluded } });
  },
  acceptSimilar: () => {
    const { similarPreview: pv, similarThreshold, project } = get();
    if (!pv) return;
    if (pv.drawingId !== project.activeDrawingId) {
      set({ similarPreview: null, status: "A prévia era de outra planta e foi descartada" });
      return;
    }
    const chosen = pv.matches.filter(
      (m, i) => m.score >= similarThreshold && !pv.excluded.includes(i),
    );
    const near = Math.max(3, Math.min(pv.w, pv.h) / 2);
    const existing = project.measurements.filter(
      (m) => m.itemId === pv.itemId && m.drawingId === pv.drawingId && m.page === pv.page,
    );
    const fresh = chosen.filter(
      (c) => !existing.some((m) => Math.hypot(m.points[0].x - c.x, m.points[0].y - c.y) <= near),
    );
    if (fresh.length > 0) {
      get().addMeasurements(
        pv.itemId,
        pv.page,
        fresh.map((c) => [{ x: c.x, y: c.y }]),
      );
    }
    const dup = chosen.length - fresh.length;
    set({
      similarPreview: null,
      status: `${fresh.length} marcações de contagem adicionadas${dup ? ` (${dup} já existiam)` : ""}`,
    });
  },

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
          system: e.system ?? p.system ?? "",
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
      system: normalizeDiscipline(entry.system),
      materialPrice: entry.materialPrice,
      laborPrice: entry.laborPrice,
      // units the kinds cannot express (kg, gl, bd, l) stay on the item
      unit: kind === "count" && !/^(pç|pc|un|cj|vb)$/i.test(entry.unit) ? entry.unit : undefined,
    });
    get().setActiveItem(id);
    return id;
  },

  colorItemsBy: (by) => {
    get().commit((p) => {
      const colors = new Map<string, string>();
      const items = p.items.map((it) => {
        const key = (by === "system" ? it.system || p.system : it.group) ?? "";
        let color = colors.get(key);
        if (!color) {
          color = ITEM_COLORS[colors.size % ITEM_COLORS.length];
          colors.set(key, color);
        }
        return it.color === color ? it : { ...it, color };
      });
      return { ...p, items };
    });
    set({
      status: by === "system" ? "Cores aplicadas por disciplina" : "Cores aplicadas por grupo",
    });
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
      system: item.system,
      source: "saved",
    };
    const saved = [
      entry,
      ...catalog.saved.filter((e) => e.name.toLowerCase() !== item.name.toLowerCase()),
    ];
    const next = { ...catalog, saved };
    set({ catalog: next, status: `Salvo no catálogo: ${item.name}` });
    try {
      await saveCatalogStore(next);
    } catch (e) {
      set({
        status: `Não foi possível gravar o catálogo: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
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
