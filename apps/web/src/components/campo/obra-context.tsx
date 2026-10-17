import { createContext, useContext } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@rlpapp/backend/convex/_generated/api";

/**
 * Resumo da obra aberta no app de campo (`technicianPortal.getFieldProject`).
 * `assigned` diz se o técnico está atribuído; quando não está, a obra abre
 * mesmo assim (válvula de escape) e a UI apenas avisa.
 */
export type FieldObra = NonNullable<
  FunctionReturnType<typeof api.technicianPortal.getFieldProject>
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

export function obraSubtitle(project: {
  client: string | null;
  address: string | null;
}): string | undefined {
  return [project.client, project.address].filter(Boolean).join(" · ") || undefined;
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
