import { useMemo } from "react";
import { CopyPlus, Pencil, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { BuildingMatrixActions } from "@/components/engenharia/building-panel/building-matrix";
import {
  resolveMatrixLayout,
  type HierarchyEnvironment,
  type HierarchyFloor,
  type HierarchyTower,
} from "@/components/engenharia/building-panel/hierarchy";
import { MatrixCellButton } from "@/components/engenharia/building-panel/matrix-cell-button";

export function BuildingMatrix({
  tower,
  now,
  actions,
  highlightEnvId = null,
  selectedEnvIds,
  onToggleFloor,
  onSelectEnvironment,
}: {
  tower: HierarchyTower;
  now: number;
  actions?: BuildingMatrixActions;
  /** Ambiente destacado como alvo da atribuição (modo seleção). */
  highlightEnvId?: string | null;
  /** Ambientes selecionados no modo de multisseleção (cadastro rápido). */
  selectedEnvIds?: ReadonlySet<string>;
  /** Alterna a seleção de todos os ambientes do andar (multisseleção). */
  onToggleFloor?: (floor: HierarchyFloor) => void;
  onSelectEnvironment: (floorLabel: string, env: HierarchyEnvironment) => void;
}) {
  const layout = useMemo(() => resolveMatrixLayout(tower), [tower]);
  const { floors, cols, cells, emptySlots } = layout;

  const editable = Boolean(actions?.onAddEnvironment);

  if (floors.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
        <p>Esta torre ainda não tem andares.</p>
        {actions?.onAddFloors && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => actions.onAddFloors?.(tower)}
          >
            <Plus />
            Adicionar andares
          </Button>
        )}
      </div>
    );
  }

  // Colunas do grid: rótulo do andar + colunas da matriz + botão de adicionar.
  const gridTemplateColumns = `4rem repeat(${cols}, minmax(7rem, 1fr))${
    editable ? " 2.5rem" : ""
  }`;

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex min-w-fit flex-col">
        {/* Telhado / Cobertura */}
        <div className="flex">
          <div className="w-16 shrink-0" />
          <div className="flex-1">
            <div className="relative mx-1">
              <div className="h-3 rounded-t-lg bg-slate-700 dark:bg-slate-500" />
              <div className="h-1.5 bg-slate-600 dark:bg-slate-400" />
            </div>
          </div>
          {editable && <div className="w-10 shrink-0" />}
        </div>

        {/* Andares — um único grid para permitir células que atravessam
            andares (duplex/triplex) e colunas (halls largos). */}
        <div
          className="grid"
          style={{
            gridTemplateColumns,
            gridAutoRows: "minmax(5.5rem, auto)",
          }}
        >
          {/* Fachada: uma faixa de fundo por andar, com laje superior. */}
          {floors.map((floor, idx) => (
            <div
              key={`facade-${floor._id}`}
              className={cn(
                "mx-1 border-t-4 border-slate-400/60 bg-slate-200/50 dark:border-slate-500/60 dark:bg-slate-800/40",
                idx === floors.length - 1 &&
                  "border-b-4 border-b-slate-400/60 dark:border-b-slate-500/60"
              )}
              style={{
                gridRow: idx + 1,
                gridColumn: `2 / span ${cols}`,
              }}
            />
          ))}

          {/* Rótulos dos andares — como a marcação no shaft do elevador */}
          {floors.map((floor, idx) => (
            <div
              key={`label-${floor._id}`}
              className="group flex flex-col items-end justify-center gap-0.5 pr-2"
              style={{ gridRow: idx + 1, gridColumn: 1 }}
            >
              <div className="flex items-center gap-1">
                {actions?.onReplicateFloor &&
                  !onToggleFloor &&
                  floor.environments.length > 0 && (
                    <button
                      type="button"
                      onClick={() => actions.onReplicateFloor?.(floor)}
                      className="text-muted-foreground transition-opacity hover:text-foreground [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                      aria-label={`Replicar ${floor.label}`}
                      title="Replicar andar"
                    >
                      <CopyPlus className="size-3" />
                    </button>
                  )}
                {actions?.onEditFloor && !onToggleFloor && (
                  <button
                    type="button"
                    onClick={() => actions.onEditFloor?.(floor)}
                    className="text-muted-foreground transition-opacity hover:text-foreground [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                    aria-label={`Editar ${floor.label}`}
                  >
                    <Pencil className="size-3" />
                  </button>
                )}
                {onToggleFloor ? (
                  <button
                    type="button"
                    onClick={() => onToggleFloor(floor)}
                    className="rounded px-1 text-sm font-bold tabular-nums text-slate-700 underline decoration-dotted underline-offset-2 transition-colors hover:bg-primary/10 hover:text-primary dark:text-slate-300"
                    aria-label={`Selecionar todos os ambientes de ${floor.label}`}
                    title="Selecionar/desselecionar o andar inteiro"
                  >
                    {floor.label}
                  </button>
                ) : (
                  <span className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-300">
                    {floor.label}
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* Buracos do recorte do prédio (posições sem ambiente). */}
          {emptySlots.map((slot) => (
            <div
              key={`empty-${slot.row}-${slot.col}`}
              className="m-2 rounded-sm border border-slate-300/50 bg-slate-100/60 dark:border-slate-600/30 dark:bg-slate-700/20"
              style={{ gridRow: slot.row, gridColumn: slot.col + 1 }}
            />
          ))}

          {/* Janelas / Ambientes */}
          {cells.map((cell) => (
            <MatrixCellButton
              key={`${cell.env._id}:${cell.segmentIndex}`}
              cell={cell}
              now={now}
              highlighted={
                cell.env._id === highlightEnvId ||
                (selectedEnvIds?.has(cell.env._id) ?? false)
              }
              onSelectEnvironment={onSelectEnvironment}
            />
          ))}

          {/* Botões + ambiente (um por andar) */}
          {editable &&
            floors.map((floor, idx) => (
              <div
                key={`add-${floor._id}`}
                className="flex items-center justify-center"
                style={{ gridRow: idx + 1, gridColumn: cols + 2 }}
              >
                <button
                  type="button"
                  onClick={() => actions?.onAddEnvironment?.(floor)}
                  className="flex size-7 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  aria-label={`Adicionar ambiente em ${floor.label}`}
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
            ))}
        </div>

        {/* Base / Fundação */}
        <div className="flex">
          <div className="w-16 shrink-0" />
          <div className="flex-1">
            <div className="mx-1">
              <div className="h-2 bg-slate-600 dark:bg-slate-400" />
              <div className="h-3 rounded-b-md bg-slate-800 dark:bg-slate-600" />
            </div>
          </div>
          {editable && <div className="w-10 shrink-0" />}
        </div>
      </div>
    </div>
  );
}
