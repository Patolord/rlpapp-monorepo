import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const freshnessConfig = {
  fresh: { label: "Recente", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  usable: { label: "Utilizável", className: "bg-blue-50 text-blue-700 border-blue-200" },
  old: { label: "Antigo", className: "bg-amber-50 text-amber-700 border-amber-200" },
  stale: { label: "Obsoleto", className: "bg-red-50 text-red-700 border-red-200" },
} as const;

export function PriceFreshnessBadge({
  freshness,
  ageDays,
}: {
  freshness: keyof typeof freshnessConfig;
  ageDays?: number;
}) {
  const config = freshnessConfig[freshness];
  return (
    <Badge variant="outline" className={cn("font-normal", config.className)}>
      {config.label}
      {ageDays !== undefined ? ` · ${ageDays}d` : ""}
    </Badge>
  );
}
