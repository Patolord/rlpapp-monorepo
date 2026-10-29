import { normalizeDiscipline } from "./catalog";
import type { DisciplineSettings, FooterLine, Project } from "./types";

/** BDI, extras and footer of one discipline tab, with the project's defaults filled in. */
export interface ResolvedDiscipline {
  bdi: number;
  extrasPct: number;
  footer: FooterLine[];
}

/**
 * The stats block RLP's sheets usually carry under TOTAL GERAL of a discipline: a point count
 * and a value per point for most, plus equipment / installation factors for the AC tabs.
 */
export function defaultFooter(discipline: string): FooterLine[] {
  const points: FooterLine = { kind: "points", label: "Número de pontos", value: 0 };
  const perPoint: FooterLine = { kind: "perPoint", label: "Valor por ponto" };
  switch (normalizeDiscipline(discipline)) {
    case "Infra AC":
      return [
        { kind: "stat", label: "Metragem média", value: 0 },
        points,
        perPoint,
        { kind: "factor", label: "Equipamentos", base: "material", factor: 1.1 },
        { kind: "factor", label: "Instalação", base: "labor", factor: 2 },
      ];
    case "AC Áreas Comuns":
      return [
        { ...points, label: "Total de pontos" },
        perPoint,
        { kind: "factor", label: "Equipamentos", base: "material", factor: 1 },
        { kind: "factor", label: "Instalação", base: "labor", factor: 2.6 },
      ];
    default:
      return [points, perPoint];
  }
}

/** Settings of a discipline tab: its own values where set, the project's defaults elsewhere. */
export function resolveDiscipline(project: Project, discipline: string): ResolvedDiscipline {
  const own: DisciplineSettings = project.disciplines[discipline] ?? {};
  return {
    bdi: own.bdi ?? project.bdi,
    extrasPct: own.extrasPct ?? project.extrasPct,
    footer: defaultFooter(discipline),
  };
}
