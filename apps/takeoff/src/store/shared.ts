import type { StateCreator } from "zustand";
import type { Pt } from "../lib/geom";
import type { Kind } from "../lib/units";
import type { State } from "./index";

/** A slice of the store: it may read and set the whole state through `get`/`set`. */
export type Slice<T> = StateCreator<State, [], [], T>;

export type Tool =
  | "select"
  | "pan"
  | "count"
  | "linear"
  | "area"
  | "rect"
  | "magic"
  | "calibrate"
  | "zone"
  | "similar"
  | "kit"
  | "duct"
  | "vrf";

/** The kind of item a drawing tool produces (none for select, pan, calibrate, zone, similar, kit). */
export const KIND_OF_TOOL: Partial<Record<Tool, Kind>> = {
  count: "count",
  linear: "linear",
  area: "area",
  rect: "area",
  magic: "area",
  duct: "linear",
  vrf: "linear",
};

export const TOOL_OF_KIND: Record<Kind, Tool> = { count: "count", linear: "linear", area: "area" };

/** A polygon or run drawn and waiting for a dialog (its location name, duct section, VRF role). */
export interface PendingZone {
  page: number;
  points: Pt[];
}

export interface Calibration {
  page: number;
  a: Pt;
  b: Pt;
}

/** Small view preferences kept per machine (not part of the project file). */
export function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`takeoff.pref.${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(`takeoff.pref.${key}`, JSON.stringify(value));
  } catch {
    // storage unavailable: keep the in-memory value only
  }
}

/** Human message for an error caught in an async store action. */
export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));
