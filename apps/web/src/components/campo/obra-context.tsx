import { createContext, useContext } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@rlpapp/backend/convex/_generated/api";

/** Resumo da obra para o técnico (`technicianPortal.getMyProject`). */
export type FieldObra = NonNullable<
  FunctionReturnType<typeof api.technicianPortal.getMyProject>
>;

export const OBRA_STATUS_LABELS: Record<string, string> = {
  planning: "Planejamento",
  in_progress: "Em andamento",
  completed: "Concluída",
  paused: "Pausada",
};

export function obraTitle(project: {
  name: string;
  legacyNumber: number | null;
}): string {
  return project.legacyNumber
    ? `#${project.legacyNumber} · ${project.name}`
    : project.name;
}

interface FieldObraContextValue {
  obra: FieldObra;
  obraSlug: string;
  fromCache: boolean;
}

const FieldObraContext = createContext<FieldObraContextValue | null>(null);

export const FieldObraProvider = FieldObraContext.Provider;

export function useFieldObra(): FieldObraContextValue {
  const value = useContext(FieldObraContext);
  if (!value) {
    throw new Error("useFieldObra deve ser usado dentro de FieldObraProvider");
  }
  return value;
}
