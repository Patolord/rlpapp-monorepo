import { Badge } from "@/components/ui/badge";

const freshnessConfig = {
  fresh: { label: "Recente", variant: "success" },
  usable: { label: "Utilizável", variant: "info" },
  old: { label: "Antigo", variant: "warning" },
  stale: { label: "Obsoleto", variant: "danger" },
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
    <Badge variant={config.variant} className="font-normal">
      {config.label}
      {ageDays !== undefined ? ` · ${ageDays}d` : ""}
    </Badge>
  );
}
