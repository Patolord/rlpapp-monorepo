import { formatCurrency, formatDate } from "@rlpapp/shared";
import { Receipt } from "lucide-react";

import {
  type PriceChange,
  PriceChangeBadge,
} from "@/components/compras/price-change-badge";

export type TakeoffSavedQuote = {
  _id: string;
  supplierName: string;
  unitPriceCents: number;
  occurredAt: number;
  versusEstimate: PriceChange | null;
};

/**
 * Cotações registradas numa linha de takeoff, todas (a mais barata pode não
 * ser a mais recente), com data e variação sobre a estimativa. Usada pelo
 * takeoff manual e pelo orçamento do desktop.
 */
export function TakeoffSavedQuotes({
  quotes,
}: {
  quotes: readonly TakeoffSavedQuote[];
}) {
  return quotes.map((quote) => (
    <div
      key={quote._id}
      className="flex flex-wrap items-center gap-1.5 text-xs"
    >
      <Receipt className="size-3 text-muted-foreground" aria-hidden />
      <span>
        {quote.supplierName}:{" "}
        <span className="tabular-nums">
          {formatCurrency(quote.unitPriceCents)}
        </span>
      </span>
      <span className="text-muted-foreground">
        {formatDate(quote.occurredAt)}
      </span>
      <PriceChangeBadge change={quote.versusEstimate} basis="estimativa" />
    </div>
  ));
}
