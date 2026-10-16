import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";

import { cacheFieldObra, getCachedFieldObra } from "@/lib/field-cache";

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
  const live = useQuery(
    api.technicianPortal.getFieldProject,
    projectId ? { identifier: projectId } : "skip"
  );
  // `undefined` = cache ainda não lido; `null` = não havia cópia salva.
  const [cached, setCached] = useState<FieldObra | null | undefined>(undefined);

  useEffect(() => {
    if (!projectId) return;
    if (live) {
      void cacheFieldObra(projectId, live);
      return;
    }
    if (live === null) return;
    let alive = true;
    void getCachedFieldObra<FieldObra>(projectId).then((value) => {
      if (alive) setCached(value);
    });
    return () => {
      alive = false;
    };
  }, [live, projectId]);

  if (live !== undefined) return live;
  // Sem cópia local, continua `undefined` para a tela mostrar o estado offline
  // em vez de "obra não encontrada".
  return cached ?? undefined;
}
