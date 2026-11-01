import { formatCurrency } from "@rlpapp/shared";
import { createColumnHelper } from "@tanstack/react-table";
import { Archive, ArchiveRestore, Eye, MoreHorizontal, Pencil } from "lucide-react";

import { MaterialReplenishmentBadge } from "@/components/compras/material-replenishment-badge";
import type { MaterialCatalogRow } from "@/components/compras/material-form-dialog";
import { MaterialImageThumb } from "@/components/compras/material-image-thumb";
import { PriceChangeBadge } from "@/components/compras/price-change-badge";
import { PriceFreshnessBadge } from "@/components/compras/price-freshness-badge";
import { formatMaterialTitle } from "@/components/data-table/format-material-title";
import { SortableHeader } from "@/components/data-table/sortable-header";
import type { SortingTableFeatures } from "@/components/data-table/sorting-features";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const REPLENISHMENT_SORT_ORDER = {
  below_minimum: 0,
  reorder: 1,
  unconfigured: 2,
  healthy: 3,
} as const;

export type MaterialsColumnHandlers = {
  onOpenDetail: (material: MaterialCatalogRow) => void;
  onEdit: (material: MaterialCatalogRow) => void;
  onToggleActive: (material: MaterialCatalogRow) => void;
};

/** Situação efetiva do cadastro (status explícito ou derivado de `active`). */
export function materialStatusOf(
  material: Pick<MaterialCatalogRow, "status" | "active">
): "draft" | "active" | "archived" {
  return material.status ?? (material.active ? "active" : "archived");
}

/** Badge só para o que não é "ativo": rascunho ou arquivado. */
export function MaterialStatusBadge({
  material,
}: {
  material: Pick<MaterialCatalogRow, "status" | "active">;
}) {
  const status = materialStatusOf(material);
  if (status === "active") return null;
  return (
    <Badge variant={status === "draft" ? "outline" : "secondary"}>
      {status === "draft" ? "Rascunho" : "Arquivado"}
    </Badge>
  );
}

