import { describe, expect, it } from "vitest";
import { emptyProject, type Project } from "./types";
import { buildSheetExport, defaultXlsxOptions, xlsxFileName, xlsxTabs } from "./xlsxExport";

/**
 * The "Exportar planilha" options: which discipline tabs go into the workbook, how each is split,
 * whether Resumo, zero-quantity items and prices are printed. Quantities come from count
 * markings so the numbers are exact.
 */

const D1 = "d1";

function project(): Project {
  const p = emptyProject();
  p.site = "Gávea";
  p.sectionsBy = "grupo";
  p.drawings = [{ id: D1, path: null, name: "planta.pdf", pages: [{ scale: null }] }];
  p.activeDrawingId = D1;
  const item = (id: string, system: string, group: string, price = 10): Project["items"][number] =>
    ({
      id,
      name: id,
      kind: "count",
      color: "#fff",
      group,
      system,
      materialPrice: price,
      laborPrice: 5,
      wastePct: 0,
    }) as Project["items"][number];
  p.items = [
    item("grelha", "Pressurização", "Difusores"),
    item("duto", "Pressurização", "Rede de Dutos"),
    item("exaustor", "Exaustão", "Equipamentos", 100),
  ];
  p.locations = [{ id: "loc1", name: "Térreo", color: "#fff" }];
  p.zones = [
    {
      id: "z1",
      locationId: "loc1",
      drawingId: D1,
      page: 0,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
    },
  ];
  const dot = (id: string, itemId: string, x: number) => ({
    id,
    itemId,
    drawingId: D1,
    page: 0,
    points: [{ x, y: 1 }],
  });
  // grelha ×2 inside Térreo, exaustor ×1 outside every location, duto never measured
  p.measurements = [dot("m1", "grelha", 1), dot("m2", "grelha", 2), dot("m3", "exaustor", 50)];
  return p;
}

const tabNames = (sheet: ReturnType<typeof buildSheetExport>) => sheet.sheets.map((s) => s.system);

describe("xlsx export options", () => {
  it("by default exports every tab with Resumo, the project's sections and prices", () => {
    const p = project();
    const sheet = buildSheetExport(p);
    expect(tabNames(sheet)).toEqual(["Exaustão", "Pressurização"]);
    expect(sheet.resumo).toBe(true);
    expect(sheet.sheets[1].sections.map((s) => s.name)).toEqual(["Rede de Dutos", "Difusores"]);
    expect(sheet.sheets[1].sections[1].rows[0]).toEqual({
      name: "grelha",
      unit: "pç",
      qty: 2,
      materialPrice: 10,
      laborPrice: 5,
    });
    expect(xlsxFileName(p, sheet)).toBe("Planilha Orçamentária - Gávea.xlsx");
  });

  it("writes only the chosen disciplines and names a single-tab file after it", () => {
    const p = project();
    const sheet = buildSheetExport(p, { ...defaultXlsxOptions(p), systems: ["Exaustão"] });
    expect(tabNames(sheet)).toEqual(["Exaustão"]);
    expect(xlsxFileName(p, sheet)).toBe("Planilha Orçamentária - Gávea - Exaustão.xlsx");
    expect(buildSheetExport(p, { ...defaultXlsxOptions(p), systems: [] }).sheets).toEqual([]);
  });

  it("can split the tabs by location regardless of the project's setting", () => {
    const p = project();
    const sheet = buildSheetExport(p, { ...defaultXlsxOptions(p), sectionsBy: "local" });
    expect(sheet.sheets[0].sections.map((s) => s.name)).toEqual(["Sem local"]);
    expect(sheet.sheets[1].sections.map((s) => s.name)).toEqual(["Térreo"]);
  });

  it("leaves out zero-quantity items, and the sections they empty, when asked", () => {
    const p = project();
    const kept = buildSheetExport(p);
    expect(kept.sheets[1].sections[0].rows.map((r) => [r.name, r.qty])).toEqual([["duto", 0]]);
    const trimmed = buildSheetExport(p, { ...defaultXlsxOptions(p), hideEmpty: true });
    expect(trimmed.sheets[1].sections.map((s) => s.name)).toEqual(["Difusores"]);
  });

  it("blanks the prices for a quantity-only list", () => {
    const p = project();
    const sheet = buildSheetExport(p, { ...defaultXlsxOptions(p), prices: false, resumo: false });
    const rows = sheet.sheets.flatMap((s) => s.sections.flatMap((sec) => sec.rows));
    expect(rows.every((r) => r.materialPrice === 0 && r.laborPrice === 0)).toBe(true);
    expect(rows.map((r) => r.qty)).toEqual([1, 0, 2]);
    expect(sheet.resumo).toBe(false);
  });

  it("lists the tabs with their proposal totals for the dialog", () => {
    const p = project();
    p.bdi = 1;
    p.extrasPct = 0;
    expect(xlsxTabs(p)).toEqual([
      { system: "Exaustão", proposal: 105, rows: 1 },
      { system: "Pressurização", proposal: 30, rows: 2 },
    ]);
  });
});
