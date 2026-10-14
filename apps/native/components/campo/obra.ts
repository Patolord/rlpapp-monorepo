import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

/** Resumo da obra aberta no app de campo (`technicianPortal.getFieldProject`). */
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
}): string | null {
  const parts = [project.client, project.address].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Obra aberta nas telas de campo. Cada tela chama o hook por conta própria
 * (o Convex compartilha a assinatura), o que dispensa um provider por rota.
 * `undefined` carregando; `null` não existe ou arquivada.
 */
export function useFieldObra(projectId: string | undefined) {
  return useQuery(
    api.technicianPortal.getFieldProject,
    projectId ? { identifier: projectId } : "skip"
  );
}
