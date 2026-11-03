import { type Kit, kitMode, SEED_KITS, sameKit } from "@rlpapp/shared/takeoff/kits";
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

/** Short description of a kit for lists: "Cobre de 1/4" · Cobre de 3/8" · Cabo PP 5 x 1,5 mm² ×2". */
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
// Company defaults and local overrides
// ---------------------------------------------------------------------------
//
// The kits a user sees are the company's defaults (published with the catalog by the dashboard's
// "App Takeoff" section; the bundled SEED_KITS until the company publishes any) with the user's
// own changes on top: a default edited here keeps the local version, a default removed here stays
// hidden, and a kit created here is appended. Refreshing the catalog replaces the defaults and
// keeps every override, so a team fix reaches everyone who did not touch that kit.

/** The user's changes to the kit list, kept with the catalog on this machine. */
export interface KitOverrides {
  /** Local versions by id: an edited default or a kit that exists only here. */
  kitOverrides: Kit[];
  /** Ids of defaults the user removed here. */
  kitRemoved: string[];
}

/** The company defaults in use: the published ones, else the bundled presets. */
export const kitDefaults = (remoteKits: readonly Kit[] | null | undefined): readonly Kit[] =>
  remoteKits && remoteKits.length > 0 ? remoteKits : SEED_KITS;

/**
 * The kit list the user works with: the defaults in their order, each replaced by its local
 * version when there is one and dropped when removed locally, then the kits that exist only here.
 */
export function effectiveKits(defaults: readonly Kit[], overrides: KitOverrides): Kit[] {
  const own = new Map(overrides.kitOverrides.map((k) => [k.id, k]));
  const removed = new Set(overrides.kitRemoved);
  const out: Kit[] = [];
  for (const d of defaults) {
    if (removed.has(d.id)) continue;
    const local = own.get(d.id);
    out.push(local ?? d);
    own.delete(d.id);
  }
  for (const k of overrides.kitOverrides) if (own.has(k.id)) out.push(k);
  return out;
}

/**
 * What of an edited list is the user's own: kits that differ from the default of the same id
 * (or have none), and the defaults missing from the list. A kit put back exactly as its default
 * stops being an override.
 */
export function diffKits(defaults: readonly Kit[], kits: readonly Kit[]): KitOverrides {
  const byId = new Map(defaults.map((k) => [k.id, k]));
  const present = new Set(kits.map((k) => k.id));
  return {
    kitOverrides: kits.filter((k) => {
      const d = byId.get(k.id);
      return !d || !sameKit(d, k);
    }),
    kitRemoved: defaults.filter((d) => !present.has(d.id)).map((d) => d.id),
  };
}

/** Where a kit in the user's list comes from, for the kits dialog. */
export type KitOrigin = "default" | "modified" | "local";

export function kitOrigin(defaults: readonly Kit[], kit: Kit): KitOrigin {
  const d = defaults.find((k) => k.id === kit.id);
  if (!d) return "local";
  return sameKit(d, kit) ? "default" : "modified";
}

/**
 * The saved list of versions before overrides existed (the defaults cloned into `kits` and
 * edited in place), read as overrides of the bundled presets: the same kits come out of
 * effectiveKits, and from now on a changed default reaches the machine.
 */
export const overridesFromLegacyKits = (kits: readonly Kit[]): KitOverrides =>
  diffKits(SEED_KITS, kits);

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
