import { formatCurrency, formatDate } from "@rlpapp/shared";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

export type PriceChange = {
  deltaCents: number;
  deltaPercent: number | null;
  fromCents: number;
  fromAt: number;
};

/** "+5,2%" ou, sem base percentual, "+R$ 0,50". */
export function formatPriceChange(change: PriceChange): string {
  const sign = change.deltaCents > 0 ? "+" : change.deltaCents < 0 ? "−" : "";
  if (change.deltaPercent === null) {
    return `${sign}${formatCurrency(Math.abs(change.deltaCents))}`;
  }
  const percent = Math.abs(change.deltaPercent).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  return `${sign}${percent}%`;
}

export function priceChangeDirection(
  change: PriceChange
): "up" | "down" | "flat" {
  if (change.deltaCents > 0) return "up";
  if (change.deltaCents < 0) return "down";
  return "flat";
}

/**
 * Variação de preço para quem compra: subida em vermelho, queda em verde.
 * `basis` nomeia a comparação na dica ("preço anterior do fornecedor").
 */
export function PriceChangeBadge({
  change,
  basis = "preço anterior do fornecedor",
  className,
}: {
  change: PriceChange | null;
  basis?: string;
  className?: string;
}) {
  if (!change) return null;
  const direction = priceChangeDirection(change);
  const Icon =
    direction === "up"
      ? ArrowUpRight
      : direction === "down"
        ? ArrowDownRight
        : Minus;
  return (
    <span
      title={`vs. ${basis}: ${formatCurrency(change.fromCents)} em ${formatDate(change.fromAt)}`}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-px text-xs font-medium tabular-nums",
        direction === "up" &&
          "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
        direction === "down" &&
          "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
        direction === "flat" && "text-muted-foreground",
        className
      )}
    >
      <Icon className="size-3" aria-hidden />
      {formatPriceChange(change)}
    </span>
  );
}
