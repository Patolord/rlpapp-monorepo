import type { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

export const ALL = "all";
// Valor do filtro de lote para etiquetas legadas sem lote.
export const NO_BATCH = "__sem_lote__";

// "Cadastrada" = etiqueta já vinculada a um equipamento (bipada em campo);
// "Livre" = etiqueta do lote da obra ainda sem equipamento.
export type RegistrationFilter = "all" | "registered" | "free";

export type QrRow = FunctionReturnType<typeof api.qrCodes.listByProject>[number];

export type BatchSummary = {
  batchId: string;
  batchName: string | null;
  createdAt: number;
  count: number;
};
