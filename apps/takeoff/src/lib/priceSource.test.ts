import { describe, expect, it } from "vitest";
import { useStore } from "../store";
import type { CatalogEntry } from "./catalog";
import { describePriceSource, priceSourceOfEntry } from "./priceSource";
import { emptyProject } from "./types";

const entry = (over: Partial<CatalogEntry>): CatalogEntry => ({
  name: "Grelha 300x300",
  group: "Bocas de Ar",
  unit: "pç",
  materialPrice: 120,
  laborPrice: 0,
  ...over,
});

describe("price source", () => {
  it("names where a catalog entry's price comes from", () => {
    expect(priceSourceOfEntry(entry({ source: "remote" }))).toBe("catalog");
    expect(priceSourceOfEntry(entry({ source: "saved" }))).toBe("saved");
    expect(priceSourceOfEntry(entry({ source: "seed" }))).toBe("seed");
    expect(priceSourceOfEntry(entry({ source: "seed", kgPerUnit: 1.2 }))).toBe("weight");
  });

  it("describes the source and the date in pt-BR", () => {
    const d = new Date(2026, 9, 26).getTime();
    expect(describePriceSource("catalog", d)).toContain("nuvem");
    expect(describePriceSource("catalog", d)).toContain("26/10/2026");
    expect(describePriceSource("manual", d)).toBe("Preço digitado em 26/10/2026");
    expect(describePriceSource("seed")).toContain("planilhas anteriores");
    expect(describePriceSource(undefined)).toContain("não registrada");
  });

  it("records the source on lines created from the catalog and on typed prices", () => {
    const store = useStore.getState();
    store.resetProject(emptyProject(), null);
    const quoted = new Date(2026, 8, 1).getTime();
    const cloud = store.addItemFromCatalog(
      entry({ source: "remote", catalogId: "m1", priceDate: quoted }),
    );
    const seed = store.addItemFromCatalog(entry({ name: "Difusor", source: "seed" }));
    const saved = store.addItemFromCatalog(
      entry({ name: "Veneziana", source: "saved", priceDate: quoted }),
    );
    const items = () => useStore.getState().project.items;
    const of = (id: string) => items().find((i) => i.id === id);
    expect(of(cloud)).toMatchObject({ priceSource: "catalog", priceDate: quoted, catalogId: "m1" });
    expect(of(seed)?.priceSource).toBe("seed");
    expect(of(seed)?.priceDate).toBeUndefined();
    expect(of(saved)).toMatchObject({ priceSource: "saved", priceDate: quoted });
    // typing a price makes it the user's own, dated now
    store.updateItem(cloud, { materialPrice: 99 });
    expect(of(cloud)?.priceSource).toBe("manual");
    expect(of(cloud)?.priceDate).toBeGreaterThan(quoted);
  });
});
