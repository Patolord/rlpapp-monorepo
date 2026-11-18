import type { api } from "@rlpapp/backend/convex/_generated/api";
import { formatCurrency, formatDate } from "@rlpapp/shared";
import { Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatSignedPercent, supplierTotals } from "@/lib/quote-weeks";
import { cn } from "@/lib/utils";

type Week = FunctionReturnType<typeof api.quoteProposals.week>;
type Column = Week["columns"][number];

const FREIGHT_LABEL = { cif: "frete CIF", fob: "frete FOB" } as const;
const BEST_CELL =
  "border-[var(--status-success)] bg-[color-mix(in_oklch,var(--status-success)_10%,transparent)]";

function proposalTerms(column: Column): string {
  const proposal = column.proposals[0];
  if (!proposal) return "lançado sem proposta";
  return (
    [proposal.paymentTerms, proposal.freight ? FREIGHT_LABEL[proposal.freight] : null]
      .filter(Boolean)
      .join(" · ") || "condição não informada"
  );
}

/**
 * Mapa da rodada: um cartão por fornecedor (data, validade, condição, total)
 * e a tabela item × fornecedor com o menor preço de cada linha em verde.
 */
export function QuoteWeekMap({ week, now }: { week: Week; now: number }) {
  if (week.rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nenhum preço registrado nesta semana.
        </CardContent>
      </Card>
    );
  }
  const keys = week.columns.map((column) => column.supplierKey);
  const totals = supplierTotals(week.rows, keys);
  const commonTotals = keys.map((key) => totals.bySupplier.get(key)!.commonCents);
  const bestCommon = totals.commonRows > 0 && keys.length > 1 ? Math.min(...commonTotals) : null;

  return (
    <div className="space-y-5">
      <section aria-label="Propostas" className="flex flex-wrap gap-4">
        {week.columns.map((column, index) => {
          const proposal = column.proposals[0];
          const expired = proposal?.validUntil != null && proposal.validUntil < now;
          const common = commonTotals[index]!;
          const supplier = totals.bySupplier.get(column.supplierKey)!;
          return (
            <Card key={column.supplierKey} className="min-w-0 flex-[1_1_260px] gap-2 py-4">
              <CardHeader className="px-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{column.supplierName}</CardTitle>
                  {proposal?.validUntil ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium">
                      <span
                        className="size-1.5 rounded-full"
                        style={{ background: expired ? "var(--status-warning)" : "var(--status-info)" }}
                      />
                      {expired ? "Venceu em" : "Válida até"} {formatDate(proposal.validUntil).slice(0, 5)}
                    </span>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5 px-4 text-sm">
                <Row label="Recebida em">
                  {column.firstAt === column.lastAt
                    ? formatDate(column.firstAt)
                    : `${formatDate(column.firstAt).slice(0, 5)} a ${formatDate(column.lastAt)}`}
                </Row>
                <Row label="Condição">{proposalTerms(column)}</Row>
                <Row label="Itens com quantidade">
                  {supplier.quotedRows} cotados{supplier.missingRows ? ` · faltam ${supplier.missingRows}` : ""}
                </Row>
                {totals.commonRows > 0 && keys.length > 1 ? (
                  <Row label={`Nos ${totals.commonRows} itens que todos cotaram`}>
                    <strong className={cn("font-semibold tabular-nums", common === bestCommon && "text-[var(--status-success)]")}>
                      {formatCurrency(common)}
                      {bestCommon !== null && bestCommon > 0
                        ? common === bestCommon
                          ? " · menor"
                          : ` · ${formatSignedPercent((common - bestCommon) / bestCommon)}`
                        : ""}
                    </strong>
                  </Row>
                ) : null}
                {proposal?.reference ? <Row label="Nº da proposta">{proposal.reference}</Row> : null}
              </CardContent>
            </Card>
          );
        })}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mapa de cotação</CardTitle>
          <p className="text-xs text-muted-foreground">
            Mesmo item, mesma semana, um preço por fornecedor (o mais recente dele na semana). Verde = menor preço
            da linha. Referência = mediana dos últimos 6 meses.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Referência</TableHead>
                {week.columns.map((column) => (
                  <TableHead key={column.supplierKey}>{column.supplierName}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {week.rows.map((row) => {
                const cells = new Map(row.cells.map((cell) => [cell.supplierKey, cell]));
                const min = Math.min(...row.cells.map((cell) => cell.unitPriceCents));
                return (
                  <TableRow key={row.rowKey}>
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
                        <span className="text-xs text-muted-foreground">
                          {row.materialId
                            ? (row.variantLabel ?? (row.familyName ? row.materialName : null) ?? "")
                            : "sem material vinculado: revise na fila"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.quantity ? `${row.quantity} ${row.unit ?? ""}` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.referenceCents ? formatCurrency(Math.round(row.referenceCents)) : "—"}
                    </TableCell>
                    {week.columns.map((column) => {
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
                      const vsRef = row.referenceCents ? (cell.unitPriceCents - row.referenceCents) / row.referenceCents : null;
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
              })}
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableCell colSpan={3} className="font-medium">
                  Total dos itens com quantidade
                </TableCell>
                {week.columns.map((column) => {
                  const supplier = totals.bySupplier.get(column.supplierKey)!;
                  return (
                    <TableCell key={column.supplierKey} className="tabular-nums">
                      <div className="font-semibold">{formatCurrency(Math.round(supplier.quotedCents))}</div>
                      {supplier.missingRows ? (
                        <div className="text-xs text-muted-foreground">
                          falta{supplier.missingRows > 1 ? "m" : ""} {supplier.missingRows} {supplier.missingRows > 1 ? "itens" : "item"}
                        </div>
                      ) : null}
                    </TableCell>
                  );
                })}
              </TableRow>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableCell colSpan={3} className="font-medium">
                  Comprando o menor de cada item
                </TableCell>
                <TableCell colSpan={week.columns.length} className="font-semibold tabular-nums text-[var(--status-success)]">
                  {formatCurrency(totals.cheapestMixCents)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
