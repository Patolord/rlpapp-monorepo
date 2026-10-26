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

/** Nomes legados seguem "Obra 1801 - Rocontec - Lorena" (número, cliente, projeto). */
const LEGACY_NAME = /^obra\s*(\d+)\s*[-–]\s*(.+?)\s+[-–]\s+(.+)$/i;

/** Número, cliente e nome curto da obra, tirados do nome legado quando houver. */
export function obraParts(project: {
  name: string;
  legacyNumber: number | null;
  client: string | null;
}): { number: string | null; client: string | null; name: string } {
  const match = LEGACY_NAME.exec(project.name.trim());
  if (match) return { number: match[1], client: match[2], name: match[3] };
  return {
    number: project.legacyNumber ? String(project.legacyNumber) : null,
    client: project.client,
    name: project.name,
  };
}

/** "1801 · Lorena": o que o técnico reconhece de longe. */
export function obraTitle(project: {
  name: string;
  legacyNumber: number | null;
  client: string | null;
}): string {
  const { number, name } = obraParts(project);
  return number ? `${number} · ${name}` : name;
}

/** Linha de apoio curta: só o cliente. */
export function obraSubtitle(project: {
  name: string;
  legacyNumber: number | null;
  client: string | null;
}): string | null {
  return obraParts(project).client;
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
