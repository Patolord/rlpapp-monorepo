import { Badge } from "@/components/ui/badge";
import type { FunctionReturnType } from "convex/server";
import { api } from "@rlpapp/backend/convex/_generated/api";

type ReplenishmentState = FunctionReturnType<
  typeof api.materials.listCatalog
>["page"][number]["centralReplenishmentState"];

const LABELS: Record<ReplenishmentState, string> = {
  unconfigured: "Sem política",
  healthy: "OK",
  reorder: "Repor",
  below_minimum: "Crítico",
};

const VARIANTS: Record<
  ReplenishmentState,
  "default" | "secondary" | "outline" | "destructive"
> = {
  unconfigured: "secondary",
  healthy: "default",
  reorder: "outline",
  below_minimum: "destructive",
};

export function MaterialReplenishmentBadge({
  state,
  quantity,
}: {
  state: ReplenishmentState;
  quantity?: number | null;
}) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <Badge variant={VARIANTS[state]}>{LABELS[state]}</Badge>
      {quantity !== null && quantity !== undefined && state !== "unconfigured" && (
        <span className="text-xs text-muted-foreground">
          Central: {quantity}
        </span>
      )}
    </div>
  );
}

export function StockHealthBadge({
  state,
  suggestedOrderQuantity,
}: {
  state: ReplenishmentState;
  suggestedOrderQuantity?: number | null;
}) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <Badge variant={VARIANTS[state]}>{LABELS[state]}</Badge>
      {suggestedOrderQuantity != null && suggestedOrderQuantity > 0 && (
        <span className="text-xs text-muted-foreground">
          Sugerido: {suggestedOrderQuantity}
        </span>
      )}
    </div>
  );
}
