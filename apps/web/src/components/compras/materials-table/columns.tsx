import { createColumnHelper } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";

import { MaterialReplenishmentBadge } from "@/components/compras/material-replenishment-badge";
import type { MaterialCatalogRow } from "@/components/compras/material-form-dialog";
import { MaterialImageThumb } from "@/components/compras/material-image-thumb";
import { formatMaterialTitle } from "@/components/data-table/format-material-title";
import { SortableHeader } from "@/components/data-table/sortable-header";
import type { SortingTableFeatures } from "@/components/data-table/sorting-features";
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
        return (
          <div className="flex max-w-70 items-start gap-2.5">
            <MaterialImageThumb imageUrl={material.imageUrl} alt={title} />
            <button
              type="button"
              className="group min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={() => handlers.onOpenDetail(material)}
            >
              <p className="font-medium text-foreground group-hover:text-primary">
                {title}
              </p>
              <p className="mt-1 font-mono text-[11px] tracking-wide text-muted-foreground tabular-nums">
                {material.sku ?? "Sem SKU"}
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
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.unit ?? "—"}
        </span>
      ),
      sortFn: "text",
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
    columnHelper.accessor("active", {
      id: "status",
      header: ({ column }) => (
        <SortableHeader column={column} title="Status" />
      ),
      cell: ({ row }) => (
        <span
          className={
            row.original.active
              ? "text-xs text-muted-foreground"
              : "text-xs text-muted-foreground/70"
          }
        >
          {row.original.active ? "Ativo" : "Inativo"}
        </span>
      ),
      sortFn: (rowA, rowB) =>
        Number(rowB.original.active) - Number(rowA.original.active),
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
                  Detalhes
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handlers.onEdit(material)}>
                  Editar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handlers.onToggleActive(material)}
                >
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
