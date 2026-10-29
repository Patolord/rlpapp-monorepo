import { describe, expect, it } from "vitest";
import { defaultFooter, hasPoints, resolveDiscipline } from "./discipline";
import { buildQuote, disciplineTotals } from "./quantities";
import { emptyProject, migrateProject, type Project } from "./types";

/** Two disciplines with one count item each, measured once on an unscaled page. */
function project(): Project {
  const p = emptyProject();
  p.drawings = [{ id: "d1", path: null, name: "planta.pdf", pages: [{ scale: null }] }];
  p.activeDrawingId = "d1";
  p.items = [
    {
      id: "ex",
      name: "Exaustor",
      kind: "count",
      color: "#000",
      group: "Equipamentos",
      materialPrice: 1000,
      laborPrice: 100,
      wastePct: 0,
      system: "Exaustão",
    },
    {
      id: "ac",
      name: "Split",
      kind: "count",
      color: "#000",
      group: "Equipamentos",
      materialPrice: 3000,
      laborPrice: 500,
      wastePct: 0,
      system: "AC Áreas Comuns",
    },
  ];
  p.measurements = [
    { id: "m1", itemId: "ex", drawingId: "d1", page: 0, points: [{ x: 1, y: 1 }] },
    { id: "m2", itemId: "ac", drawingId: "d1", page: 0, points: [{ x: 2, y: 2 }] },
  ];
  p.bdi = 1.4;
  p.extrasPct = 6;
  return p;
}

describe("discipline settings", () => {
  it("fall back to the project's BDI, extras and the usual footer", () => {
    const p = project();
    const r = resolveDiscipline(p, "Exaustão");
    expect(r.bdi).toBe(1.4);
    expect(r.extrasPct).toBe(6);
    expect(r.footer).toEqual(defaultFooter("Exaustão"));
    expect(hasPoints(r.footer)).toBe(true);
  });

  it("use the tab's own values where set, field by field", () => {
    const p = project();
    p.disciplines = { Exaustão: { bdi: 1.25, footer: [] } };
    const r = resolveDiscipline(p, "Exaustão");
    expect(r.bdi).toBe(1.25);
    expect(r.extrasPct).toBe(6);
    expect(r.footer).toEqual([]);
  });

  it("have equipment and installation factors on the AC tabs only", () => {
    expect(defaultFooter("Infra AC").some((l) => l.kind === "factor")).toBe(true);
    expect(defaultFooter("ac areas comuns").some((l) => l.kind === "factor")).toBe(true);
    expect(defaultFooter("Pressurização de Escadas").map((l) => l.kind)).toEqual([
      "points",
      "perPoint",
    ]);
  });
});

describe("per-tab totals", () => {
  it("apply each tab's extras and BDI, and the quote sums the tabs", () => {
    const p = project();
    p.disciplines = { Exaustão: { bdi: 1.25, extrasPct: 3 } };
    const tabs = disciplineTotals(p);
    expect(tabs.map((t) => t.system)).toEqual(["Exaustão", "AC Áreas Comuns"]);
    const [ex, ac] = tabs;
    // Exaustão: 1100 × 3 % = 33 → 11 each; AC: 3500 × 6 % = 210 → 70 each
    expect(ex.extraEach).toBe(11);
    expect(ex.totalGeral).toBeCloseTo(1133, 6);
    expect(ex.proposal).toBeCloseTo(1416.25, 6);
    expect(ac.extraEach).toBe(70);
    expect(ac.totalGeral).toBeCloseTo(3710, 6);
    expect(ac.proposal).toBeCloseTo(5194, 6);
    const q = buildQuote(p);
    expect(q.extraEach).toBe(81);
    expect(q.totalGeral).toBeCloseTo(4843, 6);
    expect(q.proposal).toBeCloseTo(1416.25 + 5194, 6);
  });
});

describe("migration", () => {
  it("gives older files an empty disciplines map and drops junk lines", () => {
    const { disciplines: _d, ...old } = emptyProject();
    expect(migrateProject(old).disciplines).toEqual({});
    const p = migrateProject({
      ...emptyProject(),
      disciplines: {
        Exaustão: {
          bdi: 1.3,
          footer: [
            { kind: "points", label: "Pontos", value: 4 },
            { kind: "factor", label: "x", base: "nope", factor: 1 },
            { kind: "stat", label: "sem valor" },
            "junk",
          ],
        },
        broken: null,
      },
    });
    expect(p.disciplines).toEqual({
      Exaustão: { bdi: 1.3, footer: [{ kind: "points", label: "Pontos", value: 4 }] },
    });
  });
});
