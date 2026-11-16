import type { PaginationOptions } from "convex/server";
import type { Infer } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import type { materialStatus } from "../../schema/procurement";
import { findInventoryLocation } from "./locations";
import {
  canViewCentralInventory,
  computeReplenishmentState,
  getStockPolicy,
} from "./stockPolicy";
import { materialMatchesSearch, toMaterialCatalogRow } from "../procurement/catalog";
import { buildPriceHistory } from "../procurement/priceHistory";
import { priceFreshness } from "../procurement/pricing";
import { normalizeText } from "../kernel/text";

export type ListMaterialCatalogInput = {
  search?: string;
  category?: string;
  activeOnly?: boolean;
  /** Filtro por situação do cadastro; "active" exclui rascunhos e arquivados. */
  status?: Infer<typeof materialStatus>;
  /** Referência de tempo para a idade do último preço (padrão: agora). */
  now?: number;
  paginationOpts: PaginationOptions;
};

async function summarizeSuppliers(ctx: QueryCtx, materialId: Id<"materials">) {
  const offerings = await ctx.db
    .query("supplierMaterials")
    .withIndex("by_material", (q) => q.eq("materialId", materialId))
    .collect();
  const active = offerings.filter((offering) => offering.active);
  const preferred = active.find((offering) => offering.preferred) ?? active[0];
  const supplier = preferred
    ? await ctx.db.get("suppliers", preferred.supplierId)
    : null;
  return {
    supplierCount: active.length,
    preferredSupplierName: supplier?.name ?? null,
  };
}

async function latestPriceFor(
  ctx: QueryCtx,
  material: Pick<Doc<"materials">, "_id" | "unit">,
  now: number
) {
  // Todo o histórico do material: o índice ordena por criação, não por
  // `occurredAt`, e a escolha segue o contrato de validade/revisão do repo.
  // A mesma série do detalhe (unidade do material), para a tabela e a
  // seção "Preços" nunca discordarem sobre o preço atual.
  const events = await ctx.db
    .query("priceEvents")
    .withIndex("by_material", (q) => q.eq("materialId", material._id))
    .collect();
  const history = buildPriceHistory(events, now, { materialUnit: material.unit });
  const event = history.current;
  if (!event) return null;
  let supplierName = event.supplierNameRaw ?? "Fornecedor";
  if (event.supplierId) {
    const supplier = await ctx.db.get("suppliers", event.supplierId);
    if (supplier) supplierName = supplier.name;
  }
  return {
    unitPriceCents: event.unitPriceCents,
    unit: event.unit ?? null,
    occurredAt: event.occurredAt,
    supplierName,
    freshness: priceFreshness(event.occurredAt, now),
    change: history.summary?.changeFromPrevious ?? null,
  };
}

/** Filtro de status do catálogo: ativo (sem rascunho), rascunho ou arquivado. */
function matchesCatalogStatus(
  material: Doc<"materials">,
  status: "draft" | "active" | "archived" | undefined
): boolean {
  if (!status) return true;
  const effective = material.status ?? (material.active ? "active" : "archived");
  return effective === status;
}

async function buildCatalogRow(
  ctx: QueryCtx,
  material: Doc<"materials">,
  options: { includeCentralStock: boolean; now?: number }
) {
  let centralQuantity: number | null = null;
  let centralReplenishmentState: "unconfigured" | "healthy" | "reorder" | "below_minimum" =
    "unconfigured";

  if (options.includeCentralStock) {
    const centralLocation = await findInventoryLocation(ctx, undefined);
    if (centralLocation) {
      const balance = await ctx.db
        .query("inventoryBalances")
        .withIndex("by_location_material", (q) =>
          q
            .eq("locationId", centralLocation._id)
            .eq("materialId", material._id)
        )
        .unique();
      centralQuantity = balance?.quantity ?? 0;
      const policy = await getStockPolicy(
        ctx,
        centralLocation._id,
        material._id
      );
      centralReplenishmentState = computeReplenishmentState(
        centralQuantity,
        policy
      ).state;
    }
  }

  const [imageUrl, suppliers, latestPrice] = await Promise.all([
    material.imageId ? ctx.storage.getUrl(material.imageId) : null,
    summarizeSuppliers(ctx, material._id),
    latestPriceFor(ctx, material, options.now ?? Date.now()),
  ]);

  return {
    ...toMaterialCatalogRow(material),
    imageUrl,
    centralReplenishmentState,
    centralQuantity,
    ...suppliers,
    latestPrice,
  };
}

