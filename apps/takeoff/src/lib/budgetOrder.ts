import { foldName } from "./text";
import { DEFAULT_GROUP, DISCIPLINE_SUGGESTIONS, type Item } from "./types";

/**
 * Where a group of items sits in the budget, the way RLP proposals read: equipment first, then
 * the networks and lines that connect it (ducts, pipes, cables, insulation, supports), and at
 * the bottom the air terminals and the rest of the small pieces. Inside a tier groups are
 * alphabetical, and inside a group items are alphabetical unless the user nudged them. That is
 * only the default: the user can reorder the groups (Project.groupOrder) and the items (Item.order).
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

/** Manual order first (groups not in it go after, in default order), then tier, then name. */
export function compareGroups(a: string, b: string, groupOrder?: readonly string[]): number {
  if (groupOrder?.length) {
    const ka = groupKey(a);
    const kb = groupKey(b);
    if (ka === kb) return 0;
    const ia = groupOrder.findIndex((g) => groupKey(g) === ka);
    const ib = groupOrder.findIndex((g) => groupKey(g) === kb);
    if (ia >= 0 || ib >= 0) {
      if (ia < 0) return 1;
      if (ib < 0) return -1;
      return ia - ib;
    }
  }
  return groupTier(a) - groupTier(b) || compareNames(a, b);
}

/** Group, manual position, name, id: the same order every time the budget is opened. */
export function compareItemsForBudget(a: Item, b: Item, groupOrder?: readonly string[]): number {
  return (
    compareGroups(groupOf(a), groupOf(b), groupOrder) ||
    (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) ||
    compareNames(a.name, b.name) ||
    a.id.localeCompare(b.id)
  );
}

export const sortItemsForBudget = (items: readonly Item[], groupOrder?: readonly string[]): Item[] =>
  [...items].sort((a, b) => compareItemsForBudget(a, b, groupOrder));

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
export function budgetGroups(items: readonly Item[], groupOrder?: readonly string[]): string[] {
  const labels = groupLabels(items);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of sortItemsForBudget(items, groupOrder)) {
    const key = groupKey(item.group);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(labels.get(key) ?? groupOf(item));
  }
  return out;
}

const sameSystem = (a: Item, b: Item) => (a.system ?? "") === (b.system ?? "");

/** Items that share a budget section with `item`: same discipline and same group. */
const siblingsOf = (items: readonly Item[], item: Item, groupOrder?: readonly string[]): Item[] =>
  sortItemsForBudget(
    items.filter((i) => groupKey(i.group) === groupKey(item.group) && sameSystem(i, item)),
    groupOrder,
  );

/** Give every item of `siblings` an explicit `order` equal to its index. */
const withPositions = (items: readonly Item[], siblings: readonly Item[]): Item[] => {
  const position = new Map(siblings.map((i, index) => [i.id, index]));
  return items.map((i) => {
    const p = position.get(i.id);
    return p === undefined || i.order === p ? i : { ...i, order: p };
  });
};

/**
 * Move an item one place up (-1) or down (+1) in the budget. Inside its group the group's order
 * becomes explicit (`order` = position) so the nudge sticks through renames and reloads. At the
 * edge of the group the item crosses into the neighbouring group of the same discipline (last
 * place of the previous one, first place of the next one). Returns the same array when there is
 * nowhere to go.
 */
export function moveItemInBudget(
  items: readonly Item[],
  id: string,
  dir: -1 | 1,
  groupOrder?: readonly string[],
): Item[] {
  const item = items.find((i) => i.id === id);
  if (!item) return [...items];
  const siblings = siblingsOf(items, item, groupOrder);
  const from = siblings.findIndex((i) => i.id === id);
  const to = from + dir;
  if (to >= 0 && to < siblings.length) {
    const reordered = [...siblings];
    [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
    return withPositions(items, reordered);
  }
  // crossing into the neighbouring group of the same discipline
  const groups = budgetGroups(
    items.filter((i) => sameSystem(i, item)),
    groupOrder,
  );
  const gi = groups.findIndex((g) => groupKey(g) === groupKey(item.group));
  const target = groups[gi + dir];
  if (target === undefined) return [...items];
  const moved = { ...item, group: target };
  const others = siblingsOf(items, moved, groupOrder).filter((i) => i.id !== id);
  const reordered = dir > 0 ? [moved, ...others] : [...others, moved];
  return withPositions(
    items.map((i) => (i.id === id ? moved : i)),
    reordered,
  );
}

/**
 * Move a group one place up (-1) or down (+1) in the budget. The current order of every group
 * becomes explicit and is returned as the new Project.groupOrder; null when the group is already
 * at the edge.
 */
export function moveGroupInBudget(
  items: readonly Item[],
  groupOrder: readonly string[] | undefined,
  group: string,
  dir: -1 | 1,
): string[] | null {
  const groups = budgetGroups(items, groupOrder);
  const from = groups.findIndex((g) => groupKey(g) === groupKey(group));
  const to = from + dir;
  if (from < 0 || to < 0 || to >= groups.length) return null;
  [groups[from], groups[to]] = [groups[to], groups[from]];
  return groups;
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
