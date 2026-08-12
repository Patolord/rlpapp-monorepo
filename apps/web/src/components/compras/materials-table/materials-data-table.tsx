import { Package, Plus, Search } from "lucide-react";
import { useMemo } from "react";

import type { MaterialCatalogRow } from "@/components/compras/material-form-dialog";
import { MaterialImageThumb } from "@/components/compras/material-image-thumb";
import { MaterialReplenishmentBadge } from "@/components/compras/material-replenishment-badge";
import {
  DataTable,
  DataTableLoadMore,
} from "@/components/data-table/data-table";
import { formatMaterialTitle } from "@/components/data-table/format-material-title";
import { sortingTableFeatures } from "@/components/data-table/sorting-features";
import { urgencyRailClass } from "@/components/data-table/urgency-rail";
import { Button } from "@/components/ui/button";
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
  createMaterialsColumns,
  type MaterialsColumnHandlers,
} from "./columns";

const ALL_CATEGORIES = "__all__";

export type MaterialsCatalogStatus =
  | "LoadingFirstPage"
  | "CanLoadMore"
  | "LoadingMore"
  | "Exhausted";

type MaterialsDataTableProps = MaterialsColumnHandlers & {
  data: MaterialCatalogRow[];
  status: MaterialsCatalogStatus;
  search: string;
  onSearchChange: (value: string) => void;
  category: string;
  onCategoryChange: (value: string) => void;
  categories: string[];
  activeOnly: boolean;
  onActiveOnlyChange: (value: boolean) => void;
  onLoadMore: () => void;
  onCreate: () => void;
  hasActiveFilters: boolean;
};

export function MaterialsDataTable({
  data,
  status,
  search,
  onSearchChange,
  category,
  onCategoryChange,
  categories,
  activeOnly,
  onActiveOnlyChange,
  onLoadMore,
  onCreate,
  hasActiveFilters,
  onOpenDetail,
  onEdit,
  onToggleActive,
}: MaterialsDataTableProps) {
  const columns = useMemo(
    () =>
      createMaterialsColumns({
        onOpenDetail,
        onEdit,
        onToggleActive,
      }),
    [onOpenDetail, onEdit, onToggleActive]
  );

  const categoryItems = useMemo(
    () => ({
      [ALL_CATEGORIES]: "Todas as categorias",
      ...Object.fromEntries(categories.map((item) => [item, item])),
    }),
    [categories]
  );

  const isLoading = status === "LoadingFirstPage";
  const isEmpty = !isLoading && data.length === 0;

  return (
    <DataTable
      features={sortingTableFeatures}
      columns={columns}
      data={data}
      getRowId={(row) => row._id}
      isLoading={isLoading}
      empty={
        <EmptyState
          hasActiveFilters={hasActiveFilters}
          activeOnly={activeOnly}
          onCreate={onCreate}
        />
      }
      toolbar={
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nome, SKU, fabricante..."
                aria-label="Buscar materiais"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </div>
            <Select
              value={category || ALL_CATEGORIES}
              items={categoryItems}
              onValueChange={(value) =>
                onCategoryChange(value === ALL_CATEGORIES ? "" : value)
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
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-md border bg-white p-0.5">
              <Button
                type="button"
                size="sm"
                variant={!activeOnly ? "secondary" : "ghost"}
                className="h-8"
                onClick={() => onActiveOnlyChange(false)}
              >
                Todos
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activeOnly ? "secondary" : "ghost"}
                className="h-8"
                onClick={() => onActiveOnlyChange(true)}
              >
                Ativos
              </Button>
            </div>
            {!isLoading && !isEmpty ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                {data.length} nesta página
              </p>
            ) : null}
          </div>
        </div>
      }
      footer={<DataTableLoadMore status={status} onLoadMore={onLoadMore} />}
      rowClassName={(row) => urgencyRailClass(row.centralReplenishmentState)}
      mobileRow={(material) => {
        const title = formatMaterialTitle(material.name, material.variantLabel);
        return (
          <div
            className={cn(
              "flex w-full items-start gap-3 rounded-xl border bg-white p-4 shadow-sm transition-colors hover:bg-muted/30",
              urgencyRailClass(material.centralReplenishmentState)
            )}
          >
            <MaterialImageThumb imageUrl={material.imageUrl} alt={title} />
            <button
              type="button"
              className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={() => onOpenDetail(material)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{title}</p>
                  <p className="mt-1 font-mono text-[11px] tracking-wide text-muted-foreground tabular-nums">
                    {material.sku ?? "Sem SKU"}
                  </p>
                </div>
                <span
                  className={
                    material.active
                      ? "text-xs text-muted-foreground"
                      : "text-xs text-muted-foreground/70"
                  }
                >
                  {material.active ? "Ativo" : "Inativo"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span>{material.category ?? "Sem categoria"}</span>
                <span>{material.unit ?? "—"}</span>
                <MaterialReplenishmentBadge
                  tone="quiet"
                  state={material.centralReplenishmentState}
                  quantity={material.centralQuantity}
                />
              </div>
            </button>
          </div>
        );
      }}
    />
  );
}

function EmptyState({
  hasActiveFilters,
  activeOnly,
  onCreate,
}: {
  hasActiveFilters: boolean;
  activeOnly: boolean;
  onCreate: () => void;
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
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <Package className="size-8 text-muted-foreground/50" />
      <p className="font-medium">
        {activeOnly ? "Nenhum material ativo" : "Catálogo vazio"}
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {activeOnly
          ? "Mostre todos os materiais ou cadastre um novo item."
          : "Cadastre o primeiro material ou use Importar CSV no topo da página."}
      </p>
      <Button className="mt-2" onClick={onCreate}>
        <Plus className="mr-2 size-4" />
        Novo material
      </Button>
    </div>
  );
}
