import type { Column, RowData } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { SortingTableFeatures } from "./sorting-features";

export function SortableHeader<TData extends RowData, TValue = unknown>({
  column,
  title,
}: {
  column: Column<SortingTableFeatures, TData, TValue>;
  title: string;
}) {
  const sorted = column.getIsSorted();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 h-8 px-2 text-muted-foreground hover:text-foreground"
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {title}
      <ArrowUpDown
        className={`ml-1 size-3.5 ${sorted ? "text-foreground" : "opacity-40"}`}
      />
    </Button>
  );
}
