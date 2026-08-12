import { Package, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { StockHealthBadge } from "@/components/compras/material-replenishment-badge";
import {
  DataTable,
  DataTableLoadMore,
} from "@/components/data-table/data-table";
import { formatMaterialTitle } from "@/components/data-table/format-material-title";
import { sortingTableFeatures } from "@/components/data-table/sorting-features";
import { urgencyRailClass } from "@/components/data-table/urgency-rail";
import { InventoryAddressDialog } from "@/components/estoque/inventory-address-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  createBalancesColumns,
  type InventoryBalanceRow,
} from "./columns";

const ALL_CATEGORIES = "__all__";

export type BalancesCatalogStatus =
  | "LoadingFirstPage"
  | "CanLoadMore"
  | "LoadingMore"
  | "Exhausted";

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

type BalancesDataTableProps = {
  data: InventoryBalanceRow[];
  status: BalancesCatalogStatus;
  onLoadMore: () => void;
  showLocation: boolean;
  canEditLocation?: boolean;
  quantityLabel: string;
  searchPlaceholder: string;
  emptyMessage: string;
};

export function BalancesDataTable({
  data,
  status,
  onLoadMore,
  showLocation,
  canEditLocation = false,
  quantityLabel,
  searchPlaceholder,
  emptyMessage,
}: BalancesDataTableProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [category, setCategory] = useState("");

  const categories = useMemo(() => {
    const values = new Set<string>();
    for (const row of data) {
      const value = row.category?.trim();
      if (value) values.add(value);
    }
    return [...values].sort((a, b) =>
      a.localeCompare(b, "pt-BR", { sensitivity: "base" })
    );
  }, [data]);

  const filtered = useMemo(() => {
    const term = debouncedSearch.trim().toLocaleLowerCase("pt-BR");
    return data.filter((balance) => {
      if (category && balance.category !== category) return false;
      if (!term) return true;
      const title = formatMaterialTitle(
        balance.materialName,
        balance.variantLabel
      ).toLocaleLowerCase("pt-BR");
      return (
        title.includes(term) ||
        balance.materialName.toLocaleLowerCase("pt-BR").includes(term) ||
        balance.variantLabel?.toLocaleLowerCase("pt-BR").includes(term) ||
        balance.materialSku?.toLocaleLowerCase("pt-BR").includes(term) ||
        balance.category?.toLocaleLowerCase("pt-BR").includes(term) ||
        balance.physicalAddress?.toLocaleLowerCase("pt-BR").includes(term)
      );
    });
  }, [data, debouncedSearch, category]);

  const columns = useMemo(
    () =>
      createBalancesColumns({
        quantityLabel,
        showLocation,
        canEditLocation,
      }),
    [quantityLabel, showLocation, canEditLocation]
  );

  const categoryItems = useMemo(
    () => ({
      [ALL_CATEGORIES]: "Todas as categorias",
      ...Object.fromEntries(categories.map((item) => [item, item])),
    }),
    [categories]
  );

  const isLoading = status === "LoadingFirstPage";
  const hasActiveFilters = Boolean(debouncedSearch.trim()) || Boolean(category);

  return (
    <DataTable
      features={sortingTableFeatures}
      columns={columns}
      data={filtered}
      getRowId={(row) => row._id}
      isLoading={isLoading}
      empty={
        <EmptyState
          hasActiveFilters={hasActiveFilters}
          emptyMessage={emptyMessage}
        />
      }
      toolbar={
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={searchPlaceholder}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            {categories.length > 0 ? (
              <Select
                value={category || ALL_CATEGORIES}
                items={categoryItems}
                onValueChange={(value) =>
                  setCategory(value === ALL_CATEGORIES ? "" : value)
                }
              >
                <SelectTrigger className="h-10 w-full bg-white sm:w-56">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CATEGORIES}>
                    Todas as categorias
                  </SelectItem>
                  {categories.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
          {!isLoading && filtered.length > 0 ? (
            <p className="text-xs text-muted-foreground tabular-nums">
              {filtered.length} nesta página
            </p>
          ) : null}
        </div>
      }
      footer={<DataTableLoadMore status={status} onLoadMore={onLoadMore} />}
      rowClassName={(row) => urgencyRailClass(row.replenishmentState)}
      mobileRow={(balance) => (
        <div
          className={cn(
            "rounded-xl border bg-white p-4 shadow-sm",
            urgencyRailClass(balance.replenishmentState)
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">
                {formatMaterialTitle(
                  balance.materialName,
                  balance.variantLabel
                )}
              </p>
              <p className="mt-1 font-mono text-[11px] tracking-wide text-muted-foreground tabular-nums">
                {balance.materialSku ?? "Sem SKU"}
              </p>
            </div>
            <span className="shrink-0 text-sm font-medium tabular-nums">
              {balance.quantity} {balance.unit ?? ""}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>{balance.category ?? "Sem categoria"}</span>
            <StockHealthBadge
              tone="quiet"
              state={balance.replenishmentState}
              suggestedOrderQuantity={balance.suggestedOrderQuantity}
            />
          </div>
          {showLocation ? (
            <div className="mt-3">
              {canEditLocation ? (
                <InventoryAddressDialog
                  balanceId={balance._id}
                  materialName={formatMaterialTitle(
                    balance.materialName,
                    balance.variantLabel
                  )}
                  currentAddress={balance.physicalAddress}
                />
              ) : (
                <span className="text-sm text-muted-foreground">
                  {balance.physicalAddress ?? "Sem localização"}
                </span>
              )}
            </div>
          ) : null}
        </div>
      )}
    />
  );
}

function EmptyState({
  hasActiveFilters,
  emptyMessage,
}: {
  hasActiveFilters: boolean;
  emptyMessage: string;
}) {
  if (hasActiveFilters) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
        <Search className="size-8 text-muted-foreground/50" />
        <p className="font-medium">Nenhum material encontrado</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Ajuste a busca, a categoria ou limpe os filtros para ver outros itens.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <Package className="size-8 text-muted-foreground/50" />
      <p className="font-medium">{emptyMessage}</p>
    </div>
  );
}
