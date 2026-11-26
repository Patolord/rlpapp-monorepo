import { v } from "convex/values";

export const bulkImportErrorValidator = v.object({
  row: v.number(),
  message: v.string(),
});

export const bulkImportResultValidator = v.object({
  created: v.number(),
  skipped: v.number(),
  errors: v.array(bulkImportErrorValidator),
});

export type BulkImportResult = {
  created: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
};

export function emptyBulkImportResult(): BulkImportResult {
  return { created: 0, skipped: 0, errors: [] };
}

export function mergeBulkImportResults(
  target: BulkImportResult,
  source: BulkImportResult
): BulkImportResult {
  target.created += source.created;
  target.skipped += source.skipped;
  target.errors.push(...source.errors);
  return target;
}

export function requireTrimmedName(
  name: string | undefined,
  row: number,
  label: string
): { ok: true; name: string } | { ok: false; error: { row: number; message: string } } {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) {
    return { ok: false, error: { row, message: `${label} obrigatório` } };
  }
  return { ok: true, name: trimmed };
}
