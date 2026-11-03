import type { GaugeWeights } from "@rlpapp/shared/engenharia/ducts";
import { fetchCatalogAsUser, sendProposalAsUser } from "../lib/account/convex";
import { isSignedIn } from "../lib/account/session";
import {
  type CatalogEntry,
  type CatalogStore,
  diffGaugeWeights,
  diffWeights,
  emptyCatalogStore,
  fetchRemoteCatalog,
  loadCatalogStore,
  mergeCatalog,
  saveCatalogStore,
  unitForKind,
  withCompanyDefaults,
} from "../lib/catalog";
import {
  applyRedirects,
  buildProposal,
  newClientId,
  type QueuedProposal,
  sendProposal,
} from "../lib/catalogRemote";
import { syncDuctItems } from "../lib/ductItems";
import { diffKits, type Kit, kitDefaults, refreshKitLabels } from "../lib/kits";
import type { Project } from "../lib/types";
import { syncWeightItems, type WeightRow } from "../lib/weights";
import { errorMessage, type Slice } from "./shared";

/** Derived prices that follow the catalog settings: duct networks (kg/m², R$/kg), weight lines. */
const syncDerived = (project: Project, catalog: CatalogStore): Project =>
  syncWeightItems(
    syncDuctItems(project, () => mergeCatalog(catalog), catalog.gaugeWeights),
    catalog.basePrices,
  );

/**
 * The material catalog kept per machine: the user's saved entries, the company catalog and the
 * settings that travel with it (kit presets, weight table, prices per kg, VRF brand rules).
 */
export interface CatalogSlice {
  catalog: CatalogStore;

  loadCatalog(): Promise<void>;
  setCatalogToken(token: string): void;
  /**
   * Fetch the company catalog, as the signed-in user when there is one (else with the shared
   * token); returns how many entries arrived.
   */
  refreshCatalog(): Promise<number>;
  saveItemToCatalog(itemId: string): Promise<void>;
  /**
   * Send an item to the company catalog as a proposal: purchasing gets a draft material (or a
   * price estimate when the line is already linked). Queued locally and retried if offline.
   */
  proposeItemToCompany(itemId: string): Promise<void>;
  /** Try to deliver every queued proposal; returns how many were accepted. */
  flushProposals(): Promise<number>;

  /**
   * Price per kg of a base material on this machine (undefined = back to the company's price,
   * else the bundled default). What the user sets here outlives every catalog refresh.
   */
  setBasePrice(key: string, price: number | undefined): void;
  /**
   * Replace the weight table (materials priced by weight) and the sheet weight of each duct
   * gauge. What differs from the company defaults is kept as a local override (an edited row,
   * a removed row, a row of this machine, a gauge set here); the rest follows the defaults on
   * every catalog refresh. The duct networks of the open takeoff follow.
   */
  saveWeights(rows: WeightRow[], gaugeWeights: GaugeWeights): Promise<void>;
  /**
   * Replace the kit list the user works with. What differs from the company defaults is kept as
   * a local override (an edited default, a default removed, a kit of this machine); the rest
   * follows the defaults on every catalog refresh.
   */
  saveKits(kits: Kit[]): Promise<void>;
}

