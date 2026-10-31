/**
 * What a cutout report includes: a filter over items by discipline (the budget tab), category
 * (the item group) and specific items. Axes combine with AND; an empty or missing axis does not
 * restrict. Duct runs and VRF runs are measurements of the derived "Rede de dutos" / "Sistema
 * VRF" items, which carry `DUCT_GROUP` / `VRF_GROUP`, so choosing the category brings their
 * runs with it. Pure: the same filter can drive the viewer later.
 */
import { compareGroups, compareSystems, groupKey, groupLabels } from "../budgetOrder";
import { DUCT_GROUP } from "../ductItems";
import { sheetKey } from "../quantities";
import type { Item, Project } from "../types";
import { VRF_GROUP } from "../vrfItems";

export interface ReportFilter {
  /** Disciplines (budget tabs, `item.system || project.system`); empty = every one. */
  systems?: string[];
  /** Categories (`item.group`, compared ignoring case and accents); empty = every one. */
  groups?: string[];
  /** Specific items; empty = every item the other axes let through. */
  itemIds?: string[];
}

/** The discipline an item is budgeted under: its own system, else the project's (a tab name). */
export const itemDiscipline = (project: Project, item: Item): string => sheetKey(project, item);

const restricts = (axis: readonly string[] | undefined): axis is string[] =>
  axis !== undefined && axis.length > 0;

/** True when the item passes every axis of the filter. */
export function matches(project: Project, item: Item, filter: ReportFilter): boolean {
  if (restricts(filter.itemIds) && !filter.itemIds.includes(item.id)) return false;
  if (restricts(filter.groups)) {
    const key = groupKey(item.group);
    if (!filter.groups.some((g) => groupKey(g) === key)) return false;
  }
  if (restricts(filter.systems)) {
    const d = itemDiscipline(project, item).trim();
    if (!filter.systems.some((s) => s.trim() === d)) return false;
  }
  return true;
}

/** Ids of the items the filter lets through, in project order. */
export const matchingItemIds = (project: Project, filter: ReportFilter): Set<string> =>
  new Set(project.items.filter((i) => matches(project, i, filter)).map((i) => i.id));

/** True when no axis restricts (everything is included). */
export const isEmptyFilter = (filter: ReportFilter): boolean =>
  !restricts(filter.systems) && !restricts(filter.groups) && !restricts(filter.itemIds);

/** Preset "Só dutos": the duct category, which includes every duct network and its runs. */
export const soDutos: ReportFilter = { groups: [DUCT_GROUP] };

/** Preset "Só VRF": the VRF category, every VRF system and its refrigerant runs. */
export const soVrf: ReportFilter = { groups: [VRF_GROUP] };

/** Preset "Tudo da disciplina atual": every item of one budget tab. */
export const disciplinaAtual = (system: string): ReportFilter => ({ systems: [system] });

export interface ReportPreset {
  id: "dutos" | "vrf" | "disciplina";
  /** Button label, Portuguese. */
  label: string;
  filter: ReportFilter;
}

/** The preset row of the dialog; presets only set the filter axes. */
export const reportPresets = (currentSystem: string): ReportPreset[] => [
  { id: "dutos", label: "Só dutos", filter: soDutos },
  { id: "vrf", label: "Só VRF", filter: soVrf },
  { id: "disciplina", label: "Tudo da disciplina atual", filter: disciplinaAtual(currentSystem) },
];

export interface FilterOptions {
  /** Disciplines with at least one item, in tab order. */
  systems: string[];
  /** Categories with at least one item, in budget order, under their usual spelling. */
  groups: string[];
}

/** The choices the dialog offers on each axis. */
export function filterOptions(project: Project): FilterOptions {
  const systems = new Set(project.items.map((i) => itemDiscipline(project, i)));
  const labels = groupLabels(project.items);
  return {
    systems: [...systems].sort(compareSystems),
    groups: [...new Set(project.items.map((i) => groupKey(i.group)))]
      .map((k) => labels.get(k) ?? k)
      .sort(compareGroups),
  };
}

/** "Disciplina: Exaustão · Categoria: Rede de Dutos" for the report header; "" = everything. */
export function describeFilter(project: Project, filter: ReportFilter): string {
  const parts: string[] = [];
  if (restricts(filter.systems)) {
    parts.push(
      `${filter.systems.length > 1 ? "Disciplinas" : "Disciplina"}: ${filter.systems.join(", ")}`,
    );
  }
  if (restricts(filter.groups)) {
    parts.push(
      `${filter.groups.length > 1 ? "Categorias" : "Categoria"}: ${filter.groups.join(", ")}`,
    );
  }
  if (restricts(filter.itemIds)) {
    const names = project.items.filter((i) => filter.itemIds?.includes(i.id)).map((i) => i.name);
    parts.push(`${names.length > 1 ? "Itens" : "Item"}: ${names.join(", ")}`);
  }
  return parts.join(" · ");
}
