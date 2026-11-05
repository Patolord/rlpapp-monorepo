import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "./catalog";
import { catalogLinkOf } from "./catalogLink";

const entry: CatalogEntry = {
  name: 'Tubulação de Cobre — 1/4"',
  group: "Tubulações",
  unit: "m",
  materialPrice: 30,
  laborPrice: 5,
  source: "remote",
  catalogId: "m1",
  sku: "MAT-000010",
  priceDate: Date.UTC(2026, 9, 1, 12),
  status: "active",
};
const remote = new Map([["m1", entry]]);
const item = {
  name: 'Tubulação de Cobre — 1/4"',
  catalogId: "m1",
  materialPrice: 30,
  priceSource: "catalog" as const,
};

describe("catalogLinkOf", () => {
  it("is linked when name and price are the catalog's", () => {
    const link = catalogLinkOf(item, remote);
    expect(link?.state).toBe("linked");
    expect(link?.title).toContain("MAT-000010");
  });

  it("is edited when renamed or priced by hand here", () => {
    expect(catalogLinkOf({ ...item, name: "Cobre 1/4 obra X" }, remote)?.state).toBe("edited");
    const typed = catalogLinkOf({ ...item, priceSource: "manual", materialPrice: 28 }, remote);
    expect(typed?.state).toBe("edited");
    expect(typed?.title).toContain("preço digitado");
  });

  it("is outdated when the catalog price changed or the material left the catalog", () => {
    expect(catalogLinkOf({ ...item, materialPrice: 25 }, remote)?.state).toBe("outdated");
    expect(catalogLinkOf({ ...item, catalogId: "gone" }, remote)?.state).toBe("outdated");
  });

  it("tells drafts, unlinked lines and computed systems apart", () => {
    const drafts = new Map([["m1", { ...entry, status: "draft" as const }]]);
    expect(catalogLinkOf(item, drafts)?.state).toBe("draft");
    expect(catalogLinkOf({ ...item, catalogId: undefined }, remote)?.state).toBe("manual");
    expect(catalogLinkOf({ ...item, derived: "vrf" }, remote)).toBeUndefined();
  });

  it("takes a link as it stands while no catalog was received", () => {
    expect(catalogLinkOf({ ...item, materialPrice: 1 }, null)?.state).toBe("linked");
  });
});
