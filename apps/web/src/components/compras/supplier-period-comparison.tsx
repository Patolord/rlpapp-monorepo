import {
  compareSuppliersByPeriod,
  supplierStandings,
  type PeriodGrouping,
  type QuoteSample,
} from "@rlpapp/shared/compras/priceReference";
import { formatCurrency, formatDate } from "@rlpapp/shared";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatSignedPercent, formatWeekRange } from "@/lib/quote-weeks";
import { cn } from "@/lib/utils";

const MONTH_LABEL = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

/**
 * O mesmo item cotado por fornecedores diferentes na mesma semana (ou mês):
 * uma linha por período, uma coluna por fornecedor, o menor em verde. Embaixo,
 * quantas vezes cada fornecedor foi o mais barato e quanto costuma ficar da
 * mediana.
 */
export function SupplierPeriodComparison({
  quotes,
  grouping,
  medianCents,
}: {
  quotes: QuoteSample[];
  grouping: PeriodGrouping;
  medianCents: number | null;
}) {
  if (quotes.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma cotação desta variante no período.</p>;
  }
  const periods = compareSuppliersByPeriod(quotes, grouping);
  const standings = supplierStandings(quotes, medianCents, grouping);

  return (
    <Table className="min-w-[720px]">
      <TableHeader>
        <TableRow>
          <TableHead>{grouping === "week" ? "Semana" : "Mês"}</TableHead>
          {standings.map((s) => (
            <TableHead key={s.supplierKey}>{s.supplierName}</TableHead>
          ))}
          <TableHead>Diferença</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {periods.map((period) => {
          const bySupplier = new Map(period.quotes.map((q) => [q.supplierKey, q]));
          return (
            <TableRow key={period.periodStart}>
              <TableCell className="whitespace-nowrap font-medium tabular-nums">
                {grouping === "week"
                  ? formatWeekRange(period.periodStart)
                  : MONTH_LABEL.format(period.periodStart + 12 * 3600 * 1000)}
              </TableCell>
              {standings.map((s) => {
                const quote = bySupplier.get(s.supplierKey);
                if (!quote) {
                  return (
                    <TableCell key={s.supplierKey} className="text-xs text-muted-foreground">
                      não cotou
                    </TableCell>
                  );
                }
                const best = period.cheapestSupplierKey === s.supplierKey;
                return (
                  <TableCell key={s.supplierKey}>
                    <div
                      className={cn(
                        "rounded-md border px-2.5 py-1.5",
                        best && "border-[var(--status-success)] bg-[color-mix(in_oklch,var(--status-success)_10%,transparent)]"
                      )}
                    >
                      <div className="font-semibold tabular-nums">{formatCurrency(quote.unitPriceCents)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(quote.occurredAt).slice(0, 5)}
                        {best
                          ? " · menor"
                          : period.cheapestSupplierKey
                            ? ` · ${formatSignedPercent((quote.unitPriceCents - period.minCents) / period.minCents)}`
                            : ""}
                      </div>
                    </div>
                  </TableCell>
                );
              })}
              <TableCell className="tabular-nums">
                {period.spread === null ? (
                  <span className="text-xs text-muted-foreground">um fornecedor só</span>
                ) : (
                  <>
                    <div className="font-semibold">{formatSignedPercent(period.spread).replace("+", "")}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatCurrency(period.maxCents - period.minCents)} entre o menor e o maior
                    </div>
                  </>
                )}
              </TableCell>
            </TableRow>
          );
        })}
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableCell className="text-xs font-medium text-muted-foreground">Mais barato em</TableCell>
          {standings.map((s) => (
            <TableCell key={s.supplierKey} className="text-sm font-semibold">
              {s.contested > 0 ? `${s.wins} de ${s.contested}` : "—"}
            </TableCell>
          ))}
          <TableCell className="text-xs text-muted-foreground">
            {grouping === "week" ? "semanas" : "meses"} com 2 ou mais fornecedores
          </TableCell>
        </TableRow>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableCell className="text-xs font-medium text-muted-foreground">Média vs mediana</TableCell>
          {standings.map((s) => (
            <TableCell key={s.supplierKey} className="text-sm">
              <span className="font-semibold">
                {s.averageVsMedian === null ? "—" : formatSignedPercent(s.averageVsMedian)}
              </span>
              <span className="text-muted-foreground"> · {s.quoteCount} cot.</span>
            </TableCell>
          ))}
          <TableCell className="text-xs text-muted-foreground">negativo = costuma cotar abaixo</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
