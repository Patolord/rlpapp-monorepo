import { useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  CopyPlus,
  Pencil,
  Plus,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  FLOOR_STATE_STYLES,
  getEnvironmentState,
  getFloorState,
  type HierarchyEnvironment,
  type HierarchyFloor,
  type HierarchyTower,
} from "@/components/engenharia/building-panel/hierarchy";
import type { BuildingMatrixActions } from "@/components/engenharia/building-panel/building-matrix";

/**
 * Visão do prédio para telas pequenas: um acordeão por andar (do topo para a
 * base), sem overflow horizontal. Cada andar expande para mostrar os ambientes
 * como cards de largura total. Suporta os mesmos modos da matriz: seleção de
 * alvo (pool) e multisseleção (cadastro rápido) via `onSelectEnvironment` /
 * `onToggleFloor`.
 */
export function FloorListMobile({
  tower,
  now,
  actions,
  highlightEnvId = null,
  selectedEnvIds,
  forceExpanded = false,
  onToggleFloor,
  onSelectEnvironment,
}: {
  tower: HierarchyTower;
  now: number;
  actions?: BuildingMatrixActions;
  /** Ambiente destacado (alvo da atribuição ou selecionado). */
  highlightEnvId?: string | null;
  /** Ambientes selecionados no modo de multisseleção (cadastro rápido). */
  selectedEnvIds?: ReadonlySet<string>;
  /** Mantém todos os andares abertos (modos de seleção). */
  forceExpanded?: boolean;
  /** Alterna a seleção de todos os ambientes do andar (multisseleção). */
  onToggleFloor?: (floor: HierarchyFloor) => void;
  onSelectEnvironment: (floorLabel: string, env: HierarchyEnvironment) => void;
}) {
  const floors = tower.floors.slice().sort((a, b) => b.number - a.number);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  if (floors.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
        <p>Esta torre ainda não tem andares.</p>
      </div>
    );
  }

  function toggleExpanded(floorId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(floorId)) next.delete(floorId);
      else next.add(floorId);
      return next;
    });
  }

  return (
    <ul className="space-y-1.5">
      {floors.map((floor) => {
        const state = getFloorState(floor, now);
        const style = state.overdue
          ? FLOOR_STATE_STYLES.overdue
          : FLOOR_STATE_STYLES[state.level];
        // Em modo de seleção, os andares ficam abertos para as células serem
        // clicáveis sem um toque extra.
        const expanded = forceExpanded || expandedIds.has(floor._id);
        const allSelected =
          selectedEnvIds !== undefined &&
          floor.environments.length > 0 &&
          floor.environments.every((e) => selectedEnvIds.has(e._id));

        return (
          <li key={floor._id} className="rounded-lg border">
            <div className="flex items-center gap-1 pr-2">
              <button
                type="button"
                onClick={() => toggleExpanded(floor._id)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2.5 text-left"
                aria-expanded={expanded}
              >
                <ChevronRight
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform",
                    expanded && "rotate-90"
                  )}
                />
                <span className={cn("size-2.5 shrink-0 rounded-full", style.dot)} />
                <span className="truncate text-sm font-semibold">
                  {floor.label}
                </span>
                {state.overdue && (
                  <AlertTriangle className="size-3.5 shrink-0 text-red-600" />
                )}
                <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                  {state.total === 0
                    ? `${floor.environments.length} amb.`
                    : `${state.installed}/${state.total}`}
                </span>
              </button>
              {onToggleFloor && (
                <button
                  type="button"
                  onClick={() => onToggleFloor(floor)}
                  className={cn(
                    "shrink-0 rounded-md border px-2 py-1 text-[0.6875rem] font-medium transition-colors",
                    allSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:border-primary/50"
                  )}
                >
                  {allSelected ? "Andar ✓" : "Andar"}
                </button>
              )}
              {actions?.onReplicateFloor &&
                !onToggleFloor &&
                floor.environments.length > 0 && (
                  <button
                    type="button"
                    onClick={() => actions.onReplicateFloor?.(floor)}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                    aria-label={`Replicar ${floor.label}`}
                    title="Replicar andar"
                  >
                    <CopyPlus className="size-3.5" />
                  </button>
                )}
              {actions?.onEditFloor && !onToggleFloor && (
                <button
                  type="button"
                  onClick={() => actions.onEditFloor?.(floor)}
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                  aria-label={`Editar ${floor.label}`}
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
            </div>

            {expanded && (
              <div className="space-y-1.5 border-t px-3 py-2.5">
                {floor.environments.length === 0 ? (
                  <p className="py-1 text-center text-xs text-muted-foreground">
                    Sem ambientes neste andar.
                  </p>
                ) : (
                  floor.environments
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((env) => (
                      <EnvironmentCard
                        key={env._id}
                        env={env}
                        now={now}
                        highlighted={
                          env._id === highlightEnvId ||
                          (selectedEnvIds?.has(env._id) ?? false)
                        }
                        onClick={() => onSelectEnvironment(floor.label, env)}
                      />
                    ))
                )}
                {actions?.onAddEnvironment && (
                  <button
                    type="button"
                    onClick={() => actions.onAddEnvironment?.(floor)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-muted-foreground/30 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    <Plus className="size-3.5" />
                    Ambiente
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function EnvironmentCard({
  env,
  now,
  highlighted,
  onClick,
}: {
  env: HierarchyEnvironment;
  now: number;
  highlighted: boolean;
  onClick: () => void;
}) {
  const state = getEnvironmentState(env, now);
  const style = state.overdue
    ? FLOOR_STATE_STYLES.overdue
    : FLOOR_STATE_STYLES[state.level];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md border-2 px-2.5 py-2 text-left transition-colors",
        style.cell,
        highlighted && "ring-2 ring-primary ring-offset-1"
      )}
    >
      <span className={cn("size-2 shrink-0 rounded-full", style.dot)} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold">{env.name}</span>
        {env.type && (
          <span className="block truncate text-[0.625rem] uppercase text-muted-foreground">
            {env.type}
          </span>
        )}
      </span>
      {state.overdue && (
        <AlertTriangle className="size-3.5 shrink-0 text-red-600" />
      )}
      <span className="shrink-0 text-[0.6875rem] font-medium tabular-nums text-muted-foreground">
        {state.total === 0 ? "sem equip." : `${state.installed}/${state.total}`}
      </span>
    </button>
  );
}
