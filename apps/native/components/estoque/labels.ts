import type { Tone } from "@/lib/theme";

export type MovementType = "entry" | "transfer" | "consumption" | "return" | "adjustment";

export const MOVEMENT_LABELS: Record<string, string> = {
  entry: "Entrada no estoque",
  transfer: "Envio para obra",
  consumption: "Consumo",
  return: "Retorno de obra / fornecedor",
  adjustment: "Ajuste de saldo",
  reversal: "Estorno",
};

export const DOCUMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Rascunho", tone: "neutral" },
  pending_approval: { label: "Aguardando aprovação", tone: "warning" },
  approved: { label: "Aprovado", tone: "info" },
  posted: { label: "Concluído", tone: "success" },
  rejected: { label: "Recusado", tone: "danger" },
  reversed: { label: "Estornado", tone: "neutral" },
};

export const REQUEST_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Pendente", tone: "warning" },
  approved: { label: "Aprovado", tone: "info" },
  rejected: { label: "Recusado", tone: "danger" },
  cancelled: { label: "Cancelado", tone: "neutral" },
  fulfilled: { label: "Enviado", tone: "success" },
};

export const NEEDS_PROJECT: Record<MovementType, boolean> = {
  entry: false,
  transfer: true,
  consumption: true,
  return: true,
  adjustment: false,
};
