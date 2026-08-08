export type CsvParseResult = {
  headers: string[];
  rows: Record<string, string>[];
};

function detectDelimiter(line: string): "," | ";" {
  let commaCount = 0;
  let semicolonCount = 0;
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (char === ",") commaCount++;
    if (char === ";") semicolonCount++;
  }

  return semicolonCount > commaCount ? ";" : ",";
}

function parseCsvLine(line: string, delimiter: "," | ";"): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      fields.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  fields.push(current.trim());
  return fields;
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase();
}

export function parseCsv(text: string): CsvParseResult {
  const normalized = text.replace(/^\uFEFF/, "").trim();
  if (!normalized) {
    return { headers: [], rows: [] };
  }

  const lines = normalized.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const delimiter = detectDelimiter(lines[0]!);
  const rawHeaders = parseCsvLine(lines[0]!, delimiter);
  const headers = rawHeaders.map((h) => h.trim());

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]!, delimiter);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      if (!header) continue;
      row[header] = values[j] ?? "";
    }
    rows.push(row);
  }

  return { headers, rows };
}

export function mapRowWithAliases(
  row: Record<string, string>,
  aliases: Record<string, readonly string[]>
): Record<string, string> {
  const mapped: Record<string, string> = {};
  const normalizedRow: Record<string, string> = {};

  for (const [key, value] of Object.entries(row)) {
    normalizedRow[normalizeHeader(key)] = value;
  }

  for (const [canonical, aliasList] of Object.entries(aliases)) {
    for (const alias of aliasList) {
      const value = normalizedRow[normalizeHeader(alias)];
      if (value !== undefined && value !== "") {
        mapped[canonical] = value;
        break;
      }
    }
    if (mapped[canonical] === undefined) {
      const direct = normalizedRow[normalizeHeader(canonical)];
      if (direct !== undefined) mapped[canonical] = direct;
    }
  }

  return mapped;
}

export function splitList(value: string | undefined, separator = ";"): string[] {
  if (!value?.trim()) return [];
  return value
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function downloadCsvTemplate(filename: string, headers: string[], sampleRow?: string[]): void {
  const lines = [headers.join(",")];
  if (sampleRow) {
    lines.push(sampleRow.map((cell) => (cell.includes(",") ? `"${cell}"` : cell)).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
