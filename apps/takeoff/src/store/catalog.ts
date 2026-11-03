import type { GaugeWeights } from "@rlpapp/shared/engenharia/ducts";
import { fetchCatalogAsUser, sendProposalAsUser } from "../lib/account/convex";
import { isSignedIn } from "../lib/account/session";
import {
  type CatalogEntry,
  type CatalogStore,
  emptyCatalogStore,
  fetchRemoteCatalog,
  loadCatalogStore,
  mergeCatalog,
  saveCatalogStore,
  unitForKind,
} from "../lib/catalog";
import {
  applyRedirects,
  buildProposal,
  newClientId,
  type QueuedProposal,
  sendProposal,
} from "../lib/catalogRemote";
import { syncDuctItems } from "../lib/ductItems";
import { type Kit, refreshKitLabels } from "../lib/kits";
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

  /** Price per kg of a base material, app-wide (undefined = back to the bundled default). */
  setBasePrice(key: string, price: number | undefined): void;
  /**
   * Replace the weight table (materials priced by weight) and the sheet weight of each duct
   * gauge, saved with the catalog; the duct networks of the open takeoff follow.
   */
  saveWeights(rows: WeightRow[], gaugeWeights: GaugeWeights): Promise<void>;
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
      const next = {
        ...catalog,
        remote: remote.entries,
        redirects: remote.redirects,
        remoteGeneratedAt: remote.generatedAt,
        fetchedAt: new Date().toISOString(),
      };
      set({ catalog: next });
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
      const basePrices = { ...catalog.basePrices };
      if (price === undefined || Number.isNaN(price)) delete basePrices[key];
      else basePrices[key] = price;
      const next = { ...catalog, basePrices };
      // every weight-priced line and duct network of the open takeoff follows the new price per kg
      // (no undo step: the setting itself is not part of the project)
      const synced = syncDerived(project, next);
      set({ catalog: next, ...(synced !== project ? { project: synced, dirty: true } : {}) });
      void saveCatalogStore(next);
    },

    saveWeights: async (rows, gaugeWeights) => {
      const { project } = get();
      const catalog = { ...get().catalog, weights: rows, gaugeWeights };
      const synced = syncDerived(project, catalog);
      set({
        catalog,
        status: `${rows.length} materiais por peso e pesos das chapas salvos`,
        ...(synced !== project ? { project: synced, dirty: true } : {}),
      });
      await persist(catalog, "Não foi possível gravar a tabela de pesos");
    },

    saveKits: async (kits) => {
      const { catalog: before, project, past, future } = get();
      const catalog = { ...before, kits };
      // runs of a relabelled kit already show the new label (it is read from the catalog); their
      // saved copy follows, so the project shows it on a machine without the kit too. Outside
      // undo, like the other catalog settings, and in the undo history as well, so stepping
      // back and forth never brings an old label back into the file.
      const relabel = (p: Project): Project => {
        const measurements = refreshKitLabels(p.measurements, before.kits, kits);
        return measurements === p.measurements ? p : { ...p, measurements };
      };
      const next = relabel(project);
      set({
        catalog,
        status: `${kits.length} presets de kit salvos`,
        past: past.map(relabel),
        future: future.map(relabel),
        ...(next !== project ? { project: next, dirty: true } : {}),
      });
      await persist(catalog, "Não foi possível gravar os presets");
    },
  };
};
