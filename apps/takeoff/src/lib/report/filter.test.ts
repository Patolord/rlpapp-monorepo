import { describe, expect, it } from "vitest";
import { DUCT_GROUP, newDuctNetwork } from "../ductItems";
import { emptyProject, type Item, type Project } from "../types";
import { newVrfSystem, VRF_GROUP } from "../vrfItems";
import {
  describeFilter,
  disciplinaAtual,
  filterOptions,
  isEmptyFilter,
  itemDiscipline,
  matches,
  matchingItemIds,
  reportPresets,
  soDutos,
  soVrf,
} from "./filter";

const item = (id: string, group: string, system?: string, extra: Partial<Item> = {}): Item => ({
  id,
  name: id,
  kind: "count",
  color: "#fff",
  group,
  materialPrice: 0,
  laborPrice: 0,
  wastePct: 0,
  system,
  ...extra,
});

function project(): Project {
  const p = emptyProject();
  p.system = "Pressurização de Escadas";
  p.items = [
    item("grelha", "Bocas de Ar", "Exaustão"),
    item("duto", "Rede de Dutos", "Exaustão", { kind: "linear" }),
    item("piso", "Isolamento"), // the project's discipline
  ];
  p.items.push({ ...newDuctNetwork(p, undefined, "Exaustão"), id: "rede" });
  p.items.push({ ...newVrfSystem(p, "daikin", { system: "Infra AC" }), id: "vrf" });
  p.measurements = [
    { id: "run1", itemId: "rede", drawingId: "d", page: 0, points: [] },
    { id: "tube1", itemId: "vrf", drawingId: "d", page: 0, points: [] },
  ];
  return p;
}

const ids = (p: Project, f: Parameters<typeof matchingItemIds>[1]) => [...matchingItemIds(p, f)];

describe("report filter", () => {
  it("lets everything through when no axis restricts", () => {
    const p = project();
    expect(isEmptyFilter({})).toBe(true);
    expect(isEmptyFilter({ systems: [], groups: [], itemIds: [] })).toBe(true);
    expect(ids(p, {})).toEqual(["grelha", "duto", "piso", "rede", "vrf"]);
    expect(ids(p, { systems: [], groups: [] })).toHaveLength(5);
  });

  it("filters by discipline, falling back to the project's", () => {
    const p = project();
    expect(itemDiscipline(p, p.items[2])).toBe("Pressurização de Escadas");
    expect(ids(p, { systems: ["Exaustão"] })).toEqual(["grelha", "duto", "rede"]);
    expect(ids(p, { systems: ["Pressurização de Escadas"] })).toEqual(["piso"]);
    expect(ids(p, { systems: ["Exaustão", "Infra AC"] })).toEqual([
      "grelha",
      "duto",
      "rede",
      "vrf",
    ]);
  });

  it("filters by category ignoring case and accents", () => {
    const p = project();
    expect(ids(p, { groups: ["bocas de ar"] })).toEqual(["grelha"]);
    expect(ids(p, { groups: [" ISOLAMENTO "] })).toEqual(["piso"]);
  });

  it("combines axes with AND", () => {
    const p = project();
    expect(ids(p, { systems: ["Exaustão"], groups: ["Rede de Dutos"] })).toEqual(["duto", "rede"]);
    expect(ids(p, { groups: ["Rede de Dutos"], itemIds: ["duto", "grelha"] })).toEqual(["duto"]);
    expect(ids(p, { systems: ["Infra AC"], itemIds: ["grelha"] })).toEqual([]);
  });

  it("the duct category pulls in every network and so its runs, with no special case", () => {
    const p = project();
    const rede = p.items.find((i) => i.id === "rede")!;
    expect(rede.group).toBe(DUCT_GROUP);
    expect(rede.derived).toBe("duct");
    const selected = matchingItemIds(p, soDutos);
    expect([...selected]).toEqual(["duto", "rede"]);
    const runs = p.measurements.filter((m) => selected.has(m.itemId)).map((m) => m.id);
    expect(runs).toEqual(["run1"]);
  });

  it("the VRF category pulls in every system and its refrigerant runs", () => {
    const p = project();
    expect(p.items.find((i) => i.id === "vrf")?.group).toBe(VRF_GROUP);
    const selected = matchingItemIds(p, soVrf);
    expect([...selected]).toEqual(["vrf"]);
    expect(p.measurements.filter((m) => selected.has(m.itemId)).map((m) => m.id)).toEqual([
      "tube1",
    ]);
  });

  it("the discipline preset takes every item of one tab", () => {
    const p = project();
    expect(ids(p, disciplinaAtual("Exaustão"))).toEqual(["grelha", "duto", "rede"]);
    expect(matches(p, p.items[0], disciplinaAtual("Infra AC"))).toBe(false);
    expect(reportPresets("Exaustão").map((r) => r.label)).toEqual([
      "Só dutos",
      "Só VRF",
      "Tudo da disciplina atual",
    ]);
    expect(reportPresets("Exaustão")[2].filter).toEqual({ systems: ["Exaustão"] });
  });

  it("lists the choices of each axis and describes the filter in Portuguese", () => {
    const p = project();
    const opts = filterOptions(p);
    expect(opts.systems.sort()).toEqual(["Exaustão", "Infra AC", "Pressurização de Escadas"]);
    expect(opts.groups).toContain("Rede de Dutos");
    expect(opts.groups).toContain("Sistema VRF");
    expect(describeFilter(p, {})).toBe("");
    expect(describeFilter(p, { systems: ["Exaustão"], groups: ["Rede de Dutos"] })).toBe(
      "Disciplina: Exaustão · Categoria: Rede de Dutos",
    );
    expect(describeFilter(p, { groups: ["A", "B"], itemIds: ["grelha"] })).toBe(
      "Categorias: A, B · Item: grelha",
    );
  });
});
