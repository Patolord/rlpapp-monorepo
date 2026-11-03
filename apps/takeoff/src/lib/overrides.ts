/**
 * Company defaults with local overrides, the model every catalog setting of the app follows
 * (kit presets, weight table, VRF brand rules): the list the user works with is the company's
 * defaults (published with the catalog by the dashboard's App Takeoff section; the bundled seeds
 * until the company publishes any) with the user's own changes on top. A default edited here
 * keeps the local version, a default removed here stays hidden, an entry created here is
 * appended. Refreshing the catalog replaces the defaults and keeps every override, so a team fix
 * reaches everyone who did not touch that entry.
 */

/** The user's changes to a list, kept with the catalog on this machine. */
export interface Overrides<T> {
  /** Local versions by key: an edited default or an entry that exists only here. */
  overrides: T[];
  /** Keys of defaults the user removed here. */
  removed: string[];
}

export interface OverrideRules<T> {
  /** What pairs a local entry with the company's (a kit id, a folded name). */
  key: (entry: T) => string;
  /** Same entry, ignoring whitespace and the spelling of defaults. */
  same: (a: T, b: T) => boolean;
}

export const noOverrides = <T>(): Overrides<T> => ({ overrides: [], removed: [] });

/** The published defaults when there are any, else the bundled seeds. */
export const defaultsOf = <T>(
  remote: readonly T[] | null | undefined,
  seeds: readonly T[],
): readonly T[] => (remote && remote.length > 0 ? remote : seeds);

/**
 * The list the user works with: the defaults in their order, each replaced by its local version
 * when there is one and dropped when removed locally, then the entries that exist only here.
 */
export function applyOverrides<T>(
  defaults: readonly T[],
  ov: Overrides<T>,
  rules: Pick<OverrideRules<T>, "key">,
): T[] {
  const own = new Map(ov.overrides.map((e) => [rules.key(e), e]));
  const removed = new Set(ov.removed);
  const out: T[] = [];
  for (const d of defaults) {
    const k = rules.key(d);
    if (removed.has(k)) continue;
    out.push(own.get(k) ?? d);
    own.delete(k);
  }
  for (const e of ov.overrides) if (own.has(rules.key(e))) out.push(e);
  return out;
}

/**
 * What of an edited list is the user's own: entries that differ from the default of the same
 * key (or have none), and the defaults missing from the list. An entry put back exactly as its
 * default stops being an override. A key removed earlier that the current defaults do not carry
 * (the company dropped it, maybe to publish it again) stays removed until the user brings it
 * back: pass the previous overrides for that.
 */
export function diffOverrides<T>(
  defaults: readonly T[],
  list: readonly T[],
  rules: OverrideRules<T>,
  previous?: Overrides<T>,
): Overrides<T> {
  const byKey = new Map(defaults.map((d) => [rules.key(d), d]));
  const present = new Set(list.map((e) => rules.key(e)));
  const removed = defaults.filter((d) => !present.has(rules.key(d))).map((d) => rules.key(d));
  const kept = (previous?.removed ?? []).filter((k) => !byKey.has(k) && !present.has(k));
  return {
    overrides: list.filter((e) => {
      const d = byKey.get(rules.key(e));
      return !d || !rules.same(d, e);
    }),
    removed: [...removed, ...kept],
  };
}

/** Where an entry in the user's list comes from, for the dialogs. */
export type Origin = "default" | "modified" | "local";

export function originOf<T>(defaults: readonly T[], entry: T, rules: OverrideRules<T>): Origin {
  const k = rules.key(entry);
  const d = defaults.find((x) => rules.key(x) === k);
  if (!d) return "local";
  return rules.same(d, entry) ? "default" : "modified";
}

/** Same list, entry by entry; lets a recomputed list keep its identity when nothing changed. */
export const sameList = <T>(
  a: readonly T[],
  b: readonly T[],
  same: (x: T, y: T) => boolean,
): boolean => a.length === b.length && a.every((x, i) => same(x, b[i]));

/**
 * A record setting (prices per kg, kg/m² per gauge): the company's values under the user's.
 * Overrides are the keys the user set; a key put back to the default's value stops being one.
 */
export const applyRecordOverrides = <V>(
  defaults: Readonly<Record<string, V>>,
  overrides: Readonly<Record<string, V>>,
): Record<string, V> => ({ ...defaults, ...overrides });

export const diffRecordOverrides = <V>(
  defaults: Readonly<Record<string, V>>,
  values: Readonly<Record<string, V>>,
): Record<string, V> =>
  Object.fromEntries(Object.entries(values).filter(([k, v]) => defaults[k] !== v));

export const sameRecord = <V>(
  a: Readonly<Record<string, V>>,
  b: Readonly<Record<string, V>>,
): boolean => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => k in b && a[k] === b[k]);
};
