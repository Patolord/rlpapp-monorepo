import type { Id } from "../../_generated/dataModel";
import type { MaterialDimensions } from "../../lib/compras/catalog";
import { DAY_MS } from "./priceHistory";

/**
 * Estimativa por tamanho para itens fabricados sob medida (grelhas, dampers,
 * dutos). O mesmo item raramente repete a medida, então a estimativa vem das
 * cotações já recebidas para a mesma família: as de tamanho mais próximo
 * (vizinhos) ou, quando há cotações suficientes, uma curva ajustada às
 * medidas (regressão). Em ambos os casos o resultado vem com os precedentes
 * usados, para a pessoa julgar.
 */

export const DIMENSION_KEYS = [
  "widthMm",
  "heightMm",
  "lengthMm",
  "thicknessMm",
  "diameterMm",
] as const;
export type DimensionKey = (typeof DIMENSION_KEYS)[number];

export type EstimateCandidate = {
  eventId: Id<"priceEvents">;
  unitPriceCents: number;
  occurredAt: number;
  dimensions: MaterialDimensions;
  supplierId?: Id<"suppliers">;
  supplierNameRaw?: string;
  materialId?: Id<"materials">;
  needsReview?: boolean;
};

export type EstimatePrecedent = {
  eventId: Id<"priceEvents">;
  unitPriceCents: number;
  occurredAt: number;
  dimensions: MaterialDimensions;
  supplierId: Id<"suppliers"> | null;
  supplierNameRaw: string | null;
  materialId: Id<"materials"> | null;
  /** Diferença de tamanho em relação ao alvo, em %, 0 = mesma medida. */
  sizeDifferencePercent: number;
};

export type EstimateMethod = "exact" | "nearest" | "regression";
export type EstimateConfidence = "high" | "medium" | "low";

export type EstimateSuggestion = {
  method: EstimateMethod;
  suggestedUnitPriceCents: number;
  confidence: EstimateConfidence;
  /** Cotações comparáveis (mesmo tipo de medida) encontradas na família. */
  compatibleCount: number;
  /** Cotações que efetivamente entraram no cálculo. */
  usedCount: number;
  minCents: number;
  maxCents: number;
  /** Só do fornecedor pedido, quando ele tinha cotações suficientes. */
  supplierOnly: boolean;
  precedents: EstimatePrecedent[];
};

export type EstimateResult =
  | EstimateSuggestion
  | {
      method: null;
      compatibleCount: number;
      precedents: EstimatePrecedent[];
    };

/** Chaves presentes e positivas, em ordem fixa. */
export function dimensionKeys(dimensions: MaterialDimensions): DimensionKey[] {
  return DIMENSION_KEYS.filter((key) => {
    const value = dimensions[key];
    return value !== undefined && Number.isFinite(value) && value > 0;
  });
}

function sameKeys(a: DimensionKey[], b: DimensionKey[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

/**
 * Distância de tamanho: média do |ln(a/b)| por medida. Simétrica e
 * proporcional (100→200 pesa o mesmo que 200→100). 0 = mesma medida.
 */
export function sizeDistance(
  a: MaterialDimensions,
  b: MaterialDimensions
): number | null {
  const keys = dimensionKeys(a);
  if (keys.length === 0 || !sameKeys(keys, dimensionKeys(b))) return null;
  let total = 0;
  for (const key of keys) total += Math.abs(Math.log(a[key]! / b[key]!));
  return total / keys.length;
}

export function distanceToPercent(distance: number): number {
  return Math.round((Math.exp(distance) - 1) * 1000) / 10;
}

/**
 * Variáveis explicativas da curva por tipo de medida: para peças planas
 * (largura×altura) área e perímetro; para redondas, área e diâmetro; para
 * lineares, o comprimento; para o resto, o produto das medidas. Sempre com
 * intercepto, porque o custo de fabricação não é proporcional ao tamanho.
 */
export function regressionFeatures(dimensions: MaterialDimensions): number[] {
  const keys = dimensionKeys(dimensions);
  const w = dimensions.widthMm;
  const h = dimensions.heightMm;
  const d = dimensions.diameterMm;
  const l = dimensions.lengthMm;
  if (w && h && keys.length === 2) {
    return [1, (w * h) / 1_000_000, (2 * (w + h)) / 1000];
  }
  if (d && keys.length === 1) {
    return [1, (Math.PI * d * d) / 4_000_000, d / 1000];
  }
  if (l && keys.length === 1) return [1, l / 1000];
  const product = keys.reduce((acc, key) => acc * (dimensions[key]! / 1000), 1);
  return [1, product];
}

/** Resolve A·x = b por eliminação de Gauss; null se singular. */
function solveLinear(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]!]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row]![col]!) > Math.abs(a[pivot]![col]!)) pivot = row;
    }
    if (Math.abs(a[pivot]![col]!) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row]![col]! / a[col]![col]!;
      for (let k = col; k <= n; k += 1) a[row]![k]! -= factor * a[col]![k]!;
    }
  }
  return a.map((row, i) => row[n]! / row[i]!);
}

