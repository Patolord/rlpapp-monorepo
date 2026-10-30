import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { formatCurrency, formatDate } from "@rlpapp/shared";
import { useQuery } from "convex/react";
import { Ruler } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Dimensions = {
  widthMm?: number;
  heightMm?: number;
  lengthMm?: number;
  thicknessMm?: number;
  diameterMm?: number;
};

type Suggestion = FunctionReturnType<typeof api.priceEvents.suggestEstimate>;

const METHOD_LABELS: Record<NonNullable<Suggestion["method"]>, string> = {
  exact: "mesma medida",
  nearest: "medidas próximas",
  regression: "curva por tamanho",
};

const CONFIDENCE: Record<
  NonNullable<Suggestion["confidence"]>,
  { label: string; variant: "success" | "warning" | "outline" }
> = {
  high: { label: "Confiança alta", variant: "success" },
  medium: { label: "Confiança média", variant: "warning" },
  low: { label: "Confiança baixa", variant: "outline" },
};

export function hasAnyDimension(dimensions: Dimensions | null | undefined) {
  return Boolean(
    dimensions &&
      Object.values(dimensions).some(
        (value) => value !== undefined && Number.isFinite(value) && value > 0
      )
  );
}

export function formatDimensionsShort(dimensions: Dimensions): string {
  const parts: string[] = [];
  if (dimensions.widthMm && dimensions.heightMm) {
    parts.push(`${dimensions.widthMm}×${dimensions.heightMm}`);
  } else {
    if (dimensions.widthMm) parts.push(`L ${dimensions.widthMm}`);
    if (dimensions.heightMm) parts.push(`A ${dimensions.heightMm}`);
  }
  if (dimensions.lengthMm) parts.push(`C ${dimensions.lengthMm}`);
  if (dimensions.thicknessMm) parts.push(`E ${dimensions.thicknessMm}`);
  if (dimensions.diameterMm) parts.push(`Ø ${dimensions.diameterMm}`);
  return `${parts.join(" · ")} mm`;
}

/**
 * Estimativa por tamanho a partir das cotações da família. Mostra o valor
 * sugerido, como foi obtido e os precedentes; `onApply` oferece "Usar".
 */
export function SizeEstimateHint({
  materialId,
  familyName,
  dimensions,
  supplierId,
  onApply,
  compact = false,
  className,
}: {
  materialId?: Id<"materials"> | null;
  familyName?: string | null;
  dimensions: Dimensions;
  supplierId?: Id<"suppliers"> | null;
  onApply?: (unitPriceCents: number) => void;
  compact?: boolean;
  className?: string;
}) {
  const [now] = useState(() => Date.now());
  const [showPrecedents, setShowPrecedents] = useState(!compact);
  const canQuery =
    hasAnyDimension(dimensions) &&
    (Boolean(materialId) || (familyName?.trim().length ?? 0) >= 2);
  const suggestion = useQuery(
    api.priceEvents.suggestEstimate,
    canQuery
      ? {
          materialId: materialId ?? undefined,
          familyName: materialId ? undefined : familyName ?? undefined,
          dimensions,
          supplierId: supplierId ?? undefined,
          now,
        }
      : "skip"
  );

  if (!canQuery) return null;
  if (suggestion === undefined) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        Procurando cotações por tamanho…
      </p>
    );
  }
  if (!suggestion.familyId) {
    return compact ? null : (
      <p className={cn("text-xs text-muted-foreground", className)}>
        Sem família de material para "{familyName}" ainda. A primeira cotação
        registrada cria a família.
      </p>
    );
  }
  if (suggestion.method === null || suggestion.suggestedUnitPriceCents === null) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        {suggestion.compatibleCount === 0
          ? `Nenhuma cotação com medidas em ${suggestion.familyName}.`
          : `${suggestion.compatibleCount} ${
              suggestion.compatibleCount === 1 ? "cotação" : "cotações"
            } em ${suggestion.familyName}, nenhuma de tamanho próximo.`}
      </p>
    );
  }

  const confidence = suggestion.confidence
    ? CONFIDENCE[suggestion.confidence]
    : null;

  return (
    <div
      className={cn(
        "space-y-1.5 rounded-md border border-dashed bg-muted/30 p-2 text-xs",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Ruler className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="text-muted-foreground">Por tamanho:</span>
        <span className="text-sm font-semibold tabular-nums">
          {formatCurrency(suggestion.suggestedUnitPriceCents)}
        </span>
        {confidence ? (
          <Badge variant={confidence.variant} className="px-1.5 py-0 text-[10px]">
            {confidence.label}
          </Badge>
        ) : null}
        {onApply ? (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs"
            onClick={() => onApply(suggestion.suggestedUnitPriceCents!)}
          >
            Usar
          </Button>
        ) : null}
      </div>
      <p className="text-muted-foreground">
        {METHOD_LABELS[suggestion.method]} · {suggestion.usedCount} de{" "}
        {suggestion.compatibleCount}{" "}
        {suggestion.compatibleCount === 1 ? "cotação" : "cotações"} em{" "}
        {suggestion.familyName}
        {suggestion.supplierOnly ? " · só deste fornecedor" : ""}
        {suggestion.minCents !== null && suggestion.maxCents !== null
          ? ` · faixa ${formatCurrency(suggestion.minCents)} – ${formatCurrency(
              suggestion.maxCents
            )}`
          : ""}
      </p>
      {suggestion.precedents.length > 0 ? (
        <div className="space-y-1">
          {compact ? (
            <button
              type="button"
              className="text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setShowPrecedents((value) => !value)}
            >
              {showPrecedents ? "Ocultar precedentes" : "Ver precedentes"}
            </button>
          ) : null}
          {showPrecedents ? (
            <ul className="space-y-0.5">
              {suggestion.precedents.map((precedent) => (
                <li
                  key={precedent.eventId}
                  className="flex flex-wrap items-center justify-between gap-x-2 text-muted-foreground"
                >
                  <span>
                    {formatDimensionsShort(precedent.dimensions)}
                    {precedent.sizeDifferencePercent > 0
                      ? ` (${precedent.sizeDifferencePercent.toLocaleString("pt-BR")}% de diferença)`
                      : ""}{" "}
                    · {precedent.supplierName} · {formatDate(precedent.occurredAt)}
                  </span>
                  <span className="tabular-nums text-foreground">
                    {formatCurrency(precedent.unitPriceCents)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
