import { api } from "@rlpapp/backend/convex/_generated/api";
import { formatCurrency } from "@rlpapp/shared";
import { Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";

import { useStableQuery } from "@/hooks/use-stable-query";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatSignedPercent } from "@/lib/quote-weeks";
import { cn } from "@/lib/utils";

type Week = FunctionReturnType<typeof api.quoteProposals.week>;
type Row = Week["rows"][number];
type Column = Week["columns"][number];

const BEST_CELL =
  "border-[var(--status-success)] bg-[color-mix(in_oklch,var(--status-success)_10%,transparent)]";

/**
 * Uma linha do mapa da rodada: o item, a referência (mediana de 6 meses, lida
 * por linha para o mapa não somar o histórico de todos os materiais numa
 * consulta só) e o preço de cada fornecedor, o menor em verde.
 */
export function QuoteWeekRow({ row, columns, now }: { row: Row; columns: Column[]; now: number }) {
  const reference = useStableQuery(
    api.priceEvents.materialReference,
    row.materialId && row.materialUnit ? { materialId: row.materialId, now } : "skip"
  );
  const referenceCents = reference?.medianCents ?? null;
  const cells = new Map(row.cells.map((cell) => [cell.supplierKey, cell]));
  const min = Math.min(...row.cells.map((cell) => cell.unitPriceCents));
  const subtitle = row.materialId
    ? [
        row.variantLabel ?? (row.familyName ? row.materialName : null),
        row.materialUnit ? null : `preço por ${row.unit ?? "outra unidade"}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : "sem material vinculado: revise na fila";

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col gap-0.5">
          {row.materialId ? (
            <Link
              to="/compras/historico/$materialId"
              params={{ materialId: row.materialId }}
              className="font-medium hover:text-primary hover:underline"
            >
              {row.familyName ?? row.materialName}
            </Link>
          ) : (
            <span className="font-medium">{row.rawDescription ?? "Sem descrição"}</span>
          )}
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {row.quantity ? `${row.quantity} ${row.unit ?? ""}` : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {referenceCents ? formatCurrency(Math.round(referenceCents)) : "—"}
      </TableCell>
      {columns.map((column) => {
        const cell = cells.get(column.supplierKey);
        if (!cell) {
          return (
            <TableCell key={column.supplierKey}>
              <div className="rounded-md border border-dashed px-2.5 py-1.5 text-xs text-muted-foreground">
                não cotou
              </div>
            </TableCell>
          );
        }
        const best = row.cheapestSupplierKey === column.supplierKey;
        const vsRef = referenceCents ? (cell.unitPriceCents - referenceCents) / referenceCents : null;
        return (
          <TableCell key={column.supplierKey}>
            <div className={cn("rounded-md border px-2.5 py-1.5", best && BEST_CELL)}>
              <div className="font-semibold tabular-nums">{formatCurrency(cell.unitPriceCents)}</div>
              <div className="text-xs text-muted-foreground">
                {best
                  ? "menor"
                  : row.cells.length > 1
                    ? `${formatSignedPercent((cell.unitPriceCents - min) / min)} sobre o menor`
                    : "só um fornecedor"}
                {vsRef !== null && Math.abs(vsRef) > 0.1 ? (
                  <span className="font-semibold text-amber-700 dark:text-amber-400">
                    {" "}· {formatSignedPercent(vsRef)} da ref.
                  </span>
                ) : null}
              </div>
            </div>
          </TableCell>
        );
      })}
    </TableRow>
  );
}
