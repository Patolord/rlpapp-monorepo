import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { formatCurrency, formatDate } from "@rlpapp/shared";
import { useQuery } from "convex/react";
import { useState } from "react";

import {
  PriceChangeBadge,
  type PriceChange,
} from "@/components/compras/price-change-badge";
import { PriceFreshnessBadge } from "@/components/compras/price-freshness-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PriceHistory = FunctionReturnType<
  typeof api.priceEvents.historyForMaterial
>;
type PricePoint = PriceHistory["points"][number];

export const PRICE_SOURCE_LABELS: Record<PricePoint["source"], string> = {
  manual: "Manual",
  quote: "Cotação",
  purchase: "Compra",
  invoice: "Nota fiscal",
  whatsapp: "WhatsApp",
  supplier_form: "Formulário",
  excel_import: "Planilha",
};

const RECENT_LIMIT = 6;

/**
 * Histórico de preços do material: resumo (atual, variações, mín/máx),
 * linha do tempo, último preço por fornecedor e os eventos recentes.
 */
export function MaterialPriceHistory({
  materialId,
}: {
  materialId: Id<"materials">;
}) {
  const [now] = useState(() => Date.now());
  const history = useQuery(api.priceEvents.historyForMaterial, {
    materialId,
    now,
  });
  const [showAll, setShowAll] = useState(false);

  if (history === undefined) {
    return <p className="text-sm text-muted-foreground">Carregando preços…</p>;
  }
  if (!history.current || !history.summary) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum preço registrado
        {history.excludedCount > 0
          ? ` na unidade ${history.unit ?? "do material"}`
          : ""}
        .
      </p>
    );
  }

  const { current, summary, points, suppliers } = history;
  const unitSuffix = history.unit ? `/${history.unit}` : "";
  const recent = [...points].reverse();
  const visible = showAll ? recent : recent.slice(0, RECENT_LIMIT);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryTile label="Atual">
          <p className="text-base font-semibold tabular-nums">
            {formatCurrency(current.unitPriceCents)}
            <span className="text-xs font-normal text-muted-foreground">
              {unitSuffix}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-1">
            <PriceFreshnessBadge freshness={current.freshness} />
            <span className="truncate text-xs text-muted-foreground">
              {current.supplierName}
            </span>
          </div>
        </SummaryTile>
        <ChangeTile
          label="vs. anterior"
          hint="mesmo fornecedor"
          change={summary.changeFromPrevious}
          basis="preço anterior do fornecedor"
        />
        <ChangeTile
          label="30 dias"
          change={summary.change30d}
          basis="preço vigente há 30 dias"
        />
        <ChangeTile
          label="90 dias"
          change={summary.change90d}
          basis="preço vigente há 90 dias"
        />
      </div>

      {points.length > 1 ? (
        <PriceSparkline points={points} unit={history.unit} />
      ) : null}

      <p className="text-xs text-muted-foreground">
        {summary.count} {summary.count === 1 ? "preço" : "preços"} de{" "}
        {formatDate(summary.firstAt)} a {formatDate(summary.lastAt)} · mín.{" "}
        <span className="tabular-nums">{formatCurrency(summary.minCents)}</span>{" "}
        ({formatDate(summary.minAt)}) · máx.{" "}
        <span className="tabular-nums">{formatCurrency(summary.maxCents)}</span>{" "}
        ({formatDate(summary.maxAt)})
        {history.excludedCount > 0
          ? ` · ${history.excludedCount} em outra unidade fora da série`
          : ""}
      </p>

      {suppliers.length > 0 ? (
        <div className="space-y-1.5">
          <h4 className="text-xs font-medium text-muted-foreground">
            Último preço por fornecedor
          </h4>
          <ul className="divide-y rounded-md border text-sm">
            {suppliers.map((supplier) => (
              <li
                key={supplier.key}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{supplier.supplierName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(supplier.occurredAt)} ·{" "}
                    {PRICE_SOURCE_LABELS[supplier.source]} · {supplier.count}{" "}
                    {supplier.count === 1 ? "registro" : "registros"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="tabular-nums">
                    {formatCurrency(supplier.unitPriceCents)}
                    {supplier.unit ? (
                      <span className="text-xs text-muted-foreground">
                        /{supplier.unit}
                      </span>
                    ) : null}
                  </span>
                  <div className="flex items-center gap-1">
                    <PriceFreshnessBadge freshness={supplier.freshness} />
                    <PriceChangeBadge change={supplier.change} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <h4 className="text-xs font-medium text-muted-foreground">Registros</h4>
        <ul className="divide-y rounded-md border text-sm">
          {visible.map((point) => (
            <li
              key={point._id}
              className="flex items-center justify-between gap-3 px-3 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate">
                  <span className="tabular-nums">
                    {formatDate(point.occurredAt)}
                  </span>{" "}
                  · {point.supplierName}
                </p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  {PRICE_SOURCE_LABELS[point.source]}
                  {point.needsReview ? (
                    <Badge
                      variant="warning"
                      className="px-1.5 py-0 text-[10px]"
                    >
                      Revisão
                    </Badge>
                  ) : null}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <PriceChangeBadge change={point.change} />
                <span className="tabular-nums">
                  {formatCurrency(point.unitPriceCents)}
                </span>
              </div>
            </li>
          ))}
        </ul>
        {recent.length > RECENT_LIMIT ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll
              ? "Mostrar menos"
              : `Ver todos (${recent.length})`}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1 rounded-md border bg-muted/30 p-2", className)}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function ChangeTile({
  label,
  hint,
  change,
  basis,
}: {
  label: string;
  hint?: string;
  change: PriceChange | null;
  basis: string;
}) {
  return (
    <SummaryTile label={label}>
      {change ? (
        <>
          <PriceChangeBadge change={change} basis={basis} className="text-sm" />
          <p className="text-xs text-muted-foreground">
            de {formatCurrency(change.fromCents)}
            {hint ? ` · ${hint}` : ""}
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">—</p>
          <p className="text-xs text-muted-foreground">
            {hint ? `${hint} · ` : ""}sem base
          </p>
        </>
      )}
    </SummaryTile>
  );
}

const CHART_WIDTH = 320;
const CHART_HEIGHT = 72;
const PAD_X = 6;
const PAD_Y = 8;

/** Linha do tempo dos preços comparáveis; o eixo X é o tempo real. */
function PriceSparkline({
  points,
  unit,
}: {
  points: PricePoint[];
  unit: string | null;
}) {
  const minAt = points[0]!.occurredAt;
  const maxAt = points[points.length - 1]!.occurredAt;
  const prices = points.map((point) => point.unitPriceCents);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const spanAt = Math.max(maxAt - minAt, 1);
  const spanPrice = Math.max(maxPrice - minPrice, 1);

  const coords = points.map((point) => ({
    point,
    x: PAD_X + ((point.occurredAt - minAt) / spanAt) * (CHART_WIDTH - 2 * PAD_X),
    y:
      PAD_Y +
      (1 - (point.unitPriceCents - minPrice) / spanPrice) *
        (CHART_HEIGHT - 2 * PAD_Y),
  }));
  const path = coords
    .map((c, index) => `${index === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");

  return (
    <figure className="space-y-1">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="h-20 w-full overflow-visible text-primary"
        role="img"
        aria-label={`Evolução do preço entre ${formatDate(minAt)} e ${formatDate(maxAt)}`}
      >
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {coords.map(({ point, x, y }) => (
          <circle
            key={point._id}
            cx={x}
            cy={y}
            r={3}
            fill="currentColor"
            className={cn(point.needsReview && "opacity-50")}
          >
            <title>
              {`${formatDate(point.occurredAt)} · ${point.supplierName} · ${formatCurrency(point.unitPriceCents)}${unit ? `/${unit}` : ""}`}
            </title>
          </circle>
        ))}
      </svg>
      <figcaption className="flex justify-between text-[11px] text-muted-foreground">
        <span>{formatDate(minAt)}</span>
        <span className="tabular-nums">
          {formatCurrency(minPrice)} – {formatCurrency(maxPrice)}
        </span>
        <span>{formatDate(maxAt)}</span>
      </figcaption>
    </figure>
  );
}
