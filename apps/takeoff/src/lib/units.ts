export type Unit = "m" | "ft";
export type Kind = "count" | "linear" | "area";

export interface PageScale {
  /** PDF points (1/72 in) on paper per one real-world unit (`unit`). */
  pointsPerUnit: number;
  unit: Unit;
  label: string;
}

const PT_PER_MM = 72 / 25.4;
const PT_PER_IN = 72;

export const metricScale = (ratio: number): PageScale => ({
  label: `1:${ratio}`,
  unit: "m",
  pointsPerUnit: (1000 / ratio) * PT_PER_MM,
});

export const imperialScale = (label: string, inchesPerFoot: number): PageScale => ({
  label,
  unit: "ft",
  pointsPerUnit: inchesPerFoot * PT_PER_IN,
});

export const METRIC_PRESETS: PageScale[] = [20, 25, 50, 75, 100, 125, 150, 200, 250, 500].map(
  metricScale,
);

export const IMPERIAL_PRESETS: PageScale[] = [
  imperialScale("1/16\" = 1'", 1 / 16),
  imperialScale("3/32\" = 1'", 3 / 32),
  imperialScale("1/8\" = 1'", 1 / 8),
  imperialScale("3/16\" = 1'", 3 / 16),
  imperialScale("1/4\" = 1'", 1 / 4),
  imperialScale("3/8\" = 1'", 3 / 8),
  imperialScale("1/2\" = 1'", 1 / 2),
  imperialScale("3/4\" = 1'", 3 / 4),
  imperialScale("1\" = 1'", 1),
  imperialScale("1\" = 10'", 1 / 10),
  imperialScale("1\" = 20'", 1 / 20),
  imperialScale("1\" = 30'", 1 / 30),
  imperialScale("1\" = 50'", 1 / 50),
];

/** Paper-to-real ratio N of a scale (1:N); metric compares mm on paper to mm real, imperial inches to inches. */
export function scaleRatio(pointsPerUnit: number, unit: Unit): number {
  const paperPerUnit = unit === "m" ? pointsPerUnit / PT_PER_MM : pointsPerUnit / PT_PER_IN;
  const realPerUnit = unit === "m" ? 1000 : 12;
  return realPerUnit / paperPerUnit;
}

/** "1:75" style label; one decimal when the ratio is not close to a whole number. */
export function ratioLabel(pointsPerUnit: number, unit: Unit): string {
  const r = scaleRatio(pointsPerUnit, unit);
  const rounded = Math.round(r);
  return Math.abs(r - rounded) < 0.05 ? `1:${rounded}` : `1:${r.toFixed(1)}`;
}

export const presetsFor = (unit: Unit): PageScale[] =>
  unit === "m" ? METRIC_PRESETS : IMPERIAL_PRESETS;

export const INPUT_UNITS = ["mm", "cm", "m", "in", "ft"] as const;
export type InputUnit = (typeof INPUT_UNITS)[number];

/** Convert a user-entered distance in `from` into the project base unit. */
export function toBaseUnit(value: number, from: InputUnit, base: Unit): number {
  const metres: Record<InputUnit, number> = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 };
  const m = value * metres[from];
  return base === "m" ? m : m / 0.3048;
}

export const qtyUnit = (kind: Kind, unit: Unit): string => {
  if (kind === "count") return "pç";
  if (kind === "linear") return unit;
  return `${unit}²`;
};

export function formatLength(v: number, unit: Unit): string {
  if (unit === "m") return `${v.toFixed(2)} m`;
  const totalIn = v * 12;
  const ft = Math.floor(totalIn / 12);
  const inch = totalIn - ft * 12;
  return `${ft}'-${inch.toFixed(1)}"`;
}

export const formatArea = (v: number, unit: Unit): string => `${v.toFixed(2)} ${unit}²`;

export function formatQty(kind: Kind, v: number, unit: Unit): string {
  if (kind === "count") return `${Math.round(v)} pç`;
  if (kind === "linear") return formatLength(v, unit);
  return formatArea(v, unit);
}

const LOCALES: Record<string, string> = { BRL: "pt-BR", USD: "en-US", EUR: "de-DE", GBP: "en-GB" };

export function formatMoney(v: number, currency: string): string {
  try {
    return new Intl.NumberFormat(LOCALES[currency] ?? "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}

export const formatNumber = (v: number, currency: string, digits = 2): string =>
  new Intl.NumberFormat(LOCALES[currency] ?? "en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);
