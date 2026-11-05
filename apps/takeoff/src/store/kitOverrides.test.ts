import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCatalogStore, withCompanyDefaults } from "../lib/catalog";
import { type Kit, SEED_KITS } from "../lib/kits";
import { useStore } from "./index";

/** The catalog is written to localStorage outside Tauri: keep it in memory here. */
const storage = new Map<string, string>();
vi.stubGlobal("window", {});
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
});

const company = (id: string, name: string): Kit => ({
  id,
  name,
  mode: "count",
  components: [{ name, group: "Equipamentos", kind: "count", factor: 1 }],
});

describe("weights, prices and VRF brands with company defaults", () => {
  beforeEach(() => {
    useStore.setState({ catalog: emptyCatalogStore(), status: null });
  });

  it("setBasePrice keeps the user's price over the company's; empty goes back to it", () => {
    const s = useStore.getState();
    useStore.setState({
      catalog: withCompanyDefaults(s.catalog, { remoteBasePrices: { cobre: 110 } }),
    });
    expect(useStore.getState().catalog.basePrices).toEqual({ cobre: 110 });
    useStore.getState().setBasePrice("cobre", 125);
    useStore.getState().setBasePrice("chapa", 9);
    expect(useStore.getState().catalog.basePriceOverrides).toEqual({ cobre: 125, chapa: 9 });
    expect(useStore.getState().catalog.basePrices).toEqual({ cobre: 125, chapa: 9 });
    useStore.getState().setBasePrice("cobre", undefined);
    expect(useStore.getState().catalog.basePrices).toEqual({ cobre: 110, chapa: 9 });
    // the company changes its price: the user's untouched key follows, the override stays
    useStore.setState({
      catalog: withCompanyDefaults(useStore.getState().catalog, {
        remoteBasePrices: { cobre: 115, chapa: 8 },
      }),
    });
    expect(useStore.getState().catalog.basePrices).toEqual({ cobre: 115, chapa: 9 });
  });

  it("saveWeights keeps edited rows and set gauges as overrides, a value put back is dropped", async () => {
    const s = useStore.getState();
    const [first, ...rest] = s.catalog.weights;
    await s.saveWeights([{ ...first, kgPerUnit: 0.2 }, ...rest], {
      "# 26": 4.38,
      "# 24": 5,
      "# 22": 0,
    });
    const c = useStore.getState().catalog;
    expect(c.weightOverrides.map((r) => r.name)).toEqual([first.name]);
    expect(c.weightRemoved).toEqual([]);
    expect(c.gaugeWeightOverrides).toEqual({ "# 24": 5 });
    expect(c.gaugeWeights["# 24"]).toBe(5);
    expect(c.gaugeWeights["# 22"]).toBe(6.82);
    await useStore.getState().saveWeights(
      useStore.getState().catalog.weights.map((r) => (r.name === first.name ? first : r)),
      {},
    );
    expect(useStore.getState().catalog.weightOverrides).toEqual([]);
    expect(useStore.getState().catalog.gaugeWeightOverrides).toEqual({});
  });

  it("saveVrfBrands keeps an edited brand over a changed company default", async () => {
    const s = useStore.getState();
    const [daikin, hitachi] = s.catalog.vrfBrands;
    await s.saveVrfBrands([{ ...daikin, name: "Daikin (RLP)" }, hitachi]);
    expect(useStore.getState().catalog.vrfBrandOverrides.map((b) => b.id)).toEqual(["daikin"]);
    useStore.setState({
      catalog: withCompanyDefaults(useStore.getState().catalog, {
        remoteVrfBrands: [
          { ...daikin, name: "Daikin v2" },
          { ...hitachi, name: "Hitachi v2" },
        ],
      }),
    });
    expect(useStore.getState().catalog.vrfBrands.map((b) => b.name)).toEqual([
      "Daikin (RLP)",
      "Hitachi v2",
    ]);
  });
});

describe("saveKits with company defaults", () => {
  beforeEach(() => {
    useStore.setState({ catalog: emptyCatalogStore(), status: null });
  });

  it("keeps a removal of a default that later leaves and re-enters the company's list", async () => {
    const s = useStore.getState();
    const [gone, ...rest] = SEED_KITS;
    // the factory presets are the defaults: the user removes one
    await s.saveKits(rest);
    expect(useStore.getState().catalog.kitRemoved).toEqual([gone.id]);

    // the company publishes only its own kits; the user adds a kit of their own and saves
    const own = [company("kit-x", "X")];
    useStore.setState({
      catalog: withCompanyDefaults(useStore.getState().catalog, { remoteKits: own }),
    });
    const mine = company("mine", "Meu kit");
    await useStore.getState().saveKits([...useStore.getState().catalog.kits, mine]);
    const after = useStore.getState().catalog;
    expect(after.kits.map((k) => k.id)).toEqual(["kit-x", "mine"]);
    expect(after.kitRemoved).toEqual([gone.id]);

    // the company loads the factory kits too: the removed one stays hidden, the others arrive
    useStore.setState({
      catalog: withCompanyDefaults(after, { remoteKits: [...own, ...SEED_KITS] }),
    });
    const ids = useStore.getState().catalog.kits.map((k) => k.id);
    expect(ids).not.toContain(gone.id);
    expect(ids).toContain(rest[0].id);
    expect(ids).toContain("mine");
  });

  it("forgets a removal once the user brings the default back", async () => {
    const s = useStore.getState();
    const [gone, ...rest] = SEED_KITS;
    await s.saveKits(rest);
    await useStore.getState().saveKits(SEED_KITS);
    expect(useStore.getState().catalog.kitRemoved).toEqual([]);
    expect(useStore.getState().catalog.kits.map((k) => k.id)).toContain(gone.id);
  });
});
