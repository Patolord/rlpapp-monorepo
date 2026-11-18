import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import {
  DAY_MS,
  type PeriodGrouping,
  type ReferenceStats,
} from "@rlpapp/shared/compras/priceReference";
import { formatCurrency, formatDate } from "@rlpapp/shared";
import { Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { PRICE_SOURCE_LABELS } from "@/components/compras/material-price-history";
import {
  PriceHistoryChart,
  type ChartSeries,
  type ChartShape,
} from "@/components/compras/price-history-chart";
import { SupplierPeriodComparison } from "@/components/compras/supplier-period-comparison";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCan } from "@/hooks/use-can";
import { useNow } from "@/hooks/use-now";
import { getErrorMessage } from "@/lib/errors";
import { formatPercent, formatSignedPercent, toWeekParam } from "@/lib/quote-weeks";
import { cn } from "@/lib/utils";

type History = FunctionReturnType<typeof api.priceEvents.familyHistory>;
type Variant = History["variants"][number];

const SHAPES: ChartShape[] = ["circle", "square", "diamond", "triangle"];
const COLORS = ["var(--chart-5)", "var(--chart-3)", "var(--chart-4)", "var(--chart-2)"];
const MONTHS_BACK = 12;

export function variantLabel(variant: Pick<Variant, "variantLabel" | "manufacturer" | "name">): string {
  return variant.variantLabel ?? variant.manufacturer ?? variant.name;
}

const STATUS_NOTE: Record<ReferenceStats["status"], { label: string; dot: string }> = {
  ok: { label: "Dentro da tolerância de 10%", dot: "var(--status-success)" },
  wide: { label: "Acima de 10%: cote de novo", dot: "var(--status-warning)" },
  stale: { label: "Sem cotação há mais de 90 dias", dot: "var(--status-warning)" },
};

/**
 * Histórico de preços de um equipamento comparável (a família do material):
 * referência de orçamento, gráfico de todas as variantes, comparação dos
 * fornecedores na mesma semana e a lista de cotações.
 */