/** Mínimos quadrados ponderados; null quando o sistema é singular. */
export function fitWeightedLeastSquares(
  rows: { features: number[]; target: number; weight: number }[]
): number[] | null {
  const n = rows[0]?.features.length ?? 0;
  if (n === 0) return null;
  const xtx: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const xty: number[] = Array(n).fill(0);
  for (const row of rows) {
    for (let i = 0; i < n; i += 1) {
      xty[i]! += row.weight * row.features[i]! * row.target;
      for (let j = 0; j < n; j += 1) {
        xtx[i]![j]! += row.weight * row.features[i]! * row.features[j]!;
      }
    }
  }
  return solveLinear(xtx, xty);
}

function dot(a: number[], b: number[]): number {
  return a.reduce((acc, value, index) => acc + value * b[index]!, 0);
}

const SIZE_SCALE = 0.2; // ~20% de diferença de tamanho já reduz o peso a 1/e
const RECENCY_HALF_LIFE_DAYS = 180;
const NEAREST_MAX_DISTANCE = Math.log(1.5); // vizinhos até 50% maiores/menores
const NEAREST_LIMIT = 5;
const REGRESSION_MIN_SAMPLES = 6;
const REGRESSION_MIN_DISTINCT_SIZES = 4;
const REGRESSION_MAX_RELATIVE_ERROR = 0.35;
const SUPPLIER_MIN_SAMPLES = 2;

function recencyWeight(occurredAt: number, now: number): number {
  const ageDays = Math.max(0, (now - occurredAt) / DAY_MS);
  return Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
}

function toPrecedent(
  candidate: EstimateCandidate,
  distance: number
): EstimatePrecedent {
  return {
    eventId: candidate.eventId,
    unitPriceCents: candidate.unitPriceCents,
    occurredAt: candidate.occurredAt,
    dimensions: candidate.dimensions,
    supplierId: candidate.supplierId ?? null,
    supplierNameRaw: candidate.supplierNameRaw ?? null,
    materialId: candidate.materialId ?? null,
    sizeDifferencePercent: distanceToPercent(distance),
  };
}

function confidenceFor(
  method: EstimateMethod,
  usedCount: number,
  spreadRatio: number,
  nearestDistance: number
): EstimateConfidence {
  if (method === "exact" && usedCount >= 2 && spreadRatio <= 0.15) return "high";
  if (method === "regression" && usedCount >= 10 && spreadRatio <= 0.2) {
    return "high";
  }
  if (usedCount >= 3 && spreadRatio <= 0.3 && nearestDistance <= Math.log(1.25)) {
    return "medium";
  }
  return "low";
}

