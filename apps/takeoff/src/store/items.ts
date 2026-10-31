import { groupKey } from "../lib/budgetOrder";
import { type CatalogEntry, kindForUnit, mergeCatalog, normalizeDiscipline } from "../lib/catalog";
import {
  type Clipboard,
  type CloneTarget,
  clipboardOf,
  cloneMarkings,
  scalesDiffer,
} from "../lib/clone";
import type { Pt } from "../lib/geom";
import { kitLabelSnapshot, kitMode } from "../lib/kits";
import { priceSourceOfEntry } from "../lib/priceSource";
import { pageScale } from "../lib/quantities";
import { type Joined, reshape } from "../lib/reshape";
import { guessSymbol } from "../lib/symbols";
import { foldName } from "../lib/text";
import {
  DEFAULT_GROUP,
  ITEM_COLORS,
  type Item,
  type Location,
  locationOf,
  type Measurement,
  newId,
  pruneLocations,
  ZONE_COLORS,
  type Zone,
} from "../lib/types";
import type { Kind } from "../lib/units";
import { KIND_OF_TOOL, type Slice } from "./shared";

/** Link and dated price a line takes from the catalog entry it is created from. */
const priceSnapshot = (
  entry: CatalogEntry | undefined,
): Pick<Item, "catalogId" | "priceDate" | "priceSource" | "baseMaterial" | "kgPerUnit"> => {
  if (!entry) return {};
  // weight-priced entries: the price (and its source) is derived on commit from the R$/kg
  if (entry.baseMaterial && entry.kgPerUnit) {
    return { baseMaterial: entry.baseMaterial, kgPerUnit: entry.kgPerUnit };
  }
  const priceSource = priceSourceOfEntry(entry);
  const dated = entry.materialPrice > 0 && priceSource !== "seed";
  return {
    catalogId: entry.source === "remote" ? entry.catalogId : undefined,
    priceSource,
    priceDate: dated ? (entry.priceDate ?? Date.now()) : undefined,
  };
};

const nextName = (items: Item[], kind: Kind) => {
  const base = kind === "count" ? "Contagem" : kind === "linear" ? "Linear" : "Área";
  let n = 1;
  while (items.some((i) => i.name === `${base} ${n}`)) n++;
  return `${base} ${n}`;
};

/** Items, their measurements and the locations (regions) they are grouped by. */
export interface ItemsSlice {
  addItem(partial: Partial<Item> & { kind: Kind }): string;
  updateItem(id: string, patch: Partial<Item>): void;
  removeItem(id: string): void;
  /** The item a new measurement of this kind goes to: the active one, the newest, or a new one. */
  resolveItem(kind: Kind): string;
  /** Create items for several names at once (legend capture). */
  addItemsBulk(entries: { name: string; kind: Kind; group: string; system?: string }[]): void;
  /** Rename the active item, or create one when there is none. */
  nameActiveItem(name: string): void;
  addItemFromCatalog(entry: CatalogEntry): string;
  /** Give every item of the same discipline (or group) the same colour. */
  colorItemsBy(by: "system" | "group"): void;

  addMeasurement(itemId: string, page: number, points: Pt[]): string;
  /** Several measurements of one item in a single undo step. */
  addMeasurements(itemId: string, page: number, pointsList: Pt[][]): number;
  updateMeasurement(id: string, patch: Partial<Measurement>): void;
  moveMeasurements(ids: string[], dx: number, dy: number): void;
  /**
   * New vertices for a measurement or a zone, in one undo step. Kit members linked to the
   * measurement take the same geometry; `joined` run ends move with the dragged endpoint.
   */
  setPoints(id: string, points: Pt[], joined?: Joined | null): void;
  /** Removes measurements and zones with the given ids. */
  removeMeasurements(ids: string[]): void;
  /** Set the vertical length of linear measurements (0 clears it). */
  setVertical(ids: string[], vertical: number): void;
  /** Set how many times the measurements count (1 clears it). */
  setRepeat(ids: string[], repeat: number): void;
  /**
   * The drawing label of these markings and of every member of their link groups, in one undo
   * step; blank clears it (a kit run then shows its kit's label again).
   */
  setMarkingLabel(ids: string[], label: string): void;

  /** One drawn run: a measurement per kit component, items created from the catalog as needed. */
  addKitRun(kitId: string, page: number, points: Pt[]): number;
  /** Make linked measurements independent again. */
  unlinkMeasurements(ids: string[]): void;
  /** Add an item to a kit group with the group's geometry. */
  addToGroup(linkId: string, itemId: string): void;

  /** Copy the selected markings (measurements and regions) to the clipboard; returns how many. */
  copySelection(): number;
  /**
   * Copies of the clipboard's markings on `target`, moved by `offset` (page points), in one
   * undo step; the copies become the selection. Markings whose item was deleted since the copy
   * are skipped. Returns the new ids. `duplicate` words the status as a duplicate, not a paste.
   */
  pasteMarkings(
    clip: Clipboard,
    target: CloneTarget,
    offset: Pt,
    opts?: { duplicate?: boolean },
  ): string[];
  /**
   * Paste the clipboard on the page in view: centred on `at` (the page point under the cursor),
   * or at the same page coordinates when `at` is null. Returns how many markings were pasted.
   */
  pasteClipboard(at: Pt | null): number;
  /** Copies of the selection on the page in view, moved by `offset`; the clipboard is left alone. */
  duplicateSelection(offset: Pt): number;

