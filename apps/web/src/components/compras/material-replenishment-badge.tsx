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
  "default" | "secondary" | "outline" | "destructive" | "success" | "warning"
> = {
  unconfigured: "secondary",
  healthy: "success",
  reorder: "warning",
  below_minimum: "destructive",
};

const QUIET_PLAIN_STATES = new Set<ReplenishmentState>([
  "unconfigured",
  "healthy",
]);

export function MaterialReplenishmentBadge({
  state,
  quantity,
  tone = "default",
}: {
  state: ReplenishmentState;
  quantity?: number | null;
  tone?: "default" | "quiet";
}) {
  const showQuantity =
    quantity !== null && quantity !== undefined && state !== "unconfigured";

  const label =
    tone === "quiet" && QUIET_PLAIN_STATES.has(state) ? (
      <span className="text-xs text-muted-foreground">{LABELS[state]}</span>
    ) : (
      <Badge variant={VARIANTS[state]}>{LABELS[state]}</Badge>
    );

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {label}
      {showQuantity ? (
        <span className="text-xs text-muted-foreground tabular-nums">
          Central: {quantity}
        </span>
      ) : null}
    </div>
  );
}

export function StockHealthBadge({
  state,
  suggestedOrderQuantity,
  tone = "default",
}: {
  state: ReplenishmentState;
  suggestedOrderQuantity?: number | null;
  tone?: "default" | "quiet";
}) {
  const label =
    tone === "quiet" && QUIET_PLAIN_STATES.has(state) ? (
      <span className="text-xs text-muted-foreground">{LABELS[state]}</span>
    ) : (
      <Badge variant={VARIANTS[state]}>{LABELS[state]}</Badge>
    );

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {label}
      {suggestedOrderQuantity != null && suggestedOrderQuantity > 0 ? (
        <span className="text-xs text-muted-foreground tabular-nums">
          Sugerido: {suggestedOrderQuantity}
        </span>
      ) : null}
    </div>
  );
}
