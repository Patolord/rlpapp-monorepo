import { type Kit, kitMode, SEED_KITS, SEED_KITS_V1, sameKit } from "@rlpapp/shared/takeoff/kits";
import {
  applyOverrides,
  defaultsOf,
  diffOverrides,
  type Origin,
  type OverrideRules,
  type Overrides,
  originOf,
} from "./overrides";
import type { Measurement } from "./types";
import type { Unit } from "./units";

/**
 * Kit presets. The types and the factory presets are shared with the backend and the dashboard
 * (`@rlpapp/shared/takeoff/kits`); this module holds what only the app needs: the company
 * defaults + local overrides model, and the labels kits put on the drawing.
 */
export {
  cloneKit,
  type Kit,
  type KitComponent,
  type KitMode,
  kitMode,
  SEED_KITS,
  sameKit,
} from "@rlpapp/shared/takeoff/kits";

/** Short description of a kit for lists: "Tubulação de Cobre 1/4" · … · Cabo PP 5x1,5 mm² ×2". */
export function kitSummary(kit: Kit, unit: Unit = "m"): string {
  return kit.components
    .map((c) =>
      kitMode(kit) === "count" && c.kind === "linear"
        ? `${c.name} ${c.factor} ${unit}`
        : c.factor !== 1
          ? `${c.name} ×${c.factor}`
          : c.name,
    )
    .join(" · ");
}

// ---------------------------------------------------------------------------
// Company defaults and local overrides (see lib/overrides.ts)
// ---------------------------------------------------------------------------

/** The user's changes to the kit list, kept with the catalog on this machine. */
export interface KitOverrides {
  /** Local versions by id: an edited default or a kit that exists only here. */
  kitOverrides: Kit[];
  /** Ids of defaults the user removed here. */
  kitRemoved: string[];
}

export const KIT_RULES: OverrideRules<Kit> = { key: (k) => k.id, same: sameKit };

const toGeneric = (o: KitOverrides): Overrides<Kit> => ({
  overrides: o.kitOverrides,
  removed: o.kitRemoved,
});

/** The company defaults in use: the published ones, else the bundled presets. */
export const kitDefaults = (remoteKits: readonly Kit[] | null | undefined): readonly Kit[] =>
  defaultsOf(remoteKits, SEED_KITS);

/**
 * The kit list the user works with: the defaults in their order, each replaced by its local
 * version when there is one and dropped when removed locally, then the kits that exist only here.
 */
export const effectiveKits = (defaults: readonly Kit[], overrides: KitOverrides): Kit[] =>
  applyOverrides(defaults, toGeneric(overrides), KIT_RULES);

/**
 * What of an edited list is the user's own: kits that differ from the default of the same id
 * (or have none), and the defaults missing from the list. A kit put back exactly as its default
 * stops being an override. With `previous`, a default removed earlier that the current defaults
 * do not carry stays removed.
 */
export function diffKits(
  defaults: readonly Kit[],
  kits: readonly Kit[],
  previous?: KitOverrides,
): KitOverrides {
  const d = diffOverrides(defaults, kits, KIT_RULES, previous && toGeneric(previous));
  return { kitOverrides: d.overrides, kitRemoved: d.removed };
}

/** Where a kit in the user's list comes from, for the kits dialog. */
export type KitOrigin = Origin;

export const kitOrigin = (defaults: readonly Kit[], kit: Kit): KitOrigin =>
  originOf(defaults, kit, KIT_RULES);

/**
 * The saved list of versions before overrides existed (the defaults cloned into `kits` and
 * edited in place), read as overrides of the bundled presets: the same kits come out of
 * effectiveKits, and from now on a changed default reaches the machine.
 */
export const overridesFromLegacyKits = (kits: readonly Kit[]): KitOverrides =>
  diffKits(SEED_KITS, kits.map(currentSeedOf));

const SEEDS = new Map(SEED_KITS.map((k) => [k.id, k]));
const SEEDS_V1 = new Map(SEED_KITS_V1.map((k) => [k.id, k]));

/**
 * A preset saved exactly as an earlier factory version (before the catalog names) reads as the
 * current preset: untouched, it is no local edit and keeps following the company's version.
 */
function currentSeedOf(kit: Kit): Kit {
  const old = SEEDS_V1.get(kit.id);
  const now = SEEDS.get(kit.id);
  return old && now && sameKit(kit, old) ? now : kit;
}

// ---------------------------------------------------------------------------
// Labels on the drawing
// ---------------------------------------------------------------------------

/**
 * Kits saved before kits had a drawing label: one that came from a seed (same id) and has no
 * `label` field takes the seed's. A label the user cleared ("") stays cleared. Returns the same
 * array when nothing changes.
 */
export function migrateKitLabels(kits: Kit[]): Kit[] {
  const seeds = new Map(SEED_KITS.map((k) => [k.id, k]));
  let changed = false;
  const out = kits.map((k) => {
    const label = seeds.get(k.id)?.label;
    if (k.label !== undefined || label === undefined) return k;
    changed = true;
    return { ...k, label };
  });
  return changed ? out : kits;
}

type KitLookup = readonly Kit[] | ReadonlyMap<string, Kit>;

const findKit = (kits: KitLookup, id: string): Kit | undefined =>
  "get" in kits ? kits.get(id) : kits.find((k) => k.id === id);

/**
 * The label a marking shows on the drawing, before its quantity: its own override, else the
 * label of its kit in the current catalog (so editing a kit relabels the runs already drawn),
 * else the label saved with the run when the catalog lacks the kit. Blank = no label.
 */
export function runLabel(
  m: Pick<Measurement, "label" | "kitId" | "kitLabel">,
  kits: KitLookup = [],
): string | undefined {
  const own = m.label?.trim();
  if (own) return own;
  if (!m.kitId) return undefined;
  const kit = findKit(kits, m.kitId);
  const text = (kit ? kit.label : m.kitLabel)?.trim();
  return text || undefined;
}

/** A kit's label as saved with the runs it draws (blank = none). */
export const kitLabelSnapshot = (kit: Kit): string | undefined => kit.label?.trim() || undefined;

/**
 * After the kits were edited: runs of a kit whose label changed save the new label, so a project
 * opened with another catalog shows it too. Returns the same array when nothing changes.
 */
export function refreshKitLabels(
  measurements: Measurement[],
  before: readonly Kit[],
  after: readonly Kit[],
): Measurement[] {
  const old = new Map(before.map((k) => [k.id, kitLabelSnapshot(k)]));
  const relabelled = new Map<string, string | undefined>();
  for (const k of after) {
    const label = kitLabelSnapshot(k);
    if (old.has(k.id) && old.get(k.id) !== label) relabelled.set(k.id, label);
  }
  if (relabelled.size === 0) return measurements;
  let changed = false;
  const out = measurements.map((m) => {
    if (!m.kitId || !relabelled.has(m.kitId)) return m;
    const kitLabel = relabelled.get(m.kitId);
    if (m.kitLabel === kitLabel) return m;
    changed = true;
    const next = { ...m, kitLabel };
    if (kitLabel === undefined) delete next.kitLabel;
    return next;
  });
  return changed ? out : measurements;
}
