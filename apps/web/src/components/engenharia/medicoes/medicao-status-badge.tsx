import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type MedicaoStatus = "rascunho" | "aprovada" | "paga";

const STATUS_CONFIG: Record<MedicaoStatus, { label: string; className: string }> = {
  rascunho: {
    label: "Rascunho",
    className: "bg-muted text-muted-foreground border-transparent",
  },
  aprovada: {
    label: "Aprovada",
    className: "bg-blue-100 text-blue-800 border-transparent",
  },
  paga: {
    label: "Paga",
    className: "bg-green-100 text-green-800 border-transparent",
  },
};

export function MedicaoStatusBadge({ status }: { status: MedicaoStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={cn("font-medium", config.className)}>
      {config.label}
    </Badge>
  );
}

export const MEDICAO_BASIS_LABELS: Record<string, string> = {
  percentual: "% do contrato",
  valor_fixo: "Valor fixo",
  progresso_equipamentos: "Progresso de equipamentos",
};