/** Linha completa do catálogo para o detalhe de um material. */
export async function getMaterialCatalogRow(
  ctx: QueryCtx,
  user: Doc<"users">,
  materialId: Id<"materials">
) {
  const m = await ctx.db.get("materials", materialId);
  return m
    ? await buildCatalogRow(ctx, m, {
        includeCentralStock: canViewCentralInventory(user),
      })
    : null;
}

/** Página do catálogo com estoque central, fornecimento e último preço. */
export async function listMaterialCatalog(
  ctx: QueryCtx,
  user: Doc<"users">,
  args: ListMaterialCatalogInput
) {
  const includeCentralStock = canViewCentralInventory(user);
  const search = args.search?.trim();
  const category = args.category?.trim();
  const status = args.status;
  const activeOnly = Boolean(args.activeOnly) || status === "active";
  const searchQuery = search ? normalizeText(search) || search : undefined;

  /** Pagina em memória um conjunto já filtrado (cursor = deslocamento). */
  const paginateInMemory = (items: Doc<"materials">[]) => {
    const start = args.paginationOpts.cursor
      ? Number.parseInt(args.paginationOpts.cursor, 10)
      : 0;
    const next = start + args.paginationOpts.numItems;
    return {
      page: items.slice(start, next),
      isDone: next >= items.length,
      continueCursor: String(next),
    };
  };
  const matchesAll = (material: Doc<"materials">) =>
    (!activeOnly || material.active) &&
    matchesCatalogStatus(material, status) &&
    (!search || materialMatchesSearch(material, search));

  let results;
  if (status === "draft" || status === "archived") {
    // Conjuntos pequenos sem índice combinável com busca/categoria: coleta
    // os candidatos, filtra e só então pagina, para nenhuma página sair
    // curta enquanto ainda há itens depois do cursor.
    let candidates: Doc<"materials">[];
    if (searchQuery) {
      candidates = await ctx.db
        .query("materials")
        .withSearchIndex("search_text", (q) =>
          q.search("searchText", searchQuery)
        )
        .collect();
    } else if (category) {
      candidates = await ctx.db
        .query("materials")
        .withIndex("by_category", (q) => q.eq("category", category))
        .order("desc")
        .collect();
    } else {
      const byStatus = await ctx.db
        .query("materials")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
      // Linhas antigas arquivadas só têm `active: false`, sem `status`.
      const legacy =
        status === "archived"
          ? await ctx.db
              .query("materials")
              .withIndex("by_active", (q) => q.eq("active", false))
              .collect()
          : [];
      const seen = new Set<string>();
      candidates = [...byStatus, ...legacy]
        .filter((m) => (seen.has(m._id) ? false : (seen.add(m._id), true)))
        .sort((a, b) => b._creationTime - a._creationTime);
    }
    if (category) {
      candidates = candidates.filter((m) => m.category === category);
    }
    results = paginateInMemory(candidates.filter(matchesAll));
  } else if (searchQuery) {
    results = await ctx.db
      .query("materials")
      .withSearchIndex("search_text", (q) => {
        const queried = q.search("searchText", searchQuery);
        return activeOnly ? queried.eq("active", true) : queried;
      })
      .paginate(args.paginationOpts);
    // Só remove rascunhos marcados como ativos; nada fica além do cursor.
    results = { ...results, page: results.page.filter(matchesAll) };
  } else if (category) {
    const all = await ctx.db
      .query("materials")
      .withIndex("by_category", (q) => q.eq("category", category))
      .order("desc")
      .collect();
    results = paginateInMemory(all.filter(matchesAll));
  } else if (activeOnly) {
    results = await ctx.db
      .query("materials")
      .withIndex("by_active", (q) => q.eq("active", true))
      .order("desc")
      .paginate(args.paginationOpts);
    results = { ...results, page: results.page.filter(matchesAll) };
  } else {
    results = await ctx.db
      .query("materials")
      .order("desc")
      .paginate(args.paginationOpts);
  }

  const now = args.now ?? Date.now();
  return {
    ...results,
    page: await Promise.all(
      results.page.map(async (material) =>
        buildCatalogRow(ctx, material, { includeCentralStock, now })
      )
    ),
  };
}
