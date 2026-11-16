import { INVENTORY_DOCUMENT_STATUS_LABELS } from "@rlpapp/shared/estoque/movements";

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

const L = INVENTORY_DOCUMENT_STATUS_LABELS;

export const DOCUMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: L.draft, tone: "neutral" },
  pending_approval: { label: L.pending_approval, tone: "warning" },
  approved: { label: L.approved, tone: "info" },
  posted: { label: L.posted, tone: "success" },
  rejected: { label: L.rejected, tone: "danger" },
  reversed: { label: L.reversed, tone: "neutral" },
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

/** Saúde do saldo com os rótulos do web (decisão 31). */
export type ReplenishmentState = "below_minimum" | "reorder" | "healthy" | "unconfigured";

export const REPLENISHMENT: Record<ReplenishmentState, { label: string; tone: Tone }> = {
  below_minimum: { label: "Crítico", tone: "danger" },
  reorder: { label: "Repor", tone: "warning" },
  healthy: { label: "OK", tone: "success" },
  unconfigured: { label: "Sem política", tone: "neutral" },
};
