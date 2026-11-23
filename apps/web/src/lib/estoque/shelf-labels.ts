/**
 * Etiquetas de prateleira do estoque central: quais itens imprimir (busca e
 * prefixo de endereço), em que ordem (endereço natural: B3-2 antes de B3-12)
 * e em qual folha de etiquetas.
 */

export type ShelfLabelRow = {
  balanceId: string;
  materialId: string;
  sku: string | null;
  name: string;
  variantLabel: string | null;
  unit: string | null;
  physicalAddress: string | null;
  quantity: number;
};

export type ShelfLabelSheet = {
  key: "a4-3x8" | "a4-2x4" | "a4-recortar";
  label: string;
  description: string;
  columns: number;
  rows: number;
  /** Tamanho de cada etiqueta, em mm. */
  widthMm: number;
  heightMm: number;
  /** Espaço entre etiquetas (0 nas folhas adesivas, que já vêm cortadas). */
  gapMm: number;
  /** Borda de recorte (só na folha comum). */
  cutBorder: boolean;
  size: "small" | "large";
};

export const SHELF_LABEL_SHEETS: readonly ShelfLabelSheet[] = [
  {
    key: "a4-3x8",
    label: "Adesiva A4 · 24 por folha (70 × 37 mm)",
    description: "Prateleiras e gavetas.",
    columns: 3,
    rows: 8,
    widthMm: 70,
    heightMm: 37,
    gapMm: 0,
    cutBorder: false,
    size: "small",
  },
  {
    key: "a4-2x4",
    label: "Adesiva A4 · 8 por folha (105 × 74 mm)",
    description: "Caixas e bins grandes, leitura de longe.",
    columns: 2,
    rows: 4,
    widthMm: 105,
    heightMm: 74,
    gapMm: 0,
    cutBorder: false,
    size: "large",
  },
  {
    key: "a4-recortar",
    label: "Folha comum A4 · 21 por folha, para recortar",
    description: "Sem papel adesivo: recorte e use fita ou porta-etiqueta.",
    columns: 3,
    rows: 7,
    widthMm: 63,
    heightMm: 38,
    gapMm: 4,
    cutBorder: true,
    size: "small",
  },
];

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Ordem de endereço natural; itens sem endereço vão para o fim, por nome. */
export function compareShelfLabels(a: ShelfLabelRow, b: ShelfLabelRow): number {
  const addressA = a.physicalAddress?.trim() ?? "";
  const addressB = b.physicalAddress?.trim() ?? "";
  if (addressA && !addressB) return -1;
  if (!addressA && addressB) return 1;
  const byAddress = addressA.localeCompare(addressB, "pt-BR", { numeric: true, sensitivity: "base" });
  if (byAddress !== 0) return byAddress;
  return `${a.name} ${a.variantLabel ?? ""}`.localeCompare(`${b.name} ${b.variantLabel ?? ""}`, "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
}

export function filterShelfLabels(
  rows: readonly ShelfLabelRow[],
  filters: { search?: string; addressPrefix?: string; onlyInStock?: boolean }
): ShelfLabelRow[] {
  const search = normalize(filters.search);
  const prefix = normalize(filters.addressPrefix);
  return rows
    .filter((row) => !filters.onlyInStock || row.quantity > 0)
    .filter((row) => !prefix || normalize(row.physicalAddress).startsWith(prefix))
    .filter(
      (row) =>
        !search ||
        normalize([row.name, row.variantLabel, row.sku, row.physicalAddress].filter(Boolean).join(" ")).includes(search)
    )
    .sort(compareShelfLabels);
}

/** Etiquetas a imprimir (repetidas por cópia); itens sem SKU não têm QR. */
export function expandShelfLabels(rows: readonly ShelfLabelRow[], copies: number): ShelfLabelRow[] {
  const count = Math.min(Math.max(Math.floor(copies), 1), 10);
  return rows.filter((row) => row.sku).flatMap((row) => Array.from({ length: count }, () => row));
}
