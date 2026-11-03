import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCatalogStore, withEffectiveKits } from "../lib/catalog";
import { type Kit, SEED_KITS } from "../lib/kits";
import { useStore } from "./index";

/** The catalog is written to localStorage outside Tauri: keep it in memory here. */
const storage = new Map<string, string>();
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
      catalog: withEffectiveKits(useStore.getState().catalog, { remoteKits: own }),
    });
    const mine = company("mine", "Meu kit");
    await useStore.getState().saveKits([...useStore.getState().catalog.kits, mine]);
    const after = useStore.getState().catalog;
    expect(after.kits.map((k) => k.id)).toEqual(["kit-x", "mine"]);
    expect(after.kitRemoved).toEqual([gone.id]);

    // the company loads the factory kits too: the removed one stays hidden, the others arrive
    useStore.setState({
      catalog: withEffectiveKits(after, { remoteKits: [...own, ...SEED_KITS] }),
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
