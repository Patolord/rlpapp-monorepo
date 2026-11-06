import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  FLOOR_STATE_STYLES,
  getEnvironmentState,
  type HierarchyEnvironment,
  type MatrixCell,
} from "@/components/engenharia/building-panel/hierarchy";

export function MatrixCellButton({
  cell,
  now,
  highlighted = false,
  onSelectEnvironment,
}: {
  cell: MatrixCell;
  now: number;
  highlighted?: boolean;
  onSelectEnvironment: (floorLabel: string, env: HierarchyEnvironment) => void;
}) {
  const { env, floor } = cell;
  const state = getEnvironmentState(env, now);
  const style = state.overdue
    ? FLOOR_STATE_STYLES.overdue
    : FLOOR_STATE_STYLES[state.level];

  const floorLabel = cell.topFloorLabel
    ? `${floor.label} – ${cell.topFloorLabel}`
    : floor.label;
  const spanBadge =
    cell.shapeRowSpan === 2
      ? "Duplex"
      : cell.shapeRowSpan === 3
        ? "Triplex"
        : null;

  const isPrimary = cell.segmentIndex === 0;
  return (
    <button
      type="button"
      onClick={() => onSelectEnvironment(floorLabel, env)}
      className={cn(
        "m-2 flex min-h-18 flex-col gap-0.5 rounded-sm border-2 p-2 text-left shadow-sm transition-shadow duration-150 hover:shadow-md",
        // Lados encostados em outro retângulo do mesmo ambiente colam no vizinho
        // (sem margem/raio) e escondem a borda de um dos lados para unir a forma.
        cell.flushTop && "mt-0 rounded-t-none",
        cell.flushRight && "mr-0 rounded-r-none",
        cell.flushBottom && "mb-0 rounded-b-none",
        cell.flushLeft && "ml-0 rounded-l-none",
        style.cell,
        highlighted && "ring-2 ring-primary ring-offset-2"
      )}
      style={{
        gridRow: `${cell.row} / span ${cell.rowSpan}`,
        gridColumn: `${cell.col + 1} / span ${cell.colSpan}`,
      }}
      aria-label={isPrimary ? undefined : env.name}
    >
      {isPrimary && (
        <>
          <span className="flex items-center gap-1">
            <span className={cn("size-2 shrink-0 rounded-full", style.dot)} />
            <span className="truncate text-xs font-semibold">{env.name}</span>
            {state.overdue && (
              <AlertTriangle className="ml-auto size-3 shrink-0 text-red-600" />
            )}
          </span>
          {(env.type || spanBadge || cell.shapeRowSpan > 3) && (
            <span className="truncate text-[0.625rem] uppercase text-muted-foreground">
              {[
                env.type,
                spanBadge ??
                  (cell.shapeRowSpan > 3
                    ? `${cell.shapeRowSpan} andares`
                    : null),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          <span className="mt-auto text-[0.625rem] font-medium tabular-nums text-muted-foreground">
            {state.total === 0
              ? "sem equip."
              : `${state.installed}/${state.total} equip.`}
          </span>
        </>
      )}
    </button>
  );
}
