import { describe, expect, it } from "vitest";
import {
  agentMemoryKey,
  agentMemoryProblem,
  cleanAgentMemoryInput,
  foldMemoryText,
  MAX_MEMORY_IMAGE,
  MAX_MEMORY_TEXT,
} from "../src/takeoff/agentMemory";

describe("agentMemoryProblem", () => {
  it("accepts a note, a term with its item and a symbol with its crop", () => {
    expect(agentMemoryProblem({ kind: "nota", text: "o dreno não é escopo" })).toBeNull();
    expect(agentMemoryProblem({ kind: "termo", text: "VE-01", target: "Exaustor" })).toBeNull();
    expect(agentMemoryProblem({ kind: "simbolo", text: "Cassete", image: "iVBORw0KGgo=" })).toBeNull();
  });

  it("says what is missing or too large", () => {
    expect(agentMemoryProblem({ kind: "nota", text: "   " })).toMatch(/vazio/);
    expect(agentMemoryProblem({ kind: "nota", text: "x".repeat(MAX_MEMORY_TEXT + 1) })).toMatch(
      /caracteres/,
    );
    expect(agentMemoryProblem({ kind: "termo", text: "VE-01" })).toMatch(/item/);
    expect(agentMemoryProblem({ kind: "simbolo", text: "Cassete" })).toMatch(/recorte/);
    expect(
      agentMemoryProblem({ kind: "simbolo", text: "Cassete", image: "A".repeat(MAX_MEMORY_IMAGE + 4) }),
    ).toMatch(/grande/);
    expect(agentMemoryProblem({ kind: "simbolo", text: "Cassete", image: "<svg/>" })).toMatch(
      /imagem válida/,
    );
    expect(agentMemoryProblem({ kind: "nota", text: "ok", image: "AAAA" })).toMatch(/símbolo/);
    expect(agentMemoryProblem({ kind: "nota", text: "ok", scope: "x".repeat(200) })).toMatch(
      /cliente ou projetista/,
    );
  });
});

describe("agentMemoryKey", () => {
  it("is the same for the same lesson whatever the case, accents and spaces", () => {
    const a = agentMemoryKey({ kind: "termo", text: " VE-01 ", target: "Exaustão", scope: "Tegra" });
    const b = agentMemoryKey({ kind: "termo", text: "ve-01", target: "exaustao ", scope: "tegra" });
    expect(a).toBe(b);
    expect(agentMemoryKey({ kind: "termo", text: "ve-01", target: "exaustao" })).not.toBe(a);
    expect(agentMemoryKey({ kind: "nota", text: "ve-01" })).not.toBe(a);
  });

  it("gives symbols no key: two crops are two examples", () => {
    expect(agentMemoryKey({ kind: "simbolo", text: "Cassete", image: "AAAA" })).toBeNull();
  });
});

describe("cleanAgentMemoryInput", () => {
  it("trims and drops what the kind does not carry", () => {
    expect(
      cleanAgentMemoryInput({
        kind: "nota",
        text: "  dreno fora  ",
        scope: " Tegra ",
        target: "ignorado",
        source: " Obra A ",
      }),
    ).toEqual({ kind: "nota", text: "dreno fora", scope: "Tegra", source: "Obra A" });
    expect(cleanAgentMemoryInput({ kind: "termo", text: "VE", target: " Exaustor " })).toEqual({
      kind: "termo",
      text: "VE",
      scope: "",
      target: "Exaustor",
    });
  });
});

describe("foldMemoryText", () => {
  it("ignores accents, case and surrounding spaces", () => {
    expect(foldMemoryText("  Insuflação ")).toBe("insuflacao");
  });
});
