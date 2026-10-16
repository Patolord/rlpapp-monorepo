/** Rótulo de material com variante ("Tubo PVC — 100 mm"). */
export function formatMaterialLabel(name: string, variantLabel?: string | null): string {
  const variant = variantLabel?.trim();
  return variant ? `${name} — ${variant}` : name;
}

/** Quantidade com unidade ("12,5 m"). */
export function formatQty(quantity: number, unit: string | null): string {
  const formatted = quantity.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return unit ? `${formatted} ${unit}` : formatted;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} KB`;
  const mb = kb / 1024;
  return `${mb.toLocaleString("pt-BR", { maximumFractionDigits: mb < 10 ? 1 : 0 })} MB`;
}

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
