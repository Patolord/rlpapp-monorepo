import { describe, expect, it } from "vitest";
import {
  addMemory,
  approveMemory,
  emptyMemory,
  MAX_MEMORY_TEXT,
  memoryFor,
  memoryProblem,
  memoryScopes,
  parseMemory,
  removeMemory,
} from "./memory";

describe("addMemory", () => {
  it("adds a note and trims its fields", () => {
    const { memory, entry, added } = addMemory(
      emptyMemory(),
      { kind: "nota", text: "  dreno não é escopo ", scope: " Tegra " },
      10,
    );
    expect(added).toBe(true);
    expect(entry).toMatchObject({
      kind: "nota",
      text: "dreno não é escopo",
      scope: "Tegra",
      status: "ativa",
      origin: "usuario",
      createdAt: 10,
    });
    expect(memory.entries).toHaveLength(1);
  });

  it("does not duplicate the same lesson, whatever the case or accents", () => {
    const first = addMemory(emptyMemory(), { kind: "termo", text: "VE-01", target: "Exaustor" });
    const again = addMemory(first.memory, { kind: "termo", text: "ve-01", target: "exaustor" });
    expect(again.added).toBe(false);
    expect(again.entry.id).toBe(first.entry.id);
    expect(again.memory).toBe(first.memory);
  });

  it("keeps the same text under another scope as a separate entry", () => {
    const first = addMemory(emptyMemory(), { kind: "nota", text: "dreno fora" });
    const other = addMemory(first.memory, { kind: "nota", text: "dreno fora", scope: "Tegra" });
    expect(other.added).toBe(true);
    expect(other.memory.entries).toHaveLength(2);
  });

  it("refuses entries that teach nothing", () => {
    expect(() => addMemory(emptyMemory(), { kind: "nota", text: "  " })).toThrow();
    expect(memoryProblem({ kind: "termo", text: "VE-01" })).toMatch(/item/);
    expect(memoryProblem({ kind: "simbolo", text: "cassete" })).toMatch(/recorte/);
    expect(memoryProblem({ kind: "nota", text: "x".repeat(MAX_MEMORY_TEXT + 1) })).toMatch(
      /caracteres/,
    );
  });
});

describe("approveMemory and removeMemory", () => {
  it("turns a proposal into an active entry", () => {
    const { memory, entry } = addMemory(emptyMemory(), {
      kind: "nota",
      text: "linha tracejada é retorno",
      status: "proposta",
      origin: "agente",
    });
    expect(memoryFor(memory, [])).toEqual([]);
    const approved = approveMemory(memory, entry.id);
    expect(memoryFor(approved, []).map((e) => e.id)).toEqual([entry.id]);
    expect(approveMemory(approved, entry.id)).toBe(approved);
  });

  it("removes by id and leaves the memory alone for an unknown id", () => {
    const { memory, entry } = addMemory(emptyMemory(), { kind: "nota", text: "a" });
    expect(removeMemory(memory, entry.id).entries).toEqual([]);
    expect(removeMemory(memory, "nope")).toBe(memory);
  });
});

describe("memoryFor", () => {
  it("returns general entries plus those of the takeoff's scopes, specific first", () => {
    let memory = emptyMemory();
    memory = addMemory(memory, { kind: "nota", text: "geral" }, 1).memory;
    memory = addMemory(memory, { kind: "nota", text: "da tegra", scope: "Tegra" }, 2).memory;
    memory = addMemory(memory, { kind: "nota", text: "de outro", scope: "Outro" }, 3).memory;
    memory = addMemory(memory, { kind: "termo", text: "VE", target: "Exaustor" }, 4).memory;
    expect(memoryFor(memory, ["tegra"]).map((e) => e.text)).toEqual(["da tegra", "geral", "VE"]);
    expect(memoryFor(memory, []).map((e) => e.text)).toEqual(["geral", "VE"]);
  });
});

describe("parseMemory", () => {
  it("keeps well-formed entries and drops junk", () => {
    const parsed = parseMemory({
      version: 1,
      entries: [
        { id: "a", kind: "nota", text: "ok", status: "proposta", origin: "agente", createdAt: 5 },
        { id: "a", kind: "nota", text: "duplicate id" },
        { id: "b", kind: "simbolo", text: "sem imagem" },
        { id: "c", kind: "simbolo", text: "cassete", image: "iVBOR", target: "Cassete 4 vias" },
        { id: "d", kind: "outra", text: "kind desconhecido" },
        { id: "e", kind: "nota", text: "" },
        "lixo",
      ],
    });
    expect(parsed.entries.map((e) => e.id)).toEqual(["a", "c"]);
    expect(parsed.entries[0]).toMatchObject({ status: "proposta", origin: "agente", scope: "" });
    expect(parsed.entries[1]).toMatchObject({ status: "ativa", origin: "usuario" });
  });

  it("reads anything that is not a memory file as empty", () => {
    expect(parseMemory(null).entries).toEqual([]);
    expect(parseMemory("x").entries).toEqual([]);
    expect(parseMemory({ entries: "no" }).entries).toEqual([]);
  });
});

describe("memoryScopes", () => {
  it("lists the scopes in use once, sorted", () => {
    let memory = emptyMemory();
    memory = addMemory(memory, { kind: "nota", text: "a", scope: "Tegra" }).memory;
    memory = addMemory(memory, { kind: "nota", text: "b", scope: "Even" }).memory;
    memory = addMemory(memory, { kind: "nota", text: "c", scope: "Tegra" }).memory;
    memory = addMemory(memory, { kind: "nota", text: "d" }).memory;
    expect(memoryScopes(memory)).toEqual(["Even", "Tegra"]);
  });
});
