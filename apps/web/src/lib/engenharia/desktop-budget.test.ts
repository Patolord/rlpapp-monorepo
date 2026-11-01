import { describe, expect, test } from "vitest";
import {
  formatBdi,
  groupDesktopBudget,
  lineLaborCents,
  lineMaterialCents,
  OTHER_SHEET,
  type DesktopBudgetItem,
} from "./desktop-budget";

const line = (
  over: Partial<DesktopBudgetItem> & { id: string }
): DesktopBudgetItem & { id: string } => ({
  quantity: 1,
  estimatedUnitPriceCents: 0,
  laborUnitPriceCents: 0,
  materialTotalCents: null,
  laborTotalCents: null,
  sheet: "Exaustão",
  section: "Térreo",
  externalRemovedAt: null,
  ...over,
});

describe("groupDesktopBudget", () => {
  test("groups by sheet and section and computes the sheet totals like the desktop", () => {
    const sheets = groupDesktopBudget(
      [
        line({ id: "a", quantity: 110, estimatedUnitPriceCents: 1235, laborUnitPriceCents: 410 }),
        line({ id: "b", quantity: 3, estimatedUnitPriceCents: 25000, laborUnitPriceCents: 3000, section: "1º Pav" }),
        line({ id: "c", quantity: 2, estimatedUnitPriceCents: 90050, laborUnitPriceCents: 12000, sheet: "Pressurização" }),
      ],
      [
        { name: "Pressurização", bdi: 1.25, extrasPct: 0, proposalCents: 1 },
        { name: "Exaustão", bdi: 1.42, extrasPct: 5, proposalCents: 394966 },
      ]
    );
    // order of the published summary
    expect(sheets.map((s) => s.name)).toEqual(["Pressurização", "Exaustão"]);
    const exaustao = sheets[1]!;
    expect(exaustao.sections.map((s) => [s.name, s.lines.map((l) => l.id)])).toEqual([
      ["Térreo", ["a"]],
      ["1º Pav", ["b"]],
    ]);
    expect(exaustao).toMatchObject({
      materialCents: 135850 + 75000,
      laborCents: 45100 + 9000,
      extrasEachCents: 4416,
      totalCents: 210850 + 54100 + 3 * 4416,
      proposalCents: Math.round((210850 + 54100 + 3 * 4416) * 1.42),
      publishedProposalCents: 394966,
    });
    expect(sheets[0]).toMatchObject({ materialCents: 180100, laborCents: 24000, totalCents: 204100 });
  });

  test("lines removed in the desktop are listed but left out of the totals", () => {
    const [sheet] = groupDesktopBudget(
      [
        line({ id: "a", estimatedUnitPriceCents: 100 }),
        line({ id: "b", estimatedUnitPriceCents: 999, externalRemovedAt: 1 }),
      ],
      []
    );
    expect(sheet!.sections[0]!.lines).toHaveLength(2);
    expect(sheet!.materialCents).toBe(100);
    expect(sheet!.bdi).toBe(1);
    expect(sheet!.publishedProposalCents).toBeNull();
  });

  test("lines without a sheet go to the extra sheet; empty summary sheets are skipped", () => {
    const sheets = groupDesktopBudget(
      [line({ id: "m", sheet: null, section: null })],
      [{ name: "Exaustão", bdi: 1.42, extrasPct: 5, proposalCents: 0 }]
    );
    expect(sheets.map((s) => s.name)).toEqual([OTHER_SHEET]);
    expect(sheets[0]!.sections[0]!.name).toBe("Sem seção");
  });

  test("a tab or section renamed only in case or spaces stays one, under the summary name", () => {
    // a frozen line keeps the spelling of an older publication
    const sheets = groupDesktopBudget(
      [
        line({ id: "new", sheet: "EXAUSTÃO", section: "TÉRREO", estimatedUnitPriceCents: 100 }),
        line({ id: "old", sheet: "Exaustão", section: " Térreo ", estimatedUnitPriceCents: 200 }),
      ],
      [{ name: "EXAUSTÃO", bdi: 1.42, extrasPct: 6, proposalCents: 0 }]
    );
    expect(sheets).toHaveLength(1);
    expect(sheets[0]).toMatchObject({ name: "EXAUSTÃO", bdi: 1.42, extrasPct: 6, materialCents: 300 });
    expect(sheets[0]!.sections.map((s) => [s.name, s.lines.map((l) => l.id)])).toEqual([
      ["TÉRREO", ["new", "old"]],
    ]);
  });

  test("uses the line totals the desktop published, so an unchanged budget shows its amounts", () => {
    // 110 × R$ 12,345 is R$ 1.357,95 on the desktop; 110 × 1235 cents would be R$ 1.358,50.
    // Same budget as the desktop builder test: Exaustão totals 210795 / 54100, extras 4415 each,
    // TOTAL GERAL 278140, with BDI 394959.
    const [sheet] = groupDesktopBudget(
      [
        line({
          id: "duto",
          quantity: 110,
          estimatedUnitPriceCents: 1235,
          laborUnitPriceCents: 410,
          materialTotalCents: 135795,
          laborTotalCents: 45100,
        }),
        line({
          id: "grelha",
          quantity: 3,
          estimatedUnitPriceCents: 25000,
          laborUnitPriceCents: 3000,
          materialTotalCents: 75000,
          laborTotalCents: 9000,
        }),
      ],
      [{ name: "Exaustão", bdi: 1.42, extrasPct: 5, proposalCents: 394959 }]
    );
    expect(sheet).toMatchObject({
      materialCents: 210795,
      laborCents: 54100,
      extrasEachCents: 4415,
      totalCents: 278140,
      proposalCents: 394959,
      publishedProposalCents: 394959,
    });
  });

  test("falls back to quantity × unit price when a line has no published total", () => {
    const item = line({ id: "a", quantity: 110, estimatedUnitPriceCents: 1235, laborUnitPriceCents: 410 });
    expect(lineMaterialCents(item)).toBe(135850);
    expect(lineLaborCents(item)).toBe(45100);
    expect(lineMaterialCents({ ...item, materialTotalCents: 135795 })).toBe(135795);
  });
});

test("formatBdi shows the multiplier as a percentage", () => {
  expect(formatBdi(1.42)).toBe("42 %");
  expect(formatBdi(1.255)).toBe("25,5 %");
});
