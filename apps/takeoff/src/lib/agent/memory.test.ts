import { describe, expect, it } from "vitest";
import {
  addLocalMemory,
  approveLocalMemory,
  emptyMemory,
  memoryFor,
  memoryFromRemote,
  memoryScopes,
  parseMemory,
  removeLocalMemory,
} from "./memory";

const add = (
  memory: ReturnType<typeof emptyMemory>,
  input: Parameters<typeof addLocalMemory>[1],
  proposed = false,
  now = 0,
) => addLocalMemory(memory, input, proposed, now);

describe("memoryFromRemote and parseMemory", () => {
  it("reads the backend's entries (null for an absent field) and drops junk", () => {
    const memory = memoryFromRemote(
      [
        {
          id: "a",
          kind: "nota",
          scope: "",
          text: "ok",
          target: null,
          image: null,
          status: "proposta",
          origin: "agente",
          source: null,
          createdAt: 5,
          createdBy: "Ana",
        },
        { id: "a", kind: "nota", text: "duplicate id" },
        { id: "b", kind: "simbolo", text: "sem imagem", image: null },
        { id: "c", kind: "simbolo", text: "cassete", image: "iVBOR", target: "Cassete 4 vias" },
        { id: "d", kind: "outra", text: "kind desconhecido" },
        { id: "e", kind: "nota", text: "" },
        "lixo",
      ],
      99,
    );
    expect(memory.fetchedAt).toBe(99);
    expect(memory.entries.map((e) => e.id)).toEqual(["a", "c"]);
    expect(memory.entries[0]).toEqual({
      id: "a",
      kind: "nota",
      scope: "",
      text: "ok",
      status: "proposta",
      origin: "agente",
      createdAt: 5,
      createdBy: "Ana",
    });
    expect(memory.entries[1]).toMatchObject({ status: "ativa", origin: "usuario" });
  });

  it("reads the cache file back, and anything else as empty", () => {
    const cached = memoryFromRemote([{ id: "a", kind: "nota", text: "ok" }], 7);
    expect(parseMemory(JSON.parse(JSON.stringify(cached)))).toEqual(cached);
    expect(parseMemory(null)).toEqual(emptyMemory());
    expect(parseMemory({ entries: "no" }).entries).toEqual([]);
    // a cache written before the memory was shared has no fetch time
    expect(parseMemory({ version: 1, entries: [] }).fetchedAt).toBeNull();
  });
});

describe("memoryFor", () => {
  it("returns general entries plus those of the takeoff's scopes, specific first", () => {
    let memory = emptyMemory();
    memory = add(memory, { kind: "nota", text: "geral" }, false, 1).memory;
    memory = add(memory, { kind: "nota", text: "da tegra", scope: "Tegra" }, false, 2).memory;
    memory = add(memory, { kind: "nota", text: "de outro", scope: "Outro" }, false, 3).memory;
    memory = add(memory, { kind: "termo", text: "VE", target: "Exaustor" }, false, 4).memory;
    expect(memoryFor(memory, ["tegra"]).map((e) => e.text)).toEqual(["da tegra", "geral", "VE"]);
    expect(memoryFor(memory, []).map((e) => e.text)).toEqual(["geral", "VE"]);
  });

  it("leaves proposals out until they are approved", () => {
    const { memory, result } = add(
      emptyMemory(),
      { kind: "nota", text: "tracejado é retorno" },
      true,
    );
    expect(result).toMatchObject({ status: "proposta", added: true });
    expect(memoryFor(memory, [])).toEqual([]);
    expect(memoryFor(approveLocalMemory(memory, result.id), []).map((e) => e.id)).toEqual([
      result.id,
    ]);
  });
});

describe("memory kept on this machine (browser dev mode)", () => {
  it("adds, trims and marks who it came from", () => {
    const { memory } = add(
      emptyMemory(),
      { kind: "nota", text: "  dreno fora ", scope: " Tegra " },
      false,
      10,
    );
    expect(memory.entries[0]).toMatchObject({
      kind: "nota",
      text: "dreno fora",
      scope: "Tegra",
      status: "ativa",
      origin: "usuario",
      createdAt: 10,
    });
  });

  it("does not duplicate a lesson, and a person adding a proposed one approves it", () => {
    const first = add(emptyMemory(), { kind: "termo", text: "VE-01", target: "Exaustor" }, true);
    const again = add(first.memory, { kind: "termo", text: "ve-01", target: "exaustor" }, true);
    expect(again.result).toEqual({ id: first.result.id, status: "proposta", added: false });
    expect(again.memory).toBe(first.memory);
    const person = add(first.memory, { kind: "termo", text: "VE-01", target: "Exaustor" });
    expect(person.result).toEqual({ id: first.result.id, status: "ativa", added: false });
    expect(person.memory.entries).toHaveLength(1);
  });

  it("refuses what teaches nothing and removes by id", () => {
    expect(() => add(emptyMemory(), { kind: "termo", text: "VE-01" })).toThrow(/item/);
    const { memory, result } = add(emptyMemory(), { kind: "nota", text: "a" });
    expect(removeLocalMemory(memory, result.id).entries).toEqual([]);
    expect(removeLocalMemory(memory, "nope")).toBe(memory);
  });
});

describe("memoryScopes", () => {
  it("lists the scopes in use once, sorted", () => {
    let memory = emptyMemory();
    for (const [text, scope] of [
      ["a", "Tegra"],
      ["b", "Even"],
      ["c", "Tegra"],
      ["d", ""],
    ]) {
      memory = add(memory, { kind: "nota", text, scope }).memory;
    }
    expect(memoryScopes(memory)).toEqual(["Even", "Tegra"]);
  });
});
