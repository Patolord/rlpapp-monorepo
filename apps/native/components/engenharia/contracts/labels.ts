import type { Tone } from "@/lib/theme";

export type ContractDirection = "client_sale" | "contractor_hire";
export type ContractKind = "base" | "addendum";

export const DIRECTION_LABELS: Record<ContractDirection, string> = {
  client_sale: "Venda ao cliente",
  contractor_hire: "Contratação de empreiteiro",
};

export const DIRECTION_SHORT: Record<ContractDirection, string> = {
  client_sale: "Cliente",
  contractor_hire: "Empreiteiro",
};

export const DIRECTION_TONE: Record<ContractDirection, Tone> = {
  client_sale: "success",
  contractor_hire: "info",
};

export const KIND_LABELS: Record<ContractKind, string> = {
  base: "Contrato base",
  addendum: "Aditivo",
};
