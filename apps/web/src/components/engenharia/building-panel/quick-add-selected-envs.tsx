import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { MousePointerClick, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ProjectHierarchy } from "@/components/engenharia/building-panel/hierarchy";

export type SelectedEnvInfo = {
  envId: Id<"environments">;
  name: string;
  floorLabel: string;
  towerName: string;
};

/** Ambientes selecionados resolvidos a partir da hierarquia reativa. */
export function resolveSelectedEnvs(
  hierarchy: ProjectHierarchy | null | undefined,
  selectedEnvIds: ReadonlySet<string>
): SelectedEnvInfo[] {
  if (!hierarchy) return [];
  const result: SelectedEnvInfo[] = [];
  for (const tower of hierarchy.towers) {
    for (const floor of tower.floors) {
      for (const env of floor.environments) {
        if (selectedEnvIds.has(env._id)) {
          result.push({
            envId: env._id,
            name: env.name,
            floorLabel: floor.label,
            towerName: tower.name,
          });
        }
      }
    }
  }
  return result;
}

/* ── Ambientes selecionados ── */

export function SelectedEnvChips({
  envs,
  multiTower,
  onDeselectEnv,
  onClearSelection,
}: {
  envs: SelectedEnvInfo[];
  multiTower: boolean;
  onDeselectEnv: (envId: Id<"environments">) => void;
  onClearSelection: () => void;
}) {
  if (envs.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-md border border-dashed px-2.5 py-2 text-xs text-muted-foreground">
        <MousePointerClick className="size-3.5 shrink-0" />
        Clique nas células do prédio para selecionar os ambientes (o rótulo do
        andar seleciona o andar inteiro).
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {envs.length === 1
            ? "1 ambiente selecionado"
            : `${envs.length} ambientes selecionados`}
        </span>
        <Button
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          onClick={onClearSelection}
        >
          Limpar
        </Button>
      </div>
      <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
        {envs.map((env) => (
          <span
            key={env.envId}
            className="inline-flex max-w-full items-center gap-1 rounded-full border bg-background py-0.5 pl-2 pr-1 text-xs"
            title={`${multiTower ? `${env.towerName} · ` : ""}${env.floorLabel} · ${env.name}`}
          >
            <span className="truncate">
              {env.name}
              <span className="text-muted-foreground"> · {env.floorLabel}</span>
            </span>
            <button
              type="button"
              onClick={() => onDeselectEnv(env.envId)}
              className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Remover ${env.name}`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
