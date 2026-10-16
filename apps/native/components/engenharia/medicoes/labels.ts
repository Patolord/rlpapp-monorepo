import type { Tone } from "@/lib/theme";

export type MedicaoStatus = "rascunho" | "aprovada" | "paga";

export const MEDICAO_STATUS: Record<MedicaoStatus, { label: string; tone: Tone }> = {
  rascunho: { label: "Rascunho", tone: "neutral" },
  aprovada: { label: "Aprovada", tone: "info" },
  paga: { label: "Paga", tone: "success" },
};

export const BASIS_LABELS: Record<string, string> = {
  percentual: "% do contrato",
  valor_fixo: "Valor fixo",
  progresso_equipamentos: "Progresso de equipamentos",
};
