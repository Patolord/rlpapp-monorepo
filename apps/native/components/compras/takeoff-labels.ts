import type { Tone } from "@/lib/theme";

export const TAKEOFF_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Rascunho", tone: "neutral" },
  pricing: { label: "Em precificação", tone: "info" },
  quoted: { label: "Cotado", tone: "info" },
  approved: { label: "Aprovado", tone: "success" },
  archived: { label: "Arquivado", tone: "neutral" },
};

/** Status por item do takeoff (decisão 27). */
export const TAKEOFF_ITEM_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Rascunho", tone: "neutral" },
  needs_review: { label: "Revisar", tone: "warning" },
  matched: { label: "Vinculado", tone: "info" },
  sent_to_supplier: { label: "Enviado ao fornecedor", tone: "info" },
  quoted: { label: "Cotado", tone: "info" },
  selected: { label: "Selecionado", tone: "success" },
  purchased: { label: "Comprado", tone: "success" },
};
