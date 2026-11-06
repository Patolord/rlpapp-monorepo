import type { ProjectHierarchy } from "@/components/engenharia/building-panel/hierarchy";

/* ── Rascunhos do modo Adicionar (sistemas e linhas de equipamento) ── */

/** Valor sentinela: a linha vale para cada ambiente selecionado no prédio. */
export const SELECTED_ENV = "__selected__";

export type LineDraft = {
  id: number;
  kind: "condensadora" | "evaporadora";
  qty: number;
  /** SELECTED_ENV ou o id de um ambiente específico (ex: cobertura). */
  envId: string;
  modelo: string;
  capacidade: string;
};

export type SystemDraft = {
  id: number;
  name: string;
  lines: LineDraft[];
};

let draftSeq = 0;

export function newLine(patch?: Partial<LineDraft>): LineDraft {
  return {
    id: ++draftSeq,
    kind: "evaporadora",
    qty: 1,
    envId: SELECTED_ENV,
    modelo: "",
    capacidade: "",
    ...patch,
  };
}

/** Sistema padrão do exemplo típico: 1 condensadora + N evaporadoras. */
export function newSystem(name: string): SystemDraft {
  return {
    id: ++draftSeq,
    name,
    lines: [
      newLine({ kind: "condensadora", qty: 1 }),
      newLine({ kind: "evaporadora", qty: 1 }),
    ],
  };
}

/** Sugere o próximo nome livre "VRF n" considerando existentes e rascunhos. */
export function suggestSystemName(existing: string[], drafts: SystemDraft[]): string {
  const taken = new Set([
    ...existing.map((n) => n.toLowerCase()),
    ...drafts.map((d) => d.name.toLowerCase()),
  ]);
  for (let n = 1; ; n++) {
    const candidate = `VRF ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** Opções de ambiente para as linhas (todos os ambientes da hierarquia). */
export function flattenEnvironments(
  hierarchy: ProjectHierarchy | null | undefined
): { envId: string; label: string }[] {
  if (!hierarchy) return [];
  const multiTower = hierarchy.towers.length > 1;
  const result: { envId: string; label: string }[] = [];
  for (const tower of hierarchy.towers) {
    const floors = tower.floors.slice().sort((a, b) => b.number - a.number);
    for (const floor of floors) {
      for (const env of floor.environments) {
        result.push({
          envId: env._id,
          label: `${env.name} · ${floor.label}${multiTower ? ` · ${tower.name}` : ""}`,
        });
      }
    }
  }
  return result;
}