export function suggestEstimate(
  candidates: EstimateCandidate[],
  target: MaterialDimensions,
  now: number,
  options: { supplierId?: Id<"suppliers"> | null } = {}
): EstimateResult {
  const targetKeys = dimensionKeys(target);
  if (targetKeys.length === 0) {
    return { method: null, compatibleCount: 0, precedents: [] };
  }

  let scored = candidates
    .map((candidate) => ({
      candidate,
      distance: sizeDistance(target, candidate.dimensions),
    }))
    .filter(
      (entry): entry is { candidate: EstimateCandidate; distance: number } =>
        entry.distance !== null
    );
  const compatibleCount = scored.length;
  if (compatibleCount === 0) {
    return { method: null, compatibleCount, precedents: [] };
  }

  let supplierOnly = false;
  if (options.supplierId) {
    const ofSupplier = scored.filter(
      (entry) => entry.candidate.supplierId === options.supplierId
    );
    if (ofSupplier.length >= SUPPLIER_MIN_SAMPLES) {
      scored = ofSupplier;
      supplierOnly = true;
    }
  }

  const weighted = scored
    .map((entry) => ({
      ...entry,
      weight:
        Math.exp(-((entry.distance / SIZE_SCALE) ** 2)) *
        recencyWeight(entry.candidate.occurredAt, now) *
        (entry.candidate.needsReview ? 0.5 : 1),
    }))
    .sort(
      (a, b) =>
        a.distance - b.distance || b.candidate.occurredAt - a.candidate.occurredAt
    );

  const precedents = weighted
    .slice(0, NEAREST_LIMIT)
    .map((entry) => toPrecedent(entry.candidate, entry.distance));

  // Mesma medida já cotada: a melhor estimativa é essa, ponderada pela idade.
  const exact = weighted.filter((entry) => entry.distance < 1e-9);
  if (exact.length > 0) {
    const used = exact.slice(0, NEAREST_LIMIT);
    return summarize("exact", used, compatibleCount, supplierOnly, precedents, now);
  }

  // Curva por tamanho, quando há amostra suficiente e ela explica os preços.
  const distinctSizes = new Set(
    weighted.map((entry) => JSON.stringify(entry.candidate.dimensions))
  ).size;
  if (
    weighted.length >= REGRESSION_MIN_SAMPLES &&
    distinctSizes >= REGRESSION_MIN_DISTINCT_SIZES
  ) {
    const rows = weighted.map((entry) => ({
      features: regressionFeatures(entry.candidate.dimensions),
      target: entry.candidate.unitPriceCents,
      weight: recencyWeight(entry.candidate.occurredAt, now),
    }));
    const coefficients = fitWeightedLeastSquares(rows);
    if (coefficients) {
      const predicted = dot(coefficients, regressionFeatures(target));
      let weightedError = 0;
      let totalWeight = 0;
      for (const row of rows) {
        const fitted = dot(coefficients, row.features);
        weightedError += row.weight * Math.abs(fitted - row.target) / Math.max(row.target, 1);
        totalWeight += row.weight;
      }
      const relativeError = totalWeight > 0 ? weightedError / totalWeight : 1;
      if (predicted > 0 && relativeError <= REGRESSION_MAX_RELATIVE_ERROR) {
        const prices = weighted.map((entry) => entry.candidate.unitPriceCents);
        const spreadRatio = relativeError;
        return {
          method: "regression",
          suggestedUnitPriceCents: Math.round(predicted),
          confidence: confidenceFor(
            "regression",
            weighted.length,
            spreadRatio,
            weighted[0]!.distance
          ),
          compatibleCount,
          usedCount: weighted.length,
          minCents: Math.min(...prices),
          maxCents: Math.max(...prices),
          supplierOnly,
          precedents,
        };
      }
    }
  }

  // Vizinhos de tamanho próximo, média ponderada por proximidade e idade.
  const near = weighted
    .filter((entry) => entry.distance <= NEAREST_MAX_DISTANCE)
    .slice(0, NEAREST_LIMIT);
  if (near.length === 0) {
    return { method: null, compatibleCount, precedents };
  }
  return summarize("nearest", near, compatibleCount, supplierOnly, precedents, now);
}

function summarize(
  method: EstimateMethod,
  used: { candidate: EstimateCandidate; distance: number; weight: number }[],
  compatibleCount: number,
  supplierOnly: boolean,
  precedents: EstimatePrecedent[],
  now: number
): EstimateSuggestion {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const entry of used) {
    // Para medida exata a distância é zero; só a idade diferencia.
    const weight =
      method === "exact" ? recencyWeight(entry.candidate.occurredAt, now) : entry.weight;
    weightedSum += weight * entry.candidate.unitPriceCents;
    totalWeight += weight;
  }
  const prices = used.map((entry) => entry.candidate.unitPriceCents);
  const minCents = Math.min(...prices);
  const maxCents = Math.max(...prices);
  const suggested = totalWeight > 0 ? weightedSum / totalWeight : prices[0]!;
  const spreadRatio = suggested > 0 ? (maxCents - minCents) / suggested : 1;
  return {
    method,
    suggestedUnitPriceCents: Math.round(suggested),
    confidence: confidenceFor(method, used.length, spreadRatio, used[0]!.distance),
    compatibleCount,
    usedCount: used.length,
    minCents,
    maxCents,
    supplierOnly,
    precedents,
  };
}
