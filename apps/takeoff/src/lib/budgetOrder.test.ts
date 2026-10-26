import { describe, expect, it } from "vitest";
import {
  budgetGroups,
  canonicalGroup,
  compareNames,
  groupTier,
  moveGroupInBudget,
  moveItemInBudget,
  sortItemsForBudget,
} from "./budgetOrder";
import { buildQuote, systemSheets } from "./quantities";
import { emptyProject, type Item } from "./types";

const item = (id: string, name: string, group: string, over: Partial<Item> = {}): Item => ({
  id,
  name,
  kind: "count",
  color: "#000",
  group,
  materialPrice: 0,
  laborPrice: 0,
  wastePct: 0,
  ...over,
});

describe("budget order", () => {
  it("tiers groups: equipment, then networks and lines, then air terminals and pieces", () => {
    expect(groupTier("Equipamentos")).toBe(0);
    expect(groupTier("Ventiladores")).toBe(0);
    expect(groupTier("Rede de Dutos")).toBe(1);
    expect(groupTier("Tubulações")).toBe(1);
    expect(groupTier("Elétrica")).toBe(1);
    expect(groupTier("Isolamento")).toBe(1);
    expect(groupTier("Suportes")).toBe(1);
    expect(groupTier("Bocas de Ar")).toBe(2);
    expect(groupTier("Grelhas")).toBe(2);
    expect(groupTier("Geral")).toBe(2);
    expect(groupTier("")).toBe(2);
  });

  it("compares names the way people read sizes", () => {
    const names = ["Grelha 1000x1000", "Grelha 300x300", "grelha 400x400", "Difusor"];
    expect(names.sort(compareNames)).toEqual([
      "Difusor",
      "Grelha 300x300",
      "grelha 400x400",
      "Grelha 1000x1000",
    ]);
  });

  it("gives the same order every time: tier, group, name", () => {
    const items = [
      item("a", "Grelha 400x400", "Bocas de Ar"),
      item("b", "Duto 500x300", "Rede de Dutos"),
      item("c", "Split 9.000 BTU/h", "Equipamentos"),
      item("d", "Cabo PP 3x2,5", "Elétrica"),
      item("e", "Difusor 600x600", "Bocas de Ar"),
      item("f", "Exaustor", "Equipamentos"),
    ];
    const once = sortItemsForBudget(items).map((i) => i.id);
    expect(once).toEqual(["f", "c", "d", "b", "e", "a"]);
    expect(sortItemsForBudget([...items].reverse()).map((i) => i.id)).toEqual(once);
  });

  it("nudges an item within its group and keeps the nudge explicit", () => {
    const items = [
      item("a", "Difusor", "Bocas de Ar"),
      item("b", "Grelha", "Bocas de Ar"),
      item("c", "Veneziana", "Bocas de Ar"),
      item("d", "Duto", "Rede de Dutos"),
    ];
    const moved = moveItemInBudget(items, "c", -1);
    expect(sortItemsForBudget(moved).map((i) => i.id)).toEqual(["d", "a", "c", "b"]);
    expect(moved.find((i) => i.id === "c")?.order).toBe(1);
    expect(moved.find((i) => i.id === "d")?.order).toBeUndefined();
    // the nudge survives a rename that would otherwise re-sort it
    const renamed = moved.map((i) => (i.id === "c" ? { ...i, name: "Zzz" } : i));
    expect(sortItemsForBudget(renamed).map((i) => i.id)).toEqual(["d", "a", "c", "b"]);
    // the top of the first group and the bottom of the last are no-ops
    expect(moveItemInBudget(items, "d", -1).map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
    expect(moveItemInBudget(items, "c", 1).find((i) => i.id === "c")?.order).toBeUndefined();
  });

  it("carries an item into the neighbouring group at the edge of its own", () => {
    const items = [
      item("a", "Difusor", "Bocas de Ar"),
      item("b", "Grelha", "Bocas de Ar"),
      item("d", "Duto", "Rede de Dutos"),
      item("e", "Split", "Equipamentos", { system: "Outra" }),
    ];
    // down from the last duct: first of the air terminals
    const down = moveItemInBudget(items, "d", 1);
    expect(down.find((i) => i.id === "d")?.group).toBe("Bocas de Ar");
    expect(sortItemsForBudget(down).map((i) => i.id)).toEqual(["e", "d", "a", "b"]);
    // up from the first air terminal: last of the ducts
    const up = moveItemInBudget(items, "a", -1);
    expect(up.find((i) => i.id === "a")?.group).toBe("Rede de Dutos");
    expect(sortItemsForBudget(up).map((i) => i.id)).toEqual(["e", "d", "a", "b"]);
    // never into a group of another discipline
    expect(moveItemInBudget(items, "e", 1)).toEqual(items);
  });

  it("treats spellings of one group name as one section", () => {
    const items = [
      item("a", "Grelha", "Bocas de Ar"),
      item("b", "Difusor", "bocas de ar"),
      item("c", "Veneziana", "Bocas de Ar "),
      item("d", "Duto", "Rede de Dutos"),
    ];
    expect(budgetGroups(items)).toEqual(["Rede de Dutos", "Bocas de Ar"]);
    const project = { ...emptyProject(), items, sectionsBy: "grupo" as const };
    expect(
      systemSheets(project)[0].sections.map((s) => [s.name, s.rows.map((r) => r.item.id)]),
    ).toEqual([
      ["Rede de Dutos", ["d"]],
      ["Bocas de Ar", ["b", "a", "c"]],
    ]);
    expect(canonicalGroup(items, " bocas DE ar ")).toBe("Bocas de Ar");
    expect(canonicalGroup(items, "Tubulações")).toBe("Tubulações");
    expect(canonicalGroup(items, "  ")).toBe("");
  });

  it("lets the user reorder the groups, new groups going after the ordered ones", () => {
    const items = [
      item("a", "Grelha", "Bocas de Ar"),
      item("b", "Duto", "Rede de Dutos"),
      item("c", "Split", "Equipamentos"),
    ];
    expect(moveGroupInBudget(items, undefined, "Equipamentos", -1)).toBeNull();
    const order = moveGroupInBudget(items, undefined, "Bocas de Ar", -1);
    expect(order).toEqual(["Equipamentos", "Bocas de Ar", "Rede de Dutos"]);
    expect(budgetGroups(items, order ?? undefined)).toEqual([
      "Equipamentos",
      "Bocas de Ar",
      "Rede de Dutos",
    ]);
    const again = moveGroupInBudget(items, order ?? undefined, "bocas de ar", -1);
    expect(again).toEqual(["Bocas de Ar", "Equipamentos", "Rede de Dutos"]);
    const more = [...items, item("d", "Cabo", "Elétrica")];
    expect(budgetGroups(more, again ?? undefined)).toEqual([
      "Bocas de Ar",
      "Equipamentos",
      "Rede de Dutos",
      "Elétrica",
    ]);
    const project = { ...emptyProject(), items: more, sectionsBy: "grupo" as const, groupOrder: again ?? undefined };
    expect(systemSheets(project)[0].sections.map((s) => s.name)).toEqual(budgetGroups(more, again ?? undefined));
    expect(buildQuote(project).groups.map((g) => g.name)).toEqual(budgetGroups(more, again ?? undefined));
  });

  it("orders the budget and the exported sheets the same way", () => {
    const project = {
      ...emptyProject(),
      items: [
        item("a", "Grelha 400x400", "Bocas de Ar"),
        item("b", "Duto 500x300", "Rede de Dutos"),
        item("c", "Split 9.000 BTU/h", "Equipamentos"),
      ],
      sectionsBy: "grupo" as const,
    };
    expect(buildQuote(project).groups.map((g) => g.name)).toEqual([
      "Equipamentos",
      "Rede de Dutos",
      "Bocas de Ar",
    ]);
    expect(systemSheets(project)[0].sections.map((s) => s.name)).toEqual([
      "Equipamentos",
      "Rede de Dutos",
      "Bocas de Ar",
    ]);
  });

  it("orders the sheets by the usual discipline order, unknown ones after", () => {
    const project = {
      ...emptyProject(),
      items: [
        item("a", "Grelha", "Bocas de Ar", { system: "Lavanderia" }),
        item("b", "Split", "Equipamentos", { system: "AC Áreas Comuns" }),
        item("c", "Duto", "Rede de Dutos", { system: "Exaustão" }),
        item("d", "Cabo", "Elétrica", { system: "Cozinha" }),
      ],
    };
    expect(systemSheets(project).map((s) => s.system)).toEqual([
      "Exaustão",
      "AC Áreas Comuns",
      "Cozinha",
      "Lavanderia",
    ]);
  });
});
