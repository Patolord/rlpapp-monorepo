/**
 * Reading the arguments of a tool call. The model writes them, so every value is checked and a
 * wrong one becomes a `ToolError` that says what was expected.
 */
import type { Pt } from "../geom";
import { type JsonSchema, ToolError } from "./toolTypes";

type Args = Record<string, unknown>;

/** Largest coordinate accepted, in PDF points: far beyond any sheet, small enough to be sane. */
const MAX_COORD = 100_000;

export function str(args: Args, key: string): string {
  const v = args[key];
  if (typeof v !== "string" || v.trim() === "") {
    throw new ToolError(`"${key}" must be a non-empty string`);
  }
  return v.trim();
}

export function optStr(args: Args, key: string): string | undefined {
  const v = args[key];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") throw new ToolError(`"${key}" must be a string`);
  return v.trim() || undefined;
}

export function num(args: Args, key: string, opts: { min?: number; max?: number } = {}): number {
  const v = args[key];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new ToolError(`"${key}" must be a number`);
  }
  if (opts.min !== undefined && v < opts.min) throw new ToolError(`"${key}" must be ≥ ${opts.min}`);
  if (opts.max !== undefined && v > opts.max) throw new ToolError(`"${key}" must be ≤ ${opts.max}`);
  return v;
}

export function optNum(
  args: Args,
  key: string,
  opts: { min?: number; max?: number } = {},
): number | undefined {
  return args[key] === undefined || args[key] === null ? undefined : num(args, key, opts);
}

export function optBool(args: Args, key: string): boolean | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "boolean") throw new ToolError(`"${key}" must be true or false`);
  return v;
}

export function oneOf<T extends string>(args: Args, key: string, values: readonly T[]): T {
  const v = args[key];
  if (typeof v !== "string" || !values.includes(v as T)) {
    throw new ToolError(`"${key}" must be one of: ${values.join(", ")}`);
  }
  return v as T;
}

function asPoint(v: unknown, where: string): Pt {
  const p = v as { x?: unknown; y?: unknown } | null;
  if (
    !p ||
    typeof p !== "object" ||
    typeof p.x !== "number" ||
    typeof p.y !== "number" ||
    !Number.isFinite(p.x) ||
    !Number.isFinite(p.y) ||
    Math.abs(p.x) > MAX_COORD ||
    Math.abs(p.y) > MAX_COORD
  ) {
    throw new ToolError(`${where} must be a point {"x": number, "y": number} in page points`);
  }
  return { x: p.x, y: p.y };
}

export const point = (args: Args, key: string): Pt => asPoint(args[key], `"${key}"`);

export function points(args: Args, key: string, min = 1): Pt[] {
  const v = args[key];
  if (!Array.isArray(v) || v.length < min) {
    throw new ToolError(`"${key}" must be a list of at least ${min} point(s)`);
  }
  return v.map((p, i) => asPoint(p, `"${key}"[${i}]`));
}

export const optPoints = (args: Args, key: string, min = 1): Pt[] | undefined =>
  args[key] === undefined || args[key] === null ? undefined : points(args, key, min);

/** A list of shapes, each a list of points (polylines or polygons). */
export function shapes(args: Args, key: string, minPoints: number): Pt[][] {
  const v = args[key];
  if (!Array.isArray(v) || v.length === 0) {
    throw new ToolError(`"${key}" must be a non-empty list of shapes (each a list of points)`);
  }
  return v.map((shape, i) => {
    if (!Array.isArray(shape) || shape.length < minPoints) {
      throw new ToolError(`"${key}"[${i}] must have at least ${minPoints} points`);
    }
    return shape.map((p, j) => asPoint(p, `"${key}"[${i}][${j}]`));
  });
}

export interface RectArg {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function optRect(args: Args, key: string): RectArg | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  const r = v as Partial<Record<keyof RectArg, unknown>>;
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  if (
    typeof v !== "object" ||
    !ok(r.x) ||
    !ok(r.y) ||
    !ok(r.w) ||
    !ok(r.h) ||
    r.w <= 0 ||
    r.h <= 0
  ) {
    throw new ToolError(`"${key}" must be {"x", "y", "w", "h"} in page points, with w and h > 0`);
  }
  return { x: r.x, y: r.y, w: r.w, h: r.h };
}

export function rect(args: Args, key: string): RectArg {
  const r = optRect(args, key);
  if (!r) throw new ToolError(`"${key}" is required: {"x", "y", "w", "h"} in page points`);
  return r;
}

export function stringList(args: Args, key: string): string[] {
  const v = args[key];
  if (!Array.isArray(v) || v.length === 0 || v.some((s) => typeof s !== "string" || !s)) {
    throw new ToolError(`"${key}" must be a non-empty list of strings`);
  }
  return v as string[];
}

// ---------------------------------------------------------------------------
// Schema fragments shared by the tool definitions
// ---------------------------------------------------------------------------

export const POINT_SCHEMA: JsonSchema = {
  type: "object",
  description: "A point in page points (PDF points, origin at the top-left, y grows downwards).",
  properties: { x: { type: "number" }, y: { type: "number" } },
  required: ["x", "y"],
};

export const RECT_SCHEMA: JsonSchema = {
  type: "object",
  description: "A rectangle in page points: top-left corner and size.",
  properties: {
    x: { type: "number" },
    y: { type: "number" },
    w: { type: "number" },
    h: { type: "number" },
  },
  required: ["x", "y", "w", "h"],
};

export const DRAWING_SCHEMA: JsonSchema = {
  type: "string",
  description: "Drawing id from get_takeoff. Omit for the drawing shown in the app.",
};

export const PAGE_SCHEMA: JsonSchema = {
  type: "integer",
  minimum: 1,
  description: "Page number of the drawing's PDF, starting at 1.",
};
