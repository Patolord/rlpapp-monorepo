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

// --- Entrada de dados -----------------------------------------------------------

/** Centavos → texto editável pt-BR ("1.234,56"). */
export function toCurrencyInput(cents?: number | null): string {
  if (cents == null) return "";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

/** Texto pt-BR ("1.234,56" ou "1234.56") → centavos; null se inválido. */
export function parseCurrencyInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  const num = Number.parseFloat(normalized.replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}

/** Timestamp → "dd/mm/aaaa". */
export function toDateInput(ts?: number | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** "dd/mm/aaaa" → timestamp local (00:00); null se vazio/inválido. */
export function parseDateInput(value: string): number | null {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (d.getDate() !== Number(dd) || d.getMonth() !== Number(mm) - 1) return null;
  return d.getTime();
}

/** Aplica a máscara dd/mm/aaaa enquanto digita. */
export function maskDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join("/");
}

/** Só dígitos no CPF/CNPJ, formatado para exibição. */
export function formatTaxId(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return value;
}
