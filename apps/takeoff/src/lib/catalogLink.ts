import type { CatalogEntry } from "./catalog";
import { foldName } from "./text";
import type { Item } from "./types";

/**
 * How a budget line stands against the company catalog, for the items list:
 * - linked: created from a company material; same name and the catalog's current price.
 * - outdated: linked, but the catalog changed since (new quote, or the material left it).
 * - edited: linked, but renamed or priced by hand in this takeoff.
 * - draft: linked to a material purchasing has not validated yet.
 * - manual: no link: name and price of this takeoff only.
 */
export type CatalogLinkState = "linked" | "outdated" | "edited" | "draft" | "manual";

export interface CatalogLinkInfo {
  state: CatalogLinkState;
  /** One line per fact, for the tooltip. */
  title: string;
}

const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const day = (ms?: number) => (ms ? new Date(ms).toLocaleDateString("pt-BR") : undefined);

/**
 * The link state of an item. `remote` is the company catalog by material id; null when no
 * catalog was received yet (offline, signed out), and then a link is taken as it stands.
 * Items computed from a run (duct network, VRF system) have none: undefined.
 */
export function catalogLinkOf(
  item: Pick<
    Item,
    "name" | "catalogId" | "materialPrice" | "priceSource" | "priceDate" | "derived"
  >,
  remote: ReadonlyMap<string, CatalogEntry> | null,
): CatalogLinkInfo | undefined {
  if (item.derived) return undefined;
  if (!item.catalogId) {
    const source =
      item.priceSource === "weight"
        ? "preço por peso (R$/kg do insumo)"
        : item.priceSource === "saved"
          ? "preço do seu catálogo salvo neste computador"
          : "nome e preço próprios deste orçamento";
    return {
      state: "manual",
      title: `Sem vínculo com o catálogo da empresa: ${source}.`,
    };
  }
  if (!remote) {
    return {
      state: "linked",
      title:
        "Vinculado a um material do catálogo da empresa (catálogo ainda não carregado: atualize para conferir).",
    };
  }
  const entry = remote.get(item.catalogId);
  if (!entry) {
    return {
      state: "outdated",
      title:
        "Vinculado a um material que não está mais no catálogo da empresa: nome e preço ficaram como estavam.",
    };
  }
  const code = entry.sku ? ` ${entry.sku}` : "";
  if (entry.status === "draft") {
    return {
      state: "draft",
      title: `Material${code} proposto ao catálogo, aguardando compras.`,
    };
  }
  const edits: string[] = [];
  if (foldName(item.name) !== foldName(entry.name))
    edits.push(`nome editado (no catálogo: ${entry.name})`);
  if (item.priceSource === "manual")
    edits.push(`preço digitado (no catálogo: ${money(entry.materialPrice)})`);
  if (edits.length > 0) {
    return {
      state: "edited",
      title: `Vinculado ao material${code} do catálogo, mas editado aqui: ${edits.join("; ")}.`,
    };
  }
  if (Math.abs(item.materialPrice - entry.materialPrice) >= 0.005) {
    const quote = day(entry.priceDate);
    return {
      state: "outdated",
      title: `Vinculado ao material${code}, mas o preço do catálogo mudou: ${money(item.materialPrice)} aqui, ${money(entry.materialPrice)} no catálogo${quote ? ` (cotação de ${quote})` : ""}.`,
    };
  }
  const quote = day(item.priceDate ?? entry.priceDate);
  return {
    state: "linked",
    title: `Vinculado ao material${code} do catálogo da empresa: nome e preço atualizados${quote ? ` (cotação de ${quote})` : ""}.`,
  };
}
