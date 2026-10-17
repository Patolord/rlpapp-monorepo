import type { Tone } from "@/lib/theme";

export const REPLENISHMENT: Record<string, { label: string; tone: Tone }> = {
  unconfigured: { label: "Sem política", tone: "neutral" },
  healthy: { label: "Saudável", tone: "success" },
  reorder: { label: "Repor", tone: "warning" },
  below_minimum: { label: "Abaixo do mínimo", tone: "danger" },
};

export const MATERIAL_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Rascunho", tone: "neutral" },
  active: { label: "Ativo", tone: "success" },
  archived: { label: "Arquivado", tone: "neutral" },
};

export const PRICE_SOURCE: Record<string, string> = {
  manual: "Manual",
  quote: "Cotação",
  purchase: "Compra",
  invoice: "Nota fiscal",
  whatsapp: "WhatsApp",
  supplier_form: "Formulário",
};

export const FRESHNESS: Record<string, { label: string; tone: Tone }> = {
  fresh: { label: "Recente", tone: "success" },
  usable: { label: "Utilizável", tone: "info" },
  old: { label: "Antigo", tone: "warning" },
  stale: { label: "Vencido", tone: "danger" },
};

export const REVIEW_STATUS: Record<string, { label: string; tone: Tone }> = {
  unreviewed: { label: "Não revisado", tone: "warning" },
  reviewed: { label: "Revisado", tone: "success" },
  ignored: { label: "Ignorado", tone: "neutral" },
  duplicate: { label: "Duplicado", tone: "neutral" },
};