  /**
   * Draws a region on the active drawing. It joins the given location, or a new one of that
   * name (the dialog resolves a typed name to an existing location before calling this).
   * Returns the region (zone) id.
   */
  addZone(target: { locationId: string } | { name: string }, page: number, points: Pt[]): string;
  /** Region fields: hidden, repeat, points. */
  updateZone(id: string, patch: Partial<Zone>): void;
  /** Location fields: name and colour, shared by every region on every drawing. */
  updateLocation(id: string, patch: Partial<Location>): void;
}

export const createItemsSlice: Slice<ItemsSlice> = (set, get) => ({
  addItem: (partial) => {
    const id = newId();
    get().commit((p) => {
      const last = p.items[p.items.length - 1];
      const name = partial.name ?? nextName(p.items, partial.kind);
      const active = p.items.find((i) => i.id === get().activeItemId);
      const item: Item = {
        // optional fields the caller knows (unit, catalog link, dated price, weight) come along
        ...partial,
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
      items: p.items.map((i) => {
        if (i.id !== id) return i;
        // a typed material price is the user's own: date it so the budget knows what it froze
        const repriced =
          patch.materialPrice !== undefined &&
          patch.materialPrice !== i.materialPrice &&
          patch.priceSource === undefined;
        const next: Item = repriced
          ? { ...i, ...patch, priceSource: "manual", priceDate: Date.now() }
          : { ...i, ...patch };
        // moved to another group: its nudged position meant nothing there, sort it by name
        if (patch.group !== undefined && groupKey(patch.group) !== groupKey(i.group)) {
          delete next.order;
        }
        return next;
      }),
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
      ...priceSnapshot(entry),
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

  setPoints: (id, points, joined) =>
    get().commit((p) => {
      const next = reshape(p, id, points, joined);
      if (next.size === 0) return p;
      return {
        ...p,
        measurements: p.measurements.map((m) => {
          const pts = next.get(m.id);
          return pts ? { ...m, points: pts } : m;
        }),
        zones: p.zones.map((z) => {
          const pts = next.get(z.id);
          return pts ? { ...z, points: pts } : z;
        }),
      };
    }),

  removeMeasurements: (ids) => {
    if (ids.length === 0) return;
    const set_ = new Set(ids);
    get().commit((p) =>
      pruneLocations({
        ...p,
        measurements: p.measurements.filter((m) => !set_.has(m.id)),
        zones: p.zones.filter((z) => !set_.has(z.id)),
      }),
    );
    // the filter follows a location; it goes when the location's last region goes
    const { zoneFilter, project } = get();
    set({
      selection: [],
      zoneFilter: zoneFilter && !locationOf(project, zoneFilter) ? null : zoneFilter,
    });
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

  setMarkingLabel: (ids, label) => {
    const text = label.trim() || undefined;
    get().commit((p) => {
      const want = new Set(ids);
      const links = new Set<string>();
      for (const m of p.measurements) if (m.linkId && want.has(m.id)) links.add(m.linkId);
      let changed = false;
      const measurements = p.measurements.map((m) => {
        if (!want.has(m.id) && !(m.linkId && links.has(m.linkId))) return m;
        if (m.label === text) return m;
        changed = true;
        const next = { ...m, label: text };
        if (text === undefined) delete next.label;
        return next;
      });
      return changed ? { ...p, measurements } : p;
    });
  },

  addKitRun: (kitId, page, points) => {
    const { project, catalog } = get();
    const kit = catalog.kits.find((k) => k.id === kitId);
    if (!kit || kit.components.length === 0 || points.length === 0) return 0;
    const drawingId = project.activeDrawingId ?? "";
    const linkId = newId();
    const entries = mergeCatalog(catalog);
    const byClick = kitMode(kit) === "count";
    // the run remembers its kit (its label follows the kit) and the label as drawn, for when
    // the catalog no longer has the kit
    const kitLabel = kitLabelSnapshot(kit);
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
            group: c.group || cat?.group || DEFAULT_GROUP,
            materialPrice: cat?.materialPrice ?? 0,
            laborPrice: cat?.laborPrice ?? 0,
            wastePct: 0,
            ...priceSnapshot(cat),
            system: normalizeDiscipline(c.system || cat?.system) ?? p.system,
            symbol: c.kind === "count" ? guessSymbol(c.name) : undefined,
            // a click kit's linear factor is the length per click, kept on the measurement
            factor: c.factor !== 1 && !(byClick && c.kind === "linear") ? c.factor : undefined,
          };
          items = [...items, item];
        }
        measurements.push({
          id: newId(),
          itemId: item.id,
          drawingId,
          page,
          points: c.kind === "count" || byClick ? [points[0]] : points,
          linkId,
          kitId: kit.id,
          ...(kitLabel !== undefined ? { kitLabel } : {}),
          vertical: byClick && c.kind === "linear" && c.factor > 0 ? c.factor : undefined,
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
          // the group's kit and label come along
          ...(sample.kitId !== undefined ? { kitId: sample.kitId } : {}),
          ...(sample.kitLabel !== undefined ? { kitLabel: sample.kitLabel } : {}),
          ...(sample.label !== undefined ? { label: sample.label } : {}),
        },
      ],
    }));
    set({ selection: [...get().selection, id], status: `${item.name} adicionado ao grupo` });
  },

  copySelection: () => {
    const clip = clipboardOf(get().project, get().selection);
    if (!clip) return 0;
    const n = clip.measurements.length + clip.zones.length;
    set({
      clipboard: clip,
      status: `${n} ${n === 1 ? "marcação copiada" : "marcações copiadas"} · Ctrl+V cola na página atual`,
    });
    return n;
  },

  pasteMarkings: (clip, target, offset, opts) => {
    const { project } = get();
    const items = new Set(project.items.map((i) => i.id));
    const locations = new Set([...project.locations, ...clip.locations].map((l) => l.id));
    const kept = [
      ...clip.measurements.filter((m) => items.has(m.itemId)),
      ...clip.zones.filter((z) => locations.has(z.locationId)),
    ];
    const skipped = clip.measurements.length + clip.zones.length - kept.length;
    if (kept.length === 0) {
      set({ status: "Nada para colar: os itens copiados foram apagados" });
      return [];
    }
    const copy = cloneMarkings(
      clip,
      kept.map((x) => x.id),
      target,
      (q) => ({ x: q.x + offset.x, y: q.y + offset.y }),
    );
    get().commit((p) => {
      // a location whose last region was deleted after the copy comes back with the paste
      const have = new Set(p.locations.map((l) => l.id));
      const needed = new Set(copy.zones.map((z) => z.locationId));
      const restored = clip.locations.filter((l) => needed.has(l.id) && !have.has(l.id));
      return {
        ...p,
        locations: restored.length > 0 ? [...p.locations, ...restored] : p.locations,
        measurements: [...p.measurements, ...copy.measurements],
        zones: [...p.zones, ...copy.zones],
      };
    });
    const ids = [...copy.measurements, ...copy.zones].map((x) => x.id);
    // geometry is in page points, so quantities follow the target page's scale: say why they move
    const toScale = pageScale(project, target.drawingId, target.page);
    const rescaled = kept.some(
      (x) =>
        project.drawings.some((d) => d.id === x.drawingId) &&
        scalesDiffer(pageScale(project, x.drawingId, x.page), toScale),
    );
    const done = opts?.duplicate
      ? ids.length === 1
        ? "marcação duplicada"
        : "marcações duplicadas"
      : ids.length === 1
        ? "marcação colada"
        : "marcações coladas";
    const parts = [`${ids.length} ${done}`];
    if (skipped > 0) parts.push(`${skipped} ignorada(s): item apagado`);
    if (rescaled) parts.push("escala diferente: as quantidades serão recalculadas");
    // select mode, so the copies can be dragged into place right away
    if (get().tool !== "select") get().setTool("select");
    set({ selection: ids, status: parts.join(" · ") });
    return ids;
  },

  pasteClipboard: (at) => {
    const { clipboard, project, page } = get();
    if (!clipboard || !project.activeDrawingId) return 0;
    const offset = at
      ? { x: at.x - clipboard.anchor.x, y: at.y - clipboard.anchor.y }
      : { x: 0, y: 0 };
    const target = { drawingId: project.activeDrawingId, page };
    return get().pasteMarkings(clipboard, target, offset).length;
  },

  duplicateSelection: (offset) => {
    const { project, selection, page } = get();
    const clip = clipboardOf(project, selection);
    if (!clip || !project.activeDrawingId) return 0;
    const target = { drawingId: project.activeDrawingId, page };
    return get().pasteMarkings(clip, target, offset, { duplicate: true }).length;
  },

  addZone: (target, page, points) => {
    const id = newId();
    const drawingId = get().project.activeDrawingId ?? "";
    get().commit((p) => {
      const existing = "locationId" in target ? locationOf(p, target.locationId) : undefined;
      const location: Location = existing ?? {
        id: newId(),
        name: "name" in target ? target.name : "Local",
        color: ZONE_COLORS[p.locations.length % ZONE_COLORS.length],
      };
      return {
        ...p,
        locations: existing ? p.locations : [...p.locations, location],
        zones: [...p.zones, { id, locationId: location.id, drawingId, page, points }],
      };
    });
    set({ pendingZone: null, selection: [id] });
    return id;
  },

  updateZone: (id, patch) =>
    get().commit((p) => ({
      ...p,
      zones: p.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)),
    })),

  updateLocation: (id, patch) =>
    get().commit((p) => ({
      ...p,
      locations: p.locations.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    })),
});
