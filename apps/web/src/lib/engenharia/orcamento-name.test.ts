import { describe, expect, test } from "vitest";

import { parseOrcamentoName, stageLabel } from "./orcamento-name";

describe("parseOrcamentoName", () => {
  test("número, cliente e obra", () => {
    expect(parseOrcamentoName("26.37108PRC - Tegra Incorporadora - Obra ARVO")).toEqual({
      code: "26.37108PRC",
      title: "Tegra Incorporadora",
      subtitle: "Obra ARVO",
    });
  });

  test("obra com hífen no nome continua inteira", () => {
    expect(parseOrcamentoName("26.37433PRC - STOG - Obra Moema Jazz - Detecção")).toEqual({
      code: "26.37433PRC",
      title: "STOG",
      subtitle: "Obra Moema Jazz - Detecção",
    });
  });

  test("pasta nova, ainda sem número", () => {
    expect(parseOrcamentoName("Rocontec - Bailarinas")).toEqual({
      code: null,
      title: "Rocontec",
      subtitle: "Bailarinas",
    });
  });

  test("nome fora do padrão vira só o título", () => {
    expect(parseOrcamentoName("Observatório")).toEqual({
      code: null,
      title: "Observatório",
      subtitle: null,
    });
  });
});

test("stageLabel tira o parêntese explicativo", () => {
  expect(stageLabel("Obsoletos (Mais de 60 dias após recebimento)")).toBe("Obsoletos");
  expect(stageLabel("Concluído")).toBe("Concluído");
});