export function FamilyPriceHistory({ materialId }: { materialId: Id<"materials"> }) {
  const now = useNow();
  const history = useQuery(api.priceEvents.familyHistory, {
    materialId,
    now,
    monthsBack: MONTHS_BACK,
  });
  const [selected, setSelected] = useState<Id<"materials"> | null>(null);
  const [grouping, setGrouping] = useState<PeriodGrouping>("week");
  const canSetDefault = useCan("precos.write");
  const setDefault = useMutation(api.priceEvents.setFamilyDefaultVariant);

  if (history === undefined) {
    return <p className="text-sm text-muted-foreground">Carregando histórico…</p>;
  }

  const current =
    history.variants.find((v) => v.materialId === selected) ??
    history.variants.find((v) => v.materialId === materialId && !history.defaultMaterialId) ??
    history.variants.find((v) => v.isDefault) ??
    history.variants.find((v) => v.reference) ??
    history.variants[0];
  if (!current) {
    return <p className="text-sm text-muted-foreground">Nenhuma variante ativa nesta família.</p>;
  }

  const series: ChartSeries[] = history.variants.map((variant, index) => ({
    key: variant.materialId,
    label: variantLabel(variant),
    shape: SHAPES[index % SHAPES.length]!,
    color: COLORS[index % COLORS.length]!,
    dimmed: false,
    quotes: history.quotes
      .filter((q) => q.materialId === variant.materialId)
      .map((q) => ({
        occurredAt: q.occurredAt,
        unitPriceCents: q.unitPriceCents,
        bought: q.source === "purchase",
      })),
  }));
  const variantQuotes = history.quotes.filter((q) => q.materialId === current.materialId);
  const reference = current.reference;
  const medians = new Map(
    history.variants.map((v) => [v.materialId, v.reference?.medianCents ?? null])
  );
  const variantsById = new Map(history.variants.map((v) => [v.materialId, v]));

  async function makeDefault(variant: Variant) {
    if (!history?.family) return;
    try {
      await setDefault({ familyId: history.family._id, materialId: variant.materialId });
      toast.success(`${variantLabel(variant)} é a referência da família`);
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao definir a referência"));
    }
  }

  return (
    <div className="space-y-5">
      <Card className="gap-0 py-0">
        <div className="grid divide-y sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          <Metric label="Preço de referência para orçamento">
            <span className="text-2xl font-semibold tabular-nums">
              {reference ? formatCurrency(Math.round(reference.medianCents)) : "—"}
            </span>
            <span className="text-xs text-muted-foreground">
              {variantLabel(current)}
              {reference
                ? ` · mediana de ${reference.count} cotações de ${reference.supplierCount} fornecedores em 6 meses`
                : " · sem cotação nos últimos 6 meses"}
              {reference?.truncated ? " · amostra das 500 cotações mais recentes" : ""}
            </span>
          </Metric>
          <Metric label="Dispersão das cotações">
            <span className="text-2xl font-semibold tabular-nums">
              {reference ? formatPercent(reference.spread) : "—"}
            </span>
            {reference ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full" style={{ background: STATUS_NOTE[reference.status].dot }} />
                {STATUS_NOTE[reference.status].label}
              </span>
            ) : null}
          </Metric>
          <Metric label="Variação mensal">
            <span className="text-2xl font-semibold tabular-nums">
              {reference?.monthlyChange != null ? `${formatSignedPercent(reference.monthlyChange)} ao mês` : "—"}
            </span>
            <span className="text-xs text-muted-foreground">
              {reference?.totalChange != null
                ? `${formatSignedPercent(reference.totalChange)} da primeira à última semana cotada`
                : "precisa de cotações em semanas diferentes"}
            </span>
          </Metric>
          <Metric label="Última cotação">
            <span className="text-2xl font-semibold tabular-nums">
              {reference ? formatDate(reference.lastAt) : "—"}
            </span>
            <span className="text-xs text-muted-foreground">
              {reference ? `há ${Math.max(0, Math.floor((now - reference.lastAt) / DAY_MS))} dias` : ""}
            </span>
          </Metric>
        </div>
      </Card>

      <div className="flex flex-wrap gap-5">
        <Card className="min-w-0 flex-[999_1_560px]">
          <CardHeader>
            <CardTitle className="text-base">Cotações no tempo</CardTitle>
            <p className="text-xs text-muted-foreground">
              Pontos empilhados são fornecedores diferentes na mesma semana; a linha passa pela mediana de cada
              semana. A faixa marca ±5% da referência; o anel verde, uma compra.
            </p>
          </CardHeader>
          <CardContent>
            <PriceHistoryChart
              series={series}
              from={now - MONTHS_BACK * 30.44 * DAY_MS}
              now={now}
              referenceCents={reference?.medianCents ?? null}
            />
          </CardContent>
        </Card>

        <Card className="min-w-0 flex-[1_1_320px]">
          <CardHeader>
            <CardTitle className="text-base">Variantes</CardTitle>
            <p className="text-xs text-muted-foreground">
              Marca, ciclo e tecnologia. A variante padrão é a referência do orçamento no takeoff.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.variants.map((variant) => (
              <VariantRow
                key={variant.materialId}
                variant={variant}
                selected={variant.materialId === current.materialId}
                onSelect={() => setSelected(variant.materialId)}
                onMakeDefault={canSetDefault && history.family && !variant.isDefault ? () => void makeDefault(variant) : null}
              />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Fornecedores na mesma {grouping === "week" ? "semana" : "mês"}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {variantLabel(current)} · o menor preço de cada período em verde, com a data da cotação embaixo.
            </p>
          </div>
          <Select value={grouping} onValueChange={(v) => setGrouping((v ?? "week") as PeriodGrouping)}>
            <SelectTrigger className="w-36" aria-label="Agrupar por">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Por semana</SelectItem>
              <SelectItem value="month">Por mês</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <SupplierPeriodComparison
            quotes={variantQuotes}
            grouping={grouping}
            medianCents={reference?.medianCents ?? null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Todas as cotações</CardTitle>
          <p className="text-xs text-muted-foreground">
            {history.quotes.length} cotações de fornecedores dos últimos {MONTHS_BACK} meses, mais recentes
            primeiro.
            {history.historyTruncated
              ? " Alguma variante tem mais cotações do que a página carrega: aparecem as mais recentes A referência tem leitura própria dos 6 meses e avisa no resumo quando também é amostra."
              : ""}
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Variante</TableHead>
                <TableHead className="text-right">Preço un.</TableHead>
                <TableHead className="text-right">vs mediana</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Semana</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.quotes.map((quote) => {
                const med = medians.get(quote.materialId) ?? null;
                const delta = med ? (quote.unitPriceCents - med) / med : null;
                const variant = variantsById.get(quote.materialId);
                return (
                  <TableRow key={quote._id}>
                    <TableCell className="tabular-nums">{formatDate(quote.occurredAt)}</TableCell>
                    <TableCell>{quote.supplierName}</TableCell>
                    <TableCell className="font-medium">{variant ? variantLabel(variant) : "—"}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatCurrency(quote.unitPriceCents)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        delta !== null && Math.abs(delta) > 0.1 && "font-semibold text-amber-700 dark:text-amber-400"
                      )}
                    >
                      {delta === null ? "—" : formatSignedPercent(delta)}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {quote.validUntil ? formatDate(quote.validUntil) : "—"}
                    </TableCell>
                    <TableCell>{PRICE_SOURCE_LABELS[quote.source]}</TableCell>
                    <TableCell>
                      <Link
                        to="/compras/cotacoes/$semana"
                        params={{ semana: toWeekParam(quote.occurredAt) }}
                        className="text-primary hover:underline"
                      >
                        {toWeekParam(quote.occurredAt).split("-").reverse().slice(0, 2).join("/")}
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-5 py-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function VariantRow({
  variant,
  selected,
  onSelect,
  onMakeDefault,
}: {
  variant: Variant;
  selected: boolean;
  onSelect: () => void;
  onMakeDefault: (() => void) | null;
}) {
  const reference = variant.reference;
  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        selected ? "border-primary bg-primary/5" : "hover:border-primary/40"
      )}
    >
      <button type="button" onClick={onSelect} aria-pressed={selected} className="flex w-full flex-col gap-1 text-left">
        <span className="flex w-full items-baseline justify-between gap-3">
          <span className="text-sm font-semibold">{variantLabel(variant)}</span>
          <span className="whitespace-nowrap font-semibold tabular-nums">
            {reference ? formatCurrency(Math.round(reference.medianCents)) : "—"}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">
          {reference
            ? `${formatCurrency(reference.minCents)} a ${formatCurrency(reference.maxCents)} · ${reference.count} cotações de ${reference.supplierCount} fornecedores`
            : "sem cotação nos últimos 6 meses"}
        </span>
      </button>
      <div className="mt-1.5 flex items-center justify-between text-xs">
        {variant.isDefault ? (
          <span className="font-semibold text-primary">Referência do orçamento</span>
        ) : onMakeDefault ? (
          <button type="button" onClick={onMakeDefault} className="text-primary hover:underline">
            Usar como referência
          </button>
        ) : (
          <span />
        )}
        {variant.sku ? <span className="text-muted-foreground">{variant.sku}</span> : null}
      </div>
    </div>
  );
}
