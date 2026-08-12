import { createColumnHelper } from "@tanstack/react-table";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

import { StockHealthBadge } from "@/components/compras/material-replenishment-badge";
import { formatMaterialTitle } from "@/components/data-table/format-material-title";
import { SortableHeader } from "@/components/data-table/sortable-header";
import type { SortingTableFeatures } from "@/components/data-table/sorting-features";
import { InventoryAddressDialog } from "@/components/estoque/inventory-address-dialog";

export type InventoryBalanceRow = FunctionReturnType<
  typeof api.inventory.listBalances
>["page"][number];

const HEALTH_SORT_ORDER = {
  below_minimum: 0,
  reorder: 1,
  unconfigured: 2,
  healthy: 3,
} as const;

export type BalancesColumnOptions = {
  quantityLabel: string;
  showLocation: boolean;
  canEditLocation: boolean;
};

const columnHelper = createColumnHelper<
  SortingTableFeatures,
  InventoryBalanceRow
>();

export function createBalancesColumns({
  quantityLabel,
  showLocation,
  canEditLocation,
}: BalancesColumnOptions) {
  return columnHelper.columns([
    columnHelper.accessor("materialName", {
      id: "material",
      header: ({ column }) => (
        <SortableHeader column={column} title="Material" />
      ),
      cell: ({ row }) => {
        const balance = row.original;
        return (
          <div className="max-w-70">
            <p className="font-medium text-foreground">
              {formatMaterialTitle(balance.materialName, balance.variantLabel)}
            </p>
            <p className="mt-1 font-mono text-[11px] tracking-wide text-muted-foreground tabular-nums">
              {balance.materialSku ?? "Sem SKU"}
            </p>
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
    columnHelper.accessor("quantity", {
      id: "quantity",
      header: ({ column }) => (
        <div className="text-right">
          <SortableHeader column={column} title={quantityLabel} />
        </div>
      ),
      cell: ({ row }) => (
        <span className="block text-right font-medium tabular-nums">
          {row.original.quantity} {row.original.unit ?? ""}
        </span>
      ),
      sortFn: "alphanumeric",
    }),
    columnHelper.accessor("replenishmentState", {
      id: "health",
      header: ({ column }) => (
        <SortableHeader column={column} title="Saúde" />
      ),
      cell: ({ row }) => (
        <StockHealthBadge
          tone="quiet"
          state={row.original.replenishmentState}
          suggestedOrderQuantity={row.original.suggestedOrderQuantity}
        />
      ),
      sortFn: (rowA, rowB) => {
        const a = HEALTH_SORT_ORDER[rowA.original.replenishmentState];
        const b = HEALTH_SORT_ORDER[rowB.original.replenishmentState];
        return a - b;
      },
    }),
    ...(showLocation
      ? [
          columnHelper.accessor((row) => row.physicalAddress ?? "", {
            id: "location",
            header: ({ column }) => (
              <SortableHeader column={column} title="Localização" />
            ),
            cell: ({ row }) => {
              const balance = row.original;
              if (canEditLocation) {
                return (
                  <InventoryAddressDialog
                    balanceId={balance._id}
                    materialName={formatMaterialTitle(
                      balance.materialName,
                      balance.variantLabel
                    )}
                    currentAddress={balance.physicalAddress}
                  />
                );
              }
              return (
                <span className="text-muted-foreground">
                  {balance.physicalAddress ?? "—"}
                </span>
              );
            },
            sortFn: "text",
          }),
        ]
      : []),
  ]);
}
