import { saveCatalogStore } from "../lib/catalog";
import type { Pt } from "../lib/geom";
import { type Item, newId } from "../lib/types";
import {
  brandOf,
  DEFAULT_VRF_SPEC,
  type VrfBrand,
  type VrfSettings,
  type VrfSpec,
  vrfTag,
} from "../lib/vrf";
import {
  newVrfSystem,
  syncVrfItems,
  type VrfPricing,
  vrfPricingOf,
  vrfSystems,
} from "../lib/vrfItems";
import { errorMessage, type PendingZone, readPref, type Slice, writePref } from "./shared";

/** The VRF take-off: "Sistema VRF" items, the refrigerant runs drawn on them, the brand rules. */
export interface VrfSlice {
  /** A VRF run was drawn and waits for its role/capacity in the dialog. */
  pendingVrf: PendingZone | null;
  /** Measurements whose VRF spec is being edited in the dialog. */
  vrfEditIds: string[] | null;
  /** Last role/capacity/curves used, the dialog's starting point. */
  lastVrfSpec: VrfSpec;
  /** "Regras das marcas" editor (VRF tube tables and Y-kits). */
  vrfBrandsEditorOpen: boolean;

  setPendingVrf(p: PendingZone | null): void;
  setVrfEditIds(ids: string[] | null): void;
  setVrfBrandsEditorOpen(open: boolean): void;
  /** Another VRF system (another item in the budget); returns its id. */
  addVrfSystem(opts?: { name?: string; system?: string; brand?: string; hp?: number }): string;
  /** Draw a run on a system (the given one, the active one, or the last; created if none). */
  addVrfRun(spec: VrfSpec, page: number, points: Pt[], vertical?: number, systemId?: string): void;
  /** Move VRF runs to another system. */
  setVrfSystem(ids: string[], systemId: string): void;
  /** Change the role/capacity/curves of VRF runs. */
  updateVrfSpec(ids: string[], spec: VrfSpec, vertical?: number): void;
  /** Brand, condenser HP or how many identical systems (quantity) of a system item. */
  updateVrfSystem(id: string, patch: { brand?: string; hp?: number; count?: number }): void;
  setVrfSettings(settings: VrfSettings): void;
  /** Unit price of a VRF material in this takeoff (bill row name). */
  setVrfPrice(name: string, price: number): void;
  /** Replace the VRF brand rules, saved with the catalog. */
  saveVrfBrands(brands: VrfBrand[]): Promise<void>;
  /** Everything that prices a VRF bill row (catalog, copper weights, R$/kg). */
  vrfPricing(): VrfPricing;
}

export const createVrfSlice: Slice<VrfSlice> = (set, get) => ({
  pendingVrf: null,
  vrfEditIds: null,
  lastVrfSpec: readPref("lastVrfSpec", DEFAULT_VRF_SPEC),
  vrfBrandsEditorOpen: false,

  setPendingVrf: (pendingVrf) => set({ pendingVrf }),
  setVrfEditIds: (vrfEditIds) => set({ vrfEditIds }),
  setVrfBrandsEditorOpen: (vrfBrandsEditorOpen) => set({ vrfBrandsEditorOpen }),
  vrfPricing: () => vrfPricingOf(get().catalog),

  addVrfSystem: (opts = {}) => {
    const { project, catalog } = get();
    const brand = brandOf(catalog.vrfBrands, opts.brand ?? vrfSystems(project).at(-1)?.vrf?.brand);
    const item = newVrfSystem(project, brand.id, opts);
    get().commit((p) => ({ ...p, items: [...p.items, item] }));
    set({ activeItemId: item.id, status: `${item.name} criado: os próximos trechos entram nele` });
    return item.id;
  },

  addVrfRun: (spec, page, points, vertical, systemId) => {
    const { project, activeItemId, catalog } = get();
    const systems = vrfSystems(project);
    let target =
      systems.find((s) => s.id === systemId) ??
      systems.find((s) => s.id === activeItemId) ??
      systems[systems.length - 1];
    const created = target ? null : newVrfSystem(project, brandOf(catalog.vrfBrands, undefined).id);
    target = target ?? (created as Item);
    const itemId = target.id;
    const drawingId = project.activeDrawingId ?? "";
    writePref("lastVrfSpec", spec);
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
          vrf: spec,
          vertical: vertical && vertical > 0 ? vertical : undefined,
        },
      ],
    }));
    set({
      lastVrfSpec: spec,
      activeItemId: itemId,
      status: `${vrfTag(spec, target.vrf?.hp ?? 0)} em ${target.name} · sistema recalculado`,
    });
  },

  setVrfSystem: (ids, systemId) => {
    const set_ = new Set(ids);
    const target = get().project.items.find((i) => i.id === systemId && i.derived === "vrf");
    if (!target) return;
    get().commit((p) => ({
      ...p,
      measurements: p.measurements.map((m) =>
        set_.has(m.id) && m.vrf ? { ...m, itemId: systemId } : m,
      ),
    }));
    set({
      status: `${ids.length} ${ids.length === 1 ? "trecho movido" : "trechos movidos"} para ${target.name}`,
    });
  },

  updateVrfSpec: (ids, spec, vertical) => {
    const set_ = new Set(ids);
    writePref("lastVrfSpec", spec);
    get().commit((p) => ({
      ...p,
      measurements: p.measurements.map((m) =>
        set_.has(m.id) && m.vrf
          ? {
              ...m,
              vrf: spec,
              vertical: vertical === undefined ? m.vertical : vertical > 0 ? vertical : undefined,
            }
          : m,
      ),
    }));
    set({
      lastVrfSpec: spec,
      status: `${ids.length} ${ids.length === 1 ? "trecho alterado" : "trechos alterados"}`,
    });
  },

  updateVrfSystem: (id, patch) =>
    get().commit((p) => ({
      ...p,
      items: p.items.map((i) => {
        if (i.id !== id || i.derived !== "vrf") return i;
        const cur = i.vrf ?? { brand: "", hp: 0 };
        return {
          ...i,
          vrf: { brand: patch.brand ?? cur.brand, hp: patch.hp ?? cur.hp },
          manualQty: patch.count !== undefined ? Math.max(1, Math.round(patch.count)) : i.manualQty,
        };
      }),
    })),

  setVrfSettings: (vrfSettings) => get().commit((p) => ({ ...p, vrfSettings })),
  setVrfPrice: (name, price) =>
    get().commit((p) => ({ ...p, vrfPrices: { ...p.vrfPrices, [name]: price } })),

  saveVrfBrands: async (vrfBrands) => {
    const catalog = { ...get().catalog, vrfBrands };
    set({ catalog, status: `${vrfBrands.length} marcas de VRF salvas` });
    // the open takeoff's systems follow the new rules at once (a setting, not an edit: no undo)
    const { project } = get();
    const synced = syncVrfItems(
      project,
      () => get().vrfPricing(),
      () => vrfBrands,
    );
    if (synced !== project) set({ project: synced, dirty: true });
    try {
      await saveCatalogStore(catalog);
    } catch (e) {
      set({ status: `Não foi possível gravar as regras de VRF: ${errorMessage(e)}` });
    }
  },
});
