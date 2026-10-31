import { describe, expect, it } from "vitest";
import { guessSymbol, SYMBOLS, symbolDef } from "./symbols";

describe("symbols", () => {
  it("guesses a symbol from Portuguese item names", () => {
    expect(guessSymbol("Ventilador centrífugo CLD-250")).toBe("fan");
    expect(guessSymbol("Exaustor SICFLUX GFR 230")).toBe("exhaust");
    expect(guessSymbol("Detector de fumaça óptico")).toBe("smoke");
    expect(guessSymbol("Split Cassete 04 Vias 36.000 Btu/h")).toBe("evap");
    expect(guessSymbol("Unidade Condensadora VRF 10 HP")).toBe("cond");
    expect(guessSymbol("Difusor quadrado 4 vias 600x600")).toBe("diffuser");
    expect(guessSymbol("Grelha de Insuflamento 400x400")).toBe("grille");
    expect(guessSymbol("Veneziana p/ Tomada de ar 200x200")).toBe("louver");
    expect(guessSymbol("Damper corta-fogo 500x300")).toBe("damper");
    expect(guessSymbol("Quadro Elétrico (01 Ventilador)")).toBe("panel");
    expect(guessSymbol("Termostato ambiente")).toBe("thermostat");
    expect(guessSymbol("Contagem 1")).toBe("dot");
  });

  it("falls back to the dot for unknown ids and keeps ids unique", () => {
    expect(symbolDef("nope").id).toBe("dot");
    expect(symbolDef(undefined).id).toBe("dot");
    expect(new Set(SYMBOLS.map((s) => s.id)).size).toBe(SYMBOLS.length);
    expect(SYMBOLS.every((s) => s.paths.length > 0)).toBe(true);
  });
});
