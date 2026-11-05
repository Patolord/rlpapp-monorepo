import { beforeEach, describe, expect, it, vi } from "vitest";
import { type CatalogEntry, emptyCatalogStore } from "../lib/catalog";
import type { Kit } from "../lib/kits";
import { emptyProject, type Project } from "../lib/types";
import { metricScale } from "../lib/units";
import { useStore } from "./index";

/** The catalog is written to localStorage outside Tauri: keep it in memory here. */
const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
});

const remote = (sku: string, name: string, materialPrice: number): CatalogEntry => ({
  name,
  group: "Tubulações",
  unit: "m",
  materialPrice,
  laborPrice: 5,
  source: "remote",
  catalogId: `id-${sku}`,
  sku,
  priceDate: 1_700_000_000_000,
});

const KIT: Kit = {
  id: "kit-ls",
  name: "9.000 Inverter",
  components: [
    // linked by code: the catalog name has changed since the kit was made
    {
      name: 'Tubulação de Cobre 1/4"',
      sku: "MAT-000010",
      group: "Tubulações",
      kind: "linear",
      factor: 1,
    },
    // custom item, found by name in the user's own catalog
    { name: "Fita PVC", group: "Acessórios", kind: "linear", factor: 1 },
    // a code the catalog does not have (yet): falls back to the name
    { name: "Cabo PP 5x1,5 mm²", sku: "MAT-000999", group: "Elétrica", kind: "linear", factor: 2 },
  ],
};

function fixture(): Project {
  return {
    ...emptyProject(),
    drawings: [{ id: "d1", path: null, name: "Térreo", pages: [{ scale: metricScale(50) }] }],
    activeDrawingId: "d1",
  };
}

const run = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
];

describe("kit components linked to the company catalog by code", () => {
  beforeEach(() => {
    useStore.getState().resetProject(fixture());
    useStore.setState({
      catalog: {
        ...emptyCatalogStore(),
        kits: [KIT],
        remote: [
          remote("MAT-000010", 'Tubo de Cobre — 1/4"', 30),
          remote("MAT-000011", 'Tubulação de Cobre 1/4"', 99),
        ],
        saved: [
          {
            name: "Fita PVC",
            group: "Acessórios",
            unit: "m",
            materialPrice: 2,
            laborPrice: 0,
            source: "saved",
          },
        ],
      },
      page: 0,
      selection: [],
      status: null,
      drawSystem: null,
    });
  });

  it("creates the item from the material with the code, under its catalog name", () => {
    useStore.getState().addKitRun("kit-ls", 0, run);
    const [copper, tape, cable] = useStore.getState().project.items;
    expect(copper).toMatchObject({
      name: 'Tubo de Cobre — 1/4"',
      catalogId: "id-MAT-000010",
      materialPrice: 30,
      priceSource: "catalog",
    });
    expect(tape).toMatchObject({ name: "Fita PVC", materialPrice: 2 });
    expect(cable).toMatchObject({ name: "Cabo PP 5x1,5 mm²", materialPrice: 0, factor: 2 });
    expect(cable.catalogId).toBeUndefined();
  });

  it("finds the code even when a saved entry has the company material's name", () => {
    const { catalog } = useStore.getState();
    useStore.setState({
      catalog: {
        ...catalog,
        saved: [
          ...catalog.saved,
          {
            name: 'Tubo de Cobre — 1/4"',
            group: "Tubulações",
            unit: "m",
            materialPrice: 1,
            laborPrice: 0,
            source: "saved",
          },
        ],
      },
    });
    useStore.getState().addKitRun("kit-ls", 0, run);
    expect(useStore.getState().project.items[0]).toMatchObject({
      catalogId: "id-MAT-000010",
      materialPrice: 30,
    });
  });

  it("links a same-named line without a link, keeping its price", () => {
    const { project } = useStore.getState();
    useStore.getState().resetProject({
      ...project,
      items: [
        {
          id: "own",
          name: 'Tubo de Cobre — 1/4"',
          kind: "linear",
          color: "#000",
          group: "Tubulações",
          materialPrice: 12,
          laborPrice: 0,
          wastePct: 0,
          priceSource: "manual",
        },
      ],
    });
    useStore.getState().addKitRun("kit-ls", 0, run);
    const items = useStore.getState().project.items;
    expect(items.filter((i) => i.name === 'Tubo de Cobre — 1/4"')).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "own", catalogId: "id-MAT-000010", materialPrice: 12 });
  });

  it("reuses the linked item on the next run", () => {
    const s = useStore.getState();
    s.addKitRun("kit-ls", 0, run);
    s.addKitRun("kit-ls", 0, run);
    const { project } = useStore.getState();
    expect(project.items).toHaveLength(3);
    expect(project.measurements).toHaveLength(6);
  });
});
