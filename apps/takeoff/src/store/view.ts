import type { Clipboard } from "../lib/clone";
import {
  type Calibration,
  KIND_OF_TOOL,
  type PendingZone,
  readPref,
  type Slice,
  TOOL_OF_KIND,
  type Tool,
  writePref,
} from "./shared";

/** Narrowest the side panel goes (the item price row must fit on one line). */
export const SIDEBAR_MIN = 540;

/** The take-off views of the side panel: what was measured, where, and what it costs. */
export type PanelTab = "items" | "zones" | "quote";
/** The specialty calculators (duct networks, VRF systems), shown in a drawer under the drawing. */
export type SystemPanel = "duct" | "vrf";
/** Shortest the specialty drawer goes (header plus a few rows). */
export const DRAWER_MIN = 160;

const DRAWER_OF_TOOL: Partial<Record<Tool, SystemPanel>> = { duct: "duct", vrf: "vrf" };

/** Everything about the session's view: page, tool, selection, filters, dialogs, preferences. */
export interface ViewSlice {
  page: number;
  tool: Tool;
  activeItemId: string | null;
  selection: string[];
  /** Items as currently listed in the panel (filters applied); arrows step through these. */
  visibleItemIds: string[];
  /** Location id (or "" for "Sem local") the item list and viewer focus on; null = everything. */
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
  /** A location outline was drawn and waits for its name in the dialog. */
  pendingZone: PendingZone | null;
  /** Text lines captured from a legend box, waiting to become items. */
  legendCandidates: string[] | null;
  /** Preset the Kit tool draws with. */
  activeKitId: string | null;
  /** Markings copied with Ctrl+C, for Ctrl+V on any page or drawing; in memory, never saved. */
  clipboard: Clipboard | null;
  /** Transient message in the status bar (cleared by App after a few seconds). */
  status: string | null;
  /** Recently opened project files, newest first (per machine). */
  recentProjects: { path: string; name: string; openedAt: string }[];

  scalePickerOpen: boolean;
  paletteOpen: boolean;
  aboutOpen: boolean;
  newProjectOpen: boolean;
  kitPickerOpen: boolean;
  kitsEditorOpen: boolean;
  weightsEditorOpen: boolean;
  /** "Catálogo e preços" dialog (catalog source, token, R$/kg of base materials). */
  catalogSettingsOpen: boolean;
  /** Side panel (items, locais, orçamento): shown, and its width in CSS px (remembered). */
  sidebarOpen: boolean;
  sidebarWidth: number;
  /** Take-off view shown in the side panel. */
  panelTab: PanelTab;
  /** Specialty calculator open in the drawer under the drawing, if any; its height in CSS px. */
  systemPanel: SystemPanel | null;
  drawerHeight: number;

  setPage(page: number): void;
  setTool(tool: Tool): void;
  setActiveItem(id: string | null): void;
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
  setPendingZone(z: PendingZone | null): void;
  setLegendCandidates(lines: string[] | null): void;
  setActiveKit(id: string | null): void;
  setClipboard(clip: Clipboard | null): void;
  setStatus(msg: string | null): void;
  pushRecent(path: string, name: string): void;

  setScalePickerOpen(open: boolean): void;
  setPaletteOpen(open: boolean): void;
  setAboutOpen(open: boolean): void;
  setNewProjectOpen(open: boolean): void;
  setKitPickerOpen(open: boolean): void;
  setKitsEditorOpen(open: boolean): void;
  setWeightsEditorOpen(open: boolean): void;
  setCatalogSettingsOpen(open: boolean): void;
  setSidebarOpen(open: boolean): void;
  setSidebarWidth(px: number): void;
  /** Show a take-off view in the side panel. */
  setPanelTab(tab: PanelTab): void;
  /** Open the drawer on a specialty; with an item id, that network/system is the one worked on. */
  openSystemPanel(system: SystemPanel, itemId?: string): void;
  /** Collapse the drawer. */
  closeSystemPanel(): void;
  setDrawerHeight(px: number): void;
}

export const createViewSlice: Slice<ViewSlice> = (set, get) => ({
  page: 0,
  tool: "select",
  activeItemId: null,
  selection: [],
  visibleItemIds: [],
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
  legendCandidates: null,
  activeKitId: readPref("activeKitId", null),
  clipboard: null,
  status: null,
  recentProjects: readPref("recentProjects", []),

  scalePickerOpen: false,
  paletteOpen: false,
  aboutOpen: false,
  newProjectOpen: false,
  kitPickerOpen: false,
  kitsEditorOpen: false,
  weightsEditorOpen: false,
  catalogSettingsOpen: false,
  sidebarOpen: readPref("sidebarOpen", true),
  sidebarWidth: readPref("sidebarWidth", 580),
  panelTab: "items",
  systemPanel: null,
  drawerHeight: readPref("drawerHeight", 320),

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
    // a specialty tool brings up its calculator: the runs land there as they are measured
    const drawer = DRAWER_OF_TOOL[tool];
    set({
      tool,
      activeItemId: activeId,
      calibration: null,
      pendingZone: null,
      ...(drawer ? { systemPanel: drawer } : {}),
    });
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
  setZoneOpacity: (v) => {
    const zoneOpacity = Math.min(1, Math.max(0, v));
    writePref("zoneOpacity", zoneOpacity);
    set({ zoneOpacity });
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
  toggleSnap: () => set((s) => ({ snap: !s.snap })),
  toggleOrtho: () => set((s) => ({ ortho: !s.ortho })),
  setCalibration: (calibration) => set({ calibration }),
  setPendingZone: (pendingZone) => set({ pendingZone }),
  setLegendCandidates: (legendCandidates) => set({ legendCandidates }),
  setActiveKit: (activeKitId) => {
    writePref("activeKitId", activeKitId);
    set({ activeKitId });
  },
  setClipboard: (clipboard) => set({ clipboard }),
  setStatus: (status) => set({ status }),
  pushRecent: (path, name) => {
    const rest = get().recentProjects.filter((r) => r.path !== path);
    const recentProjects = [{ path, name, openedAt: new Date().toISOString() }, ...rest].slice(
      0,
      8,
    );
    writePref("recentProjects", recentProjects);
    set({ recentProjects });
  },

  setScalePickerOpen: (scalePickerOpen) => set({ scalePickerOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
  setNewProjectOpen: (newProjectOpen) => set({ newProjectOpen }),
  setKitPickerOpen: (kitPickerOpen) => set({ kitPickerOpen }),
  setKitsEditorOpen: (kitsEditorOpen) => set({ kitsEditorOpen }),
  setWeightsEditorOpen: (weightsEditorOpen) => set({ weightsEditorOpen }),
  setCatalogSettingsOpen: (catalogSettingsOpen) => set({ catalogSettingsOpen }),
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

  setPanelTab: (panelTab) => set({ panelTab, sidebarOpen: true }),

  openSystemPanel: (system, itemId) => {
    if (itemId) get().setActiveItem(itemId);
    set({ systemPanel: system });
  },

  closeSystemPanel: () => set({ systemPanel: null }),

  setDrawerHeight: (px) => {
    // never more than 70% of the window: the drawing stays usable above it
    const max = Math.max(DRAWER_MIN, Math.floor(window.innerHeight * 0.7));
    const drawerHeight = Math.round(Math.min(max, Math.max(DRAWER_MIN, px)));
    writePref("drawerHeight", drawerHeight);
    set({ drawerHeight });
  },
});
