export type MaterialDimensions = {
  widthMm?: number;
  heightMm?: number;
  lengthMm?: number;
  thicknessMm?: number;
  diameterMm?: number;
};

const DIMENSION_KEYS = [
  "widthMm",
  "heightMm",
  "lengthMm",
  "thicknessMm",
  "diameterMm",
] as const;

const SKIP_JSON_KEYS = new Set<string>(["sources", "sourceConflict"]);
const COLUMN_ATTRIBUTE_KEYS = ["finish", "tubeSize", "application"] as const;

export function parsePositiveNumber(
  value: string | undefined
): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function dimensionsFromVariant(
  value: string | undefined
): MaterialDimensions | undefined {
  if (!value) return undefined;
  const match =
    /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*mm(?![²2])/i.exec(value);
  if (!match) return undefined;
  return {
    widthMm: Number.parseFloat(match[1]!.replace(",", ".")),
    heightMm: Number.parseFloat(match[2]!.replace(",", ".")),
  };
}

function mergeDimensions(
  ...parts: Array<MaterialDimensions | undefined>
): MaterialDimensions | undefined {
  const merged: MaterialDimensions = {};
  for (const part of parts) {
    if (!part) continue;
    for (const key of DIMENSION_KEYS) {
      const value = part[key];
      if (value !== undefined) merged[key] = value;
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function dimensionsFromRecord(
  record: Record<string, unknown>
): MaterialDimensions | undefined {
  const dimensions: MaterialDimensions = {};
  for (const key of DIMENSION_KEYS) {
    const raw = record[key];
    const value =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? parsePositiveNumber(raw)
          : undefined;
    if (value !== undefined) dimensions[key] = value;
  }
  return Object.keys(dimensions).length > 0 ? dimensions : undefined;
}

function attributesFromRecord(
  record: Record<string, unknown>
): Array<{ key: string; value: string }> {
  const attributes: Array<{ key: string; value: string }> = [];
  for (const [key, raw] of Object.entries(record)) {
    if (SKIP_JSON_KEYS.has(key)) continue;
    if ((DIMENSION_KEYS as readonly string[]).includes(key)) continue;
    if (raw === null || raw === undefined) continue;
    if (typeof raw === "object") continue;
    const value = String(raw).trim();
    if (!key.trim() || !value) continue;
    attributes.push({ key, value });
  }
  return attributes;
}

export function parseCatalogRowAttributes(row: Record<string, string>): {
  dimensions?: MaterialDimensions;
  technicalAttributes?: Array<{ key: string; value: string }>;
} {
  let jsonDimensions: MaterialDimensions | undefined;
  let jsonAttributes: Array<{ key: string; value: string }> = [];
  const rawJson = row.attributesJson?.trim();
  if (rawJson) {
    try {
      const parsed: unknown = JSON.parse(rawJson);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        jsonDimensions = dimensionsFromRecord(record);
        jsonAttributes = attributesFromRecord(record);
      }
    } catch {
      // Planilha antiga com JSON inválido: segue só com as colunas planas.
    }
  }

  const columnDimensions = dimensionsFromRecord({
    widthMm: row.widthMm,
    heightMm: row.heightMm,
    lengthMm: row.lengthMm,
    thicknessMm: row.thicknessMm,
    diameterMm: row.diameterMm,
  });

  const columnAttributes: Array<{ key: string; value: string }> = [];
  for (const key of COLUMN_ATTRIBUTE_KEYS) {
    const value = row[key]?.trim();
    if (value) columnAttributes.push({ key, value });
  }

  const attributeMap = new Map<string, string>();
  for (const attribute of [...jsonAttributes, ...columnAttributes]) {
    attributeMap.set(attribute.key, attribute.value);
  }

  return {
    dimensions: mergeDimensions(
      dimensionsFromVariant(row.variantLabel),
      jsonDimensions,
      columnDimensions
    ),
    technicalAttributes:
      attributeMap.size > 0
        ? [...attributeMap.entries()].map(([key, value]) => ({ key, value }))
        : undefined,
  };
}

export function formatMaterialLabel(
  name: string,
  variantLabel?: string | null
): string {
  const variant = variantLabel?.trim();
  return variant ? `${name} — ${variant}` : name;
}