export const createCatalogSlice: Slice<CatalogSlice> = (set, get) => {
  /** Keep a changed catalog in memory and on disk; a failed write only reports. */
  const persist = async (catalog: CatalogStore, failure: string) => {
    try {
      await saveCatalogStore(catalog);
    } catch (e) {
      set({ status: `${failure}: ${errorMessage(e)}` });
    }
  };

  /**
   * Runs of a relabelled kit already show the new label (it is read from the catalog); their
   * saved copy follows, so the project shows it on a machine without the kit too. Outside undo,
   * like the other catalog settings, and in the undo history as well, so stepping back and forth
   * never brings an old label back into the file.
   */
  const relabelRuns = (before: readonly Kit[], after: readonly Kit[]) => {
    const { project, past, future } = get();
    const relabel = (p: Project): Project => {
      const measurements = refreshKitLabels(p.measurements, before, after);
      return measurements === p.measurements ? p : { ...p, measurements };
    };
    const next = relabel(project);
    set({
      past: past.map(relabel),
      future: future.map(relabel),
      ...(next !== project ? { project: next, dirty: true } : {}),
    });
  };

  return {
    catalog: emptyCatalogStore(),

    loadCatalog: async () => {
      const catalog = await loadCatalogStore();
      const { project } = get();
      const synced = syncDerived(project, catalog);
      set({ catalog, ...(synced !== project ? { project: synced, dirty: true } : {}) });
    },

    setCatalogToken: (remoteToken) => {
      const next = { ...get().catalog, remoteToken: remoteToken.trim() };
      set({ catalog: next });
      void saveCatalogStore(next);
    },

    refreshCatalog: async () => {
      const { catalog } = get();
      let remote: Awaited<ReturnType<typeof fetchRemoteCatalog>>;
      if (isSignedIn()) {
        try {
          remote = await fetchCatalogAsUser();
        } catch (e) {
          // revoked in the dashboard: signed out now, the shared token (if any) takes over
          if (!(await get().handleSignedOut(e)) || !catalog.remoteToken) throw e;
          remote = await fetchRemoteCatalog(catalog.remoteToken);
        }
      } else {
        remote = await fetchRemoteCatalog(catalog.remoteToken);
      }
      // the company's defaults (kits, weight table, gauges, prices per kg, VRF brands) come
      // with the catalog; what a server from before them leaves out stays as it is
      const next = withCompanyDefaults(
        {
          ...catalog,
          remote: remote.entries,
          redirects: remote.redirects,
          remoteGeneratedAt: remote.generatedAt,
          fetchedAt: new Date().toISOString(),
        },
        {
          ...(remote.kits !== null ? { remoteKits: remote.kits } : {}),
          ...(remote.weights !== null
            ? {
                remoteWeights: remote.weights.rows,
                remoteGaugeWeights: remote.weights.gaugeWeights,
              }
            : {}),
          ...(remote.basePrices !== null ? { remoteBasePrices: remote.basePrices } : {}),
          ...(remote.vrfBrands !== null ? { remoteVrfBrands: remote.vrfBrands } : {}),
        },
      );
      const { project } = get();
      // derived prices (weight lines, duct networks, VRF systems) follow the new defaults
      const synced = syncDerived(project, next);
      set({ catalog: next, ...(synced !== project ? { project: synced, dirty: true } : {}) });
      if (next.vrfBrands !== catalog.vrfBrands) get().resyncVrf();
      relabelRuns(catalog.kits, next.kits);
      await saveCatalogStore(next);
      // lines linked to a material purchasing merged into another follow it, prices untouched
      get().commit((p) => {
        const items = applyRedirects(p.items, remote.redirects);
        return items === p.items ? p : { ...p, items };
      });
      await get().flushProposals();
      return remote.entries.length;
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
        priceDate: item.priceDate ?? Date.now(),
      };
      const saved = [
        entry,
        ...catalog.saved.filter((e) => e.name.toLowerCase() !== item.name.toLowerCase()),
      ];
      const next = { ...catalog, saved };
      set({ catalog: next, status: `Salvo no catálogo: ${item.name}` });
      await persist(next, "Não foi possível gravar o catálogo");
    },

    proposeItemToCompany: async (itemId) => {
      const { project, catalog } = get();
      const item = project.items.find((i) => i.id === itemId);
      if (!item) return;
      if (catalog.outbox.some((q) => q.itemId === itemId)) {
        set({ status: `${item.name}: envio já pendente, tentando de novo…` });
        await get().flushProposals();
        return;
      }
      const clientId = newClientId();
      const queued: QueuedProposal = {
        clientId,
        itemId,
        itemName: item.name,
        body: buildProposal(item, project, clientId),
        createdAt: Date.now(),
      };
      const next = { ...catalog, outbox: [...catalog.outbox, queued] };
      set({ catalog: next, status: `Enviando ${item.name} para compras…` });
      await saveCatalogStore(next).catch(() => undefined);
      await get().flushProposals();
    },

    flushProposals: async () => {
      const { catalog } = get();
      if (catalog.outbox.length === 0) return 0;
      if (!isSignedIn() && !catalog.remoteToken) {
        set({
          status:
            "Proposta guardada: entre com a conta da empresa (Entrar, no topo) para enviar a compras",
        });
        return 0;
      }
      let accepted = 0;
      const remaining: QueuedProposal[] = [];
      let lastStatus: string | null = null;
      // signed in, proposals go out as the user; otherwise with the shared token
      const send = async (q: QueuedProposal) => {
        if (isSignedIn()) {
          try {
            return await sendProposalAsUser(q.body);
          } catch (e) {
            if (!(await get().handleSignedOut(e))) throw e;
          }
        }
        const token = get().catalog.remoteToken;
        return token
          ? await sendProposal(token, q.body)
          : { kind: "retry" as const, message: "sem conta conectada" };
      };
      for (const q of catalog.outbox) {
        const outcome = await send(q).catch((e: unknown) => ({
          kind: "retry" as const,
          message: errorMessage(e),
        }));
        if (outcome.kind === "sent") {
          accepted++;
          const { result } = outcome;
          const stillThere = get().project.items.some((i) => i.id === q.itemId);
          if (stillThere) {
            get().updateItem(q.itemId, { catalogId: result.mergedInto ?? result.materialId });
          }
          lastStatus =
            result.outcome === "matched"
              ? `${q.itemName}: já existia no catálogo da empresa (${result.sku ?? "sem SKU"}), linha vinculada`
              : result.outcome === "created"
                ? `${q.itemName}: rascunho ${result.sku ?? ""} criado para compras avaliar`
                : `${q.itemName}: proposta já havia sido recebida`;
        } else if (outcome.kind === "rejected") {
          lastStatus = `${q.itemName}: recusado pelo servidor (${outcome.message})`;
        } else {
          remaining.push({ ...q, lastError: outcome.message });
          lastStatus = `${q.itemName}: não enviado (${outcome.message}); tentaremos de novo`;
        }
      }
      const next = { ...get().catalog, outbox: remaining };
      set({ catalog: next, ...(lastStatus ? { status: lastStatus } : {}) });
      await saveCatalogStore(next).catch(() => undefined);
      return accepted;
    },

    setBasePrice: (key, price) => {
      const { catalog, project } = get();
      const basePriceOverrides = { ...catalog.basePriceOverrides };
      if (price === undefined || Number.isNaN(price)) delete basePriceOverrides[key];
      else basePriceOverrides[key] = price;
      const next = withCompanyDefaults(catalog, { basePriceOverrides });
      // every weight-priced line and duct network of the open takeoff follows the new price per kg
      // (no undo step: the setting itself is not part of the project)
      const synced = syncDerived(project, next);
      set({ catalog: next, ...(synced !== project ? { project: synced, dirty: true } : {}) });
      void saveCatalogStore(next);
    },

    saveWeights: async (rows, gaugeWeights) => {
      const { project, catalog: before } = get();
      const catalog = withCompanyDefaults(before, {
        ...diffWeights(before, rows),
        gaugeWeightOverrides: diffGaugeWeights(before, gaugeWeights),
      });
      const synced = syncDerived(project, catalog);
      const own =
        catalog.weightOverrides.length +
        catalog.weightRemoved.length +
        Object.keys(catalog.gaugeWeightOverrides).length;
      set({
        catalog,
        status: `${catalog.weights.length} materiais por peso e pesos das chapas salvos${
          own > 0 ? ` (${own} ${own === 1 ? "alteração local" : "alterações locais"})` : ""
        }`,
        ...(synced !== project ? { project: synced, dirty: true } : {}),
      });
      await persist(catalog, "Não foi possível gravar a tabela de pesos");
    },

    saveKits: async (kits) => {
      const before = get().catalog;
      // a default removed here stays hidden even after it leaves the company's list (the
      // company may publish it again later): diffKits keeps its id until the user brings it back
      const catalog = withCompanyDefaults(
        before,
        diffKits(kitDefaults(before.remoteKits), kits, before),
      );
      const own = catalog.kitOverrides.length + catalog.kitRemoved.length;
      set({
        catalog,
        status: `${catalog.kits.length} presets de kit salvos${
          own > 0 ? ` (${own} ${own === 1 ? "alteração local" : "alterações locais"})` : ""
        }`,
      });
      relabelRuns(before.kits, catalog.kits);
      await persist(catalog, "Não foi possível gravar os presets");
    },
  };
};
