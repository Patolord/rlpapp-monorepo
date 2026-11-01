import { describe, expect, it } from "vitest";
import { emptyProject, migrateProject } from "./types";

const square = (s: number) => [
  { x: 0, y: 0 },
  { x: s, y: 0 },
  { x: s, y: s },
  { x: 0, y: s },
];

describe("migration", () => {
  it("upgrades version 1 and 2 projects into a single drawing", () => {
    const v2 = {
      version: 2,
      name: "old",
      pdfPath: "C:\\obra\\planta.pdf",
      pdfName: "planta.pdf",
      unit: "m",
      currency: "BRL",
      bdi: 1.3,
      pages: [{ scale: null }],
      items: [
        {
          id: "a",
          name: "X",
          kind: "count",
          color: "#000",
          group: "Geral",
          materialPrice: 12,
          laborPrice: 0,
          wastePct: 0,
        },
      ],
      measurements: [{ id: "m", itemId: "a", page: 0, points: [{ x: 1, y: 1 }] }],
      zones: [{ id: "z", name: "T", page: 0, points: square(10), color: "#fff" }],
    };
    const p = migrateProject(v2);
    expect(p.version).toBe(4);
    expect(p.drawings).toHaveLength(1);
    expect(p.drawings[0].path).toBe("C:\\obra\\planta.pdf");
    expect(p.activeDrawingId).toBe(p.drawings[0].id);
    expect(p.measurements[0].drawingId).toBe(p.drawings[0].id);
    expect(p.zones[0].drawingId).toBe(p.drawings[0].id);
    expect(p.locations).toEqual([{ id: expect.any(String), name: "T", color: "#fff" }]);
    expect(p.zones[0].locationId).toBe(p.locations[0].id);
    expect(p.bdi).toBeCloseTo(1.3);
    const v1 = {
      version: 1,
      name: "v1",
      pdfPath: null,
      markupPct: 30,
      pages: [],
      items: [{ id: "a", name: "X", kind: "count", color: "#000", unitPrice: 5, wastePct: 0 }],
      measurements: [],
    };
    const q = migrateProject(v1);
    expect(q.drawings).toHaveLength(0);
    expect(q.items[0].materialPrice).toBe(5);
    expect(q.bdi).toBeCloseTo(1.3);
    expect(() => migrateProject({ version: 9 })).toThrow();
  });

  it("merges version 3 polygons of the same name into one location", () => {
    const v3 = {
      ...emptyProject(),
      version: 3,
      drawings: [
        { id: "a", path: null, name: "a.pdf", pages: [] },
        { id: "b", path: null, name: "b.pdf", pages: [] },
      ],
      zones: [
        {
          id: "z1",
          name: "Casa de Máquinas",
          drawingId: "a",
          page: 0,
          points: square(1),
          color: "#111",
        },
        {
          id: "z2",
          name: "casa de máquinas ",
          drawingId: "b",
          page: 0,
          points: square(1),
          color: "#222",
          repeat: 3,
        },
        {
          id: "z3",
          name: "Hall",
          drawingId: "a",
          page: 0,
          points: square(1),
          color: "#333",
          hidden: true,
        },
      ],
    };
    const p = migrateProject(v3);
    expect(p.version).toBe(4);
    expect(p.locations.map((l) => [l.name, l.color])).toEqual([
      ["Casa de Máquinas", "#111"],
      ["Hall", "#333"],
    ]);
    expect(p.zones.map((z) => z.locationId)).toEqual([
      p.locations[0].id,
      p.locations[0].id,
      p.locations[1].id,
    ]);
    expect(p.zones[1]).toMatchObject({ id: "z2", drawingId: "b", repeat: 3 });
    expect(p.zones[2].hidden).toBe(true);
    expect("name" in p.zones[0]).toBe(false);
  });

  it("loads version 4 files from before drawing revisions unchanged", () => {
    const drawing = { id: "d", path: "/obra/planta.pdf", name: "planta.pdf", pages: [] };
    const p = migrateProject({ ...emptyProject(), drawings: [drawing], activeDrawingId: "d" });
    expect(p.drawings).toEqual([drawing]);
    expect("revisions" in p.drawings[0]).toBe(false);
    // and a file that has them keeps them
    const revisions = [{ path: "/obra/planta-r0.pdf", name: "planta-r0.pdf", replacedAt: 1 }];
    const q = migrateProject({ ...emptyProject(), drawings: [{ ...drawing, revisions }] });
    expect(q.drawings[0].revisions).toEqual(revisions);
  });

  it("loads version 4 files from before kit labels unchanged, and keeps the labels of newer ones", () => {
    const old = {
      id: "m",
      itemId: "i",
      drawingId: "d",
      page: 0,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      linkId: "L",
    };
    const p = migrateProject(
      JSON.parse(JSON.stringify({ ...emptyProject(), measurements: [old] })),
    );
    expect(p.version).toBe(4);
    expect(p.measurements).toEqual([old]);
    for (const k of ["kitId", "kitLabel", "label"]) expect(k in p.measurements[0]).toBe(false);
    const labelled = { ...old, kitId: "kit-12-000-inverter", kitLabel: '1/4" · 3/8"', label: "L1" };
    const q = migrateProject({ ...emptyProject(), measurements: [labelled] });
    expect(q.measurements).toEqual([labelled]);
  });

  it("loads files without an app identity (older versions) with none, and keeps a valid one", () => {
    const old = migrateProject(JSON.parse(JSON.stringify(emptyProject())));
    expect("id" in old).toBe(false);
    expect("sentToApp" in old).toBe(false);
    const sentToApp = { obraId: "o1", obraName: "Obra", sentAt: 1, obraSlug: "obra" };
    const p = migrateProject({ ...emptyProject(), id: " abc ", sentToApp });
    expect(p.id).toBe("abc");
    expect(p.sentToApp).toEqual(sentToApp);
  });

  it("drops a malformed app identity instead of sending to a wrong place", () => {
    const p = migrateProject({ ...emptyProject(), id: 42, sentToApp: { obraId: "o1" } });
    expect("id" in p).toBe(false);
    expect("sentToApp" in p).toBe(false);
    // a link without an id is useless: the next send would create another budget anyway
    const q = migrateProject({
      ...emptyProject(),
      sentToApp: { obraId: "o1", obraName: "Obra", sentAt: 1 },
    });
    expect("sentToApp" in q).toBe(false);
  });
});
