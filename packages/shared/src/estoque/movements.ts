/** Status de uma movimentação de estoque (igual a `inventoryDocumentStatus` do backend). */
export type InventoryDocumentStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "posted"
  | "rejected"
  | "reversed";

/** Rótulos únicos para web e app; concordam com "movimentação" (CONTEXT.md, "Movement"). */
export const INVENTORY_DOCUMENT_STATUS_LABELS: Record<InventoryDocumentStatus, string> = {
  draft: "Rascunho",
  pending_approval: "Aguardando aprovação",
  approved: "Exceção aprovada",
  posted: "Concluída",
  rejected: "Recusada",
  reversed: "Estornada",
};
