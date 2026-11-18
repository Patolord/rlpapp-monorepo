import { describe, expect, test } from "vitest";

import { applyMove, dueState, folderStatus, initials, shortDate } from "./budget-board";

describe("folderStatus", () => {
  const folder = { itemId: "x", name: "X", webUrl: null, checkedAt: 1 };
  test("compara a etapa da pasta com a do card", () => {
    expect(folderStatus({ stage: "em_andamento", folder: null })).toBe("none");
    expect(folderStatus({ stage: "em_andamento", folder: { ...folder, stage: null } })).toBe("unchecked");
    expect(folderStatus({ stage: "em_andamento", folder: { ...folder, stage: "em_andamento" } })).toBe("ok");
    expect(folderStatus({ stage: "concluido", folder: { ...folder, stage: "em_andamento" } })).toBe(
      "mismatch"
    );
    expect(folderStatus({ stage: "concluido", folder: { ...folder, stage: "missing" } })).toBe("missing");
  });
});

test("dueState marca vencido e perto de vencer", () => {
  expect(dueState("2026-11-15", "2026-11-16")).toBe("late");
  expect(dueState("2026-11-16", "2026-11-16")).toBe("soon");
  expect(dueState("2026-11-19", "2026-11-16")).toBe("soon");
  expect(dueState("2026-11-20", "2026-11-16")).toBe("ok");
});

test("shortDate e initials", () => {
  expect(shortDate("2026-12-01")).toBe("01/12");
  expect(initials("Fernanda Lima Souza")).toBe("FS");
  expect(initials("Rodrigo")).toBe("RO");
});

describe("applyMove", () => {
  const cards = [
    { _id: "a", stage: "para_fazer" as const, position: 0 },
    { _id: "b", stage: "para_fazer" as const, position: 1 },
    { _id: "c", stage: "em_andamento" as const, position: 0 },
  ];
  const order = (list: typeof cards, stage: string) =>
    list
      .filter((card) => card.stage === stage)
      .sort((x, y) => x.position - y.position)
      .map((card) => card._id);

  test("leva para outra coluna na posição pedida", () => {
    expect(order(applyMove(cards, "a", "em_andamento", 0), "em_andamento")).toEqual(["a", "c"]);
    expect(order(applyMove(cards, "a", "em_andamento", 5), "em_andamento")).toEqual(["c", "a"]);
  });

  test("reordena dentro da coluna", () => {
    expect(order(applyMove(cards, "b", "para_fazer", 0), "para_fazer")).toEqual(["b", "a"]);
    expect(order(applyMove(cards, "a", "para_fazer", 1), "para_fazer")).toEqual(["b", "a"]);
  });

  test("coluna vazia", () => {
    expect(applyMove(cards, "c", "concluido", 0).find((card) => card._id === "c")).toMatchObject({
      stage: "concluido",
      position: 0,
    });
  });
});
