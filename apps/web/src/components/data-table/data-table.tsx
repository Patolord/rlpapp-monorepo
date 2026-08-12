import {
  useTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import { type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import type { SortingTableFeatures } from "./sorting-features";

type DataTableProps<TData extends RowData> = {
  features: SortingTableFeatures;
  columns: ColumnDef<SortingTableFeatures, TData>[];
  data: TData[];
  getRowId: (row: TData) => string;
  isLoading?: boolean;
  empty?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  rowClassName?: (row: TData) => string | undefined;
  mobileRow?: (row: TData) => ReactNode;
};

export function DataTable<TData extends RowData>({
  features,
  columns,
  data,
  getRowId,
  isLoading = false,
  empty,
  toolbar,
  footer,
  rowClassName,
  mobileRow,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useTable({
    features,
    data,
    columns,
    getRowId,
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  });

  const rows = table.getRowModel().rows;
  const isEmpty = !isLoading && rows.length === 0;

  return (
    <div className="space-y-4">
      {toolbar}
      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        {isLoading ? (
          <LoadingSkeleton />
        ) : isEmpty ? (
          empty
        ) : (
          <>
            <div className={mobileRow ? "hidden md:block" : undefined}>
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-white/95 backdrop-blur supports-backdrop-filter:bg-white/80">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow
                      key={headerGroup.id}
                      className="hover:bg-transparent"
                    >
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id}>
                          {header.isPlaceholder ? null : (
                            <table.FlexRender header={header} />
                          )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className={cn(
                        "hover:bg-muted/50",
                        rowClassName?.(row.original)
                      )}
                    >
                      {row.getAllCells().map((cell) => (
                        <TableCell key={cell.id}>
                          <table.FlexRender cell={cell} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {mobileRow ? (
              <div className="space-y-3 p-3 md:hidden">
                {rows.map((row) => (
                  <div key={row.id}>{mobileRow(row.original)}</div>
                ))}
              </div>
            ) : null}
          </>
        )}
        {footer}
      </div>
    </div>
  );
}

export function DataTableLoadMore({
  status,
  onLoadMore,
}: {
  status: "CanLoadMore" | "LoadingMore" | string;
  onLoadMore: () => void;
}) {
  if (status !== "CanLoadMore" && status !== "LoadingMore") return null;
  return (
    <div className="border-t px-4 py-3 text-center">
      <Button
        variant="outline"
        disabled={status === "LoadingMore"}
        onClick={onLoadMore}
      >
        {status === "LoadingMore" ? "Carregando..." : "Carregar mais"}
      </Button>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-0 divide-y">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="hidden h-4 w-20 sm:block" />
          <Skeleton className="hidden h-4 w-12 md:block" />
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="hidden h-6 w-14 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}
