import type { BadgeProps } from "@/components/ui/badge";
import { Badge } from "@/components/ui/badge";

export type MedicaoStatus = "rascunho" | "aprovada" | "paga";

const STATUS_CONFIG: Record<
  MedicaoStatus,
  { label: string; variant: NonNullable<BadgeProps["variant"]> }
> = {
  rascunho: { label: "Rascunho", variant: "muted" },
  aprovada: { label: "Aprovada", variant: "info" },
  paga: { label: "Paga", variant: "success" },
};

export function MedicaoStatusBadge({ status }: { status: MedicaoStatus }) {
  const config = STATUS_CONFIG[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export const MEDICAO_BASIS_LABELS: Record<string, string> = {
  percentual: "% do contrato",
  valor_fixo: "Valor fixo",
  progresso_equipamentos: "Progresso de equipamentos",
};
