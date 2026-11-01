import { describe, expect, test } from "vitest";
import {
  formatBdi,
  groupDesktopBudget,
  OTHER_SHEET,
  type DesktopBudgetItem,
} from "./desktop-budget";

const line = (
  over: Partial<DesktopBudgetItem> & { id: string }
): DesktopBudgetItem & { id: string } => ({
  quantity: 1,
  estimatedUnitPriceCents: 0,
  laborUnitPriceCents: 0,
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
});

test("formatBdi shows the multiplier as a percentage", () => {
  expect(formatBdi(1.42)).toBe("42 %");
  expect(formatBdi(1.255)).toBe("25,5 %");
});
