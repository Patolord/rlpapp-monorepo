import {
  DEFAULT_DUCT_SETTINGS,
  DEFAULT_DUCT_SPEC,
  type DuctSettings,
  type DuctSpec,
  ductLabel,
  gaugeName,
} from "@rlpapp/shared/engenharia/ducts";
import { ductNetworks, newDuctNetwork } from "../lib/ductItems";
import type { Pt } from "../lib/geom";
import { type Item, newId } from "../lib/types";
import { type PendingZone, readPref, type Slice, writePref } from "./shared";

/** The duct take-off: "Rede de dutos" items and the runs drawn on them. */
export interface DuctSlice {
  /** A duct run was drawn and waits for its section in the dialog. */
  pendingDuct: PendingZone | null;
  /** Measurements whose duct spec is being edited in the dialog. */
  ductEditIds: string[] | null;
  /** Last section/finishes used, the dialog's starting point. */
  lastDuctSpec: DuctSpec;

  setPendingDuct(p: PendingZone | null): void;
  setDuctEditIds(ids: string[] | null): void;
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
  /** Change the section/finishes of duct runs. */
  updateDuctSpec(ids: string[], spec: DuctSpec, vertical?: number): void;
  setDuctSettings(settings: DuctSettings): void;
  /** Unit price of a duct material in this takeoff (bill row name). */
  setDuctPrice(name: string, price: number): void;
}

export const createDuctSlice: Slice<DuctSlice> = (set, get) => ({
  pendingDuct: null,
  ductEditIds: null,
  lastDuctSpec: readPref("lastDuctSpec", DEFAULT_DUCT_SPEC),

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

  setDuctSettings: (duct) => get().commit((p) => ({ ...p, duct })),
  setDuctPrice: (name, price) =>
    get().commit((p) => ({ ...p, ductPrices: { ...p.ductPrices, [name]: price } })),
});
