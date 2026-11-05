import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchCatalogAsUser = vi.fn();
vi.mock("../lib/account/convex", async (orig) => ({
  ...(await orig<typeof import("../lib/account/convex")>()),
  fetchCatalogAsUser: () => fetchCatalogAsUser(),
}));
vi.mock("../lib/account/session", async (orig) => ({
  ...(await orig<typeof import("../lib/account/session")>()),
  isSignedIn: () => true,
}));

/** The catalog is written to localStorage outside Tauri: keep it in memory here. */
const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
});
// outside Tauri: no native window, the catalog goes to localStorage
vi.stubGlobal("window", {});

const { useStore } = await import("./index");

describe("refreshCatalog", () => {
  beforeEach(() => {
    fetchCatalogAsUser.mockReset();
  });

  it("shares one refresh between overlapping calls and stays busy until it ends", async () => {
    let resolve: (v: unknown) => void = () => {};
    fetchCatalogAsUser.mockReturnValue(new Promise((r) => (resolve = r)));
    const s = useStore.getState();
    const a = s.refreshCatalog();
    const b = s.refreshCatalog();
    expect(fetchCatalogAsUser).toHaveBeenCalledTimes(1);
    expect(useStore.getState().catalogSyncing).toBe(true);
    resolve({
      entries: [],
      redirects: {},
      generatedAt: 1,
      kits: null,
      weights: null,
      basePrices: null,
      vrfBrands: null,
      labor: null,
      ductNormas: null,
    });
    expect(await a).toBe(0);
    expect(await b).toBe(0);
    expect(useStore.getState().catalogSyncing).toBe(false);
    expect(useStore.getState().catalogSyncError).toBeNull();
  });

  it("keeps why the last refresh failed", async () => {
    fetchCatalogAsUser.mockRejectedValue(new Error("sem conexão"));
    const err = await useStore
      .getState()
      .refreshCatalog()
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect((err as Error).message).toBe("sem conexão");
    expect(useStore.getState().catalogSyncError).toBe("sem conexão");
    expect(useStore.getState().catalogSyncing).toBe(false);
  });
});
