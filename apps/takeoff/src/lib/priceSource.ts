import type { CatalogEntry, LaborSource } from "./catalog";
import type { Item } from "./types";

export type PriceSource = NonNullable<Item["priceSource"]>;

/** What a catalog entry's price becomes on a line created from it. */
export function priceSourceOfEntry(entry: Pick<CatalogEntry, "source" | "kgPerUnit">): PriceSource {
  if (entry.kgPerUnit) return "weight";
  if (entry.source === "remote") return "catalog";
  if (entry.source === "saved") return "saved";
  return "seed";
}

const date = (ms?: number) => (ms ? ` em ${new Date(ms).toLocaleDateString("pt-BR")}` : "");

/** Short name of where a price came from, for badges. */
export const PRICE_SOURCE_LABEL: Record<PriceSource, string> = {
  catalog: "nuvem",
  saved: "salvo",
  seed: "planilhas",
  manual: "digitado",
  weight: "por peso",
};

/** Labour taken from the bundled sheets because the company catalog has none (tooltip line). */
export const SEED_LABOR_NOTE =
  "Mão de obra das planilhas anteriores: o catálogo da empresa ainda não tem mão de obra para este material";

/** Labour of an air terminal set to the usual installation price (tooltip line). */
export const DEFAULT_LABOR_NOTE =
  "Mão de obra padrão de boca de ar (R$ 45 por peça): o catálogo não tem mão de obra para este material";

/** The tooltip line of a borrowed labour price, if any. */
export const laborNote = (laborSource: LaborSource | undefined): string | undefined =>
  laborSource === "seed"
    ? SEED_LABOR_NOTE
    : laborSource === "default"
      ? DEFAULT_LABOR_NOTE
      : undefined;

/** One line saying where the material price came from, and when, for tooltips. */
export function describePriceSource(source: PriceSource | undefined, priceDate?: number): string {
  switch (source) {
    case "catalog":
      return `Preço do catálogo da empresa (nuvem)${priceDate ? ` · cotação${date(priceDate)}` : ""}`;
    case "saved":
      return `Preço do seu catálogo salvo neste computador${date(priceDate)}`;
    case "seed":
      return "Preço das planilhas anteriores (catálogo embutido no app)";
    case "manual":
      return `Preço digitado${date(priceDate)}`;
    case "weight":
      return "Preço por peso (kg × R$/kg do insumo, no rodapé do Ctrl+K)";
    default:
      return "Origem do preço não registrada (linha antiga)";
  }
}
