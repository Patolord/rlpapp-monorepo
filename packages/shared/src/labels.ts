/** Variantes de badge usadas no web (shadcn) e no native (componentes próprios). */
export type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

// ---------------------------------------------------------------------------
// Estoque — Recebimentos
// ---------------------------------------------------------------------------

export const RECEIPT_STATUS_LABELS: Record<string, string> = {
  PendingReceipt: "Pendente",
  Accepted: "Aceito",
  Returned: "Devolvido",
  Discarded: "Descartado",
};

export const RECEIPT_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  PendingReceipt: "outline",
  Accepted: "default",
  Returned: "secondary",
  Discarded: "destructive",
};

// ---------------------------------------------------------------------------
// Estoque — Remessas
// ---------------------------------------------------------------------------

export const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  RegisteredOut: "Saída Registrada",
  PendingShipment: "Aguardando Envio",
  DeliveredConfirmed: "Entregue",
  CanceledBeforeLeave: "Cancelado",
  ReversalApplied: "Reversão Aplicada",
};

export const SHIPMENT_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  RegisteredOut: "outline",
  PendingShipment: "secondary",
  DeliveredConfirmed: "default",
  CanceledBeforeLeave: "destructive",
  ReversalApplied: "destructive",
};

// ---------------------------------------------------------------------------
// Estoque — Solicitações de material
// ---------------------------------------------------------------------------

export const MATERIAL_REQUEST_STATUS_LABELS: Record<string, string> = {
  Pendente: "Pendente",
  Aprovado: "Aprovado",
  Rejeitado: "Rejeitado",
  Convertido: "Convertido em Remessa",
};

export const MATERIAL_REQUEST_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  Pendente: "outline",
  Aprovado: "default",
  Rejeitado: "destructive",
  Convertido: "secondary",
};

export const URGENCY_LABELS: Record<string, string> = {
  normal: "Padrão",
  urgente: "Urgente",
  critico: "Crítico",
};

export const URGENCY_VARIANTS: Record<string, BadgeVariant> = {
  normal: "outline",
  urgente: "secondary",
  critico: "destructive",
};