/** "Fornecedor preferido +2" ou "—". */
export function MaterialSuppliersSummary({
  material,
}: {
  material: Pick<MaterialCatalogRow, "supplierCount" | "preferredSupplierName">;
}) {
  if (material.supplierCount === 0 || !material.preferredSupplierName) {
    return <span className="text-muted-foreground">—</span>;
  }
  const extra = material.supplierCount - 1;
  return (
    <div className="min-w-0">
      <p className="truncate">{material.preferredSupplierName}</p>
      {extra > 0 ? (
        <p className="text-xs text-muted-foreground">
          +{extra} outro{extra === 1 ? "" : "s"}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Último preço utilizável com indicador de idade e variação em relação ao
 * preço anterior do mesmo fornecedor.
 */
export function MaterialLatestPrice({
  material,
}: {
  material: Pick<MaterialCatalogRow, "latestPrice">;
}) {
  const price = material.latestPrice;
  if (!price) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 tabular-nums">
        <span>
          {formatCurrency(price.unitPriceCents)}
          {price.unit ? (
            <span className="text-xs text-muted-foreground">/{price.unit}</span>
          ) : null}
        </span>
        <PriceChangeBadge change={price.change} />
      </p>
      <div className="mt-0.5 flex items-center gap-1.5">
        <PriceFreshnessBadge freshness={price.freshness} />
        <span className="truncate text-xs text-muted-foreground">
          {price.supplierName}
        </span>
      </div>
    </div>
  );
}

const columnHelper = createColumnHelper<
  SortingTableFeatures,
  MaterialCatalogRow
>();

export function createMaterialsColumns(handlers: MaterialsColumnHandlers) {
  return columnHelper.columns([
    columnHelper.accessor("name", {
      id: "name",
      header: ({ column }) => (
        <SortableHeader column={column} title="Material" />
      ),
      cell: ({ row }) => {
        const material = row.original;
        const title = formatMaterialTitle(material.name, material.variantLabel);
        const meta = [material.sku ?? "Sem SKU", material.manufacturer]
          .filter(Boolean)
          .join(" · ");
        return (
          <div className="flex max-w-80 items-start gap-2.5">
            <MaterialImageThumb imageUrl={material.imageUrl} alt={title} />
            <button
              type="button"
              className="group min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={() => handlers.onOpenDetail(material)}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground group-hover:text-primary">
                  {title}
                </span>
                <MaterialStatusBadge material={material} />
              </span>
              <p className="mt-1 font-mono text-[11px] tracking-wide text-muted-foreground tabular-nums">
                {meta}
              </p>
            </button>
          </div>
        );
      },
      sortFn: "text",
    }),
    columnHelper.accessor((row) => row.category ?? "", {
      id: "category",
      header: ({ column }) => (
        <SortableHeader column={column} title="Categoria" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.category ?? "—"}
        </span>
      ),
      sortFn: "text",
    }),
    columnHelper.accessor((row) => row.unit ?? "", {
      id: "unit",
      header: ({ column }) => (
        <SortableHeader column={column} title="Unidade" />
      ),
      cell: ({ row }) => {
        const { unit, purchaseUnit, unitsPerPurchaseUnit } = row.original;
        const showPurchase = purchaseUnit && purchaseUnit !== unit;
        return (
          <div>
            <span className="text-muted-foreground">{unit ?? "—"}</span>
            {showPurchase ? (
              <p className="text-xs text-muted-foreground/80">
                Compra: {purchaseUnit}
                {unitsPerPurchaseUnit != null
                  ? ` (${unitsPerPurchaseUnit} ${unit ?? "un"})`
                  : ""}
              </p>
            ) : null}
          </div>
        );
      },
      sortFn: "text",
    }),
    columnHelper.accessor("supplierCount", {
      id: "suppliers",
      header: ({ column }) => (
        <SortableHeader column={column} title="Fornecedores" />
      ),
      cell: ({ row }) => <MaterialSuppliersSummary material={row.original} />,
      sortFn: (rowA, rowB) =>
        rowB.original.supplierCount - rowA.original.supplierCount,
    }),
    columnHelper.accessor((row) => row.latestPrice?.unitPriceCents ?? null, {
      id: "latestPrice",
      header: ({ column }) => (
        <SortableHeader column={column} title="Último preço" />
      ),
      cell: ({ row }) => <MaterialLatestPrice material={row.original} />,
      sortFn: (rowA, rowB) =>
        (rowB.original.latestPrice?.occurredAt ?? 0) -
        (rowA.original.latestPrice?.occurredAt ?? 0),
    }),
    columnHelper.accessor("centralReplenishmentState", {
      id: "replenishment",
      header: ({ column }) => (
        <SortableHeader column={column} title="Reposição" />
      ),
      cell: ({ row }) => (
        <MaterialReplenishmentBadge
          tone="quiet"
          state={row.original.centralReplenishmentState}
          quantity={row.original.centralQuantity}
        />
      ),
      sortFn: (rowA, rowB) => {
        const a =
          REPLENISHMENT_SORT_ORDER[rowA.original.centralReplenishmentState];
        const b =
          REPLENISHMENT_SORT_ORDER[rowB.original.centralReplenishmentState];
        return a - b;
      },
    }),
    columnHelper.display({
      id: "actions",
      header: () => <span className="sr-only">Ações</span>,
      cell: ({ row }) => {
        const material = row.original;
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground"
                  >
                    <span className="sr-only">Abrir ações</span>
                    <MoreHorizontal className="size-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  onClick={() => handlers.onOpenDetail(material)}
                >
                  <Eye className="mr-2 size-4" />
                  Detalhes
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handlers.onEdit(material)}>
                  <Pencil className="mr-2 size-4" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handlers.onToggleActive(material)}
                >
                  {material.active ? (
                    <Archive className="mr-2 size-4" />
                  ) : (
                    <ArchiveRestore className="mr-2 size-4" />
                  )}
                  {material.active ? "Arquivar" : "Reativar"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    }),
  ]);
}
