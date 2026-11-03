import { foldName } from "./text";
import { DEFAULT_GROUP, DISCIPLINE_SUGGESTIONS, type Item } from "./types";

/**
 * Where a group of items sits in the budget, the way RLP proposals read: equipment first, then
 * the networks and lines that connect it (ducts, pipes, cables, insulation, supports), and at
 * the bottom the air terminals and the rest of the small pieces. Inside a tier groups are
 * alphabetical, and inside a group items are alphabetical unless the user nudged them.
 */
export type GroupTier = 0 | 1 | 2;

const EQUIPMENT = /equip|ventilad|exaustor|split|vrf|condensad|evaporad|fan ?coil|bomba|chiller/;
const NETWORKS =
  /duto|tubul|tubo|eletric|cabo|isolament|suporte|acessor|\brede\b|linha|infra|drenag|eletrocalha|conduit|frigor|fixa/;

export function groupTier(group: string): GroupTier {
  const g = foldName(group || DEFAULT_GROUP);
  if (EQUIPMENT.test(g)) return 0;
  if (NETWORKS.test(g)) return 1;
  return 2;
}

/** pt-BR, numeric-aware ("Grelha 300x300" before "Grelha 1000x1000"). */
export const compareNames = (a: string, b: string): number =>
  a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });

export const groupOf = (item: Item): string => item.group.trim() || DEFAULT_GROUP;

/** Identity of a group: "Bocas de Ar", "bocas de ar" and "Bocas de Ar " are one section. */
export const groupKey = (group: string): string => foldName(group.trim() || DEFAULT_GROUP);

/** The spelling already in use for a typed group name, so a retyped group joins its section. */
export function canonicalGroup(items: readonly Item[], typed: string): string {
  const name = typed.trim();
  if (!name) return name;
  const key = groupKey(name);
  return items.find((i) => groupKey(i.group) === key)?.group.trim() ?? name;
}

/** Tier, then name; spellings of one group compare equal. */
export const compareGroups = (a: string, b: string): number =>
  groupTier(a) - groupTier(b) || compareNames(groupKey(a), groupKey(b));

/** Tier, group, manual position, name, id: the same order every time the budget is opened. */
export function compareItemsForBudget(a: Item, b: Item): number {
  return (
    compareGroups(groupOf(a), groupOf(b)) ||
    (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) ||
    compareNames(a.name, b.name) ||
    a.id.localeCompare(b.id)
  );
}

export const sortItemsForBudget = (items: readonly Item[]): Item[] =>
  [...items].sort(compareItemsForBudget);

/** Group key → the spelling most of its items use (ties: the earliest item's). */
export function groupLabels(items: readonly Item[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const item of items) {
    const g = groupOf(item);
    const spellings = counts.get(groupKey(g)) ?? new Map<string, number>();
    spellings.set(g, (spellings.get(g) ?? 0) + 1);
    counts.set(groupKey(g), spellings);
  }
  const labels = new Map<string, string>();
  for (const [key, spellings] of counts) {
    let best: [string, number] | undefined;
    for (const entry of spellings) if (!best || entry[1] > best[1]) best = entry;
    if (best) labels.set(key, best[0]);
  }
  return labels;
}

/** The groups of these items in budget order, under their usual spelling. */
export function budgetGroups(items: readonly Item[]): string[] {
  const labels = groupLabels(items);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of sortItemsForBudget(items)) {
    const key = groupKey(item.group);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(labels.get(key) ?? groupOf(item));
  }
  return out;
}

/** Items that share a budget section with `item`: same discipline and same group. */
const siblingsOf = (items: readonly Item[], item: Item): Item[] =>
  sortItemsForBudget(
    items.filter(
      (i) => groupKey(i.group) === groupKey(item.group) && (i.system ?? "") === (item.system ?? ""),
    ),
  );

/**
 * Move an item one place up (-1) or down (+1) inside its group. The current order of the group
 * becomes explicit (`order` = position) so the nudge sticks through renames and reloads.
 * Returns the same array when the item is already at the edge.
 */
export function moveItemInBudget(items: readonly Item[], id: string, dir: -1 | 1): Item[] {
  const item = items.find((i) => i.id === id);
  if (!item) return [...items];
  const siblings = siblingsOf(items, item);
  const from = siblings.findIndex((i) => i.id === id);
  const to = from + dir;
  if (to < 0 || to >= siblings.length) return [...items];
  const reordered = [...siblings];
  [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
  const position = new Map(reordered.map((i, index) => [i.id, index]));
  return items.map((i) => {
    const p = position.get(i.id);
    return p === undefined || i.order === p ? i : { ...i, order: p };
  });
}

/** Sheets in the order RLP proposals usually carry the disciplines; unknown names after, A–Z. */
export function compareSystems(a: string, b: string): number {
  const ia = DISCIPLINE_SUGGESTIONS.indexOf(a);
  const ib = DISCIPLINE_SUGGESTIONS.indexOf(b);
  if (ia >= 0 || ib >= 0) {
    if (ia < 0) return 1;
    if (ib < 0) return -1;
    return ia - ib;
  }
  return compareNames(a, b);
}
