import { Clock, Wind } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  getUnitState,
  TYPE_LABELS,
  UNIT_STATE_STYLES,
  type GridUnit,
} from "@/components/engenharia/building";

export function UnitCell({
  unit,
  now,
  selected = false,
  onSelect,
  compact = false,
}: {
  unit: GridUnit;
  now: number;
  selected?: boolean;
  onSelect?: (unit: GridUnit) => void;
  compact?: boolean;
}) {
  const state = getUnitState(unit, now);
  const style = state.overdue
    ? UNIT_STATE_STYLES.overdue
    : UNIT_STATE_STYLES[state.level];

  const content = (
    <>
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-sm font-bold tabular-nums">
          {unit.label}
        </span>
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase leading-none",
            style.tag
          )}
        >
          {TYPE_LABELS[unit.type]}
        </span>
      </div>

      {!compact && (
        <div className="mt-auto flex items-center justify-between gap-1 text-xs">
          <span className="flex items-center gap-1">
            <Wind className="size-3.5" />
            <span className="font-semibold tabular-nums">
              {state.installed}/{state.total}
            </span>
          </span>
          {state.overdue && <Clock className="size-3.5 text-red-600" />}
        </div>
      )}
    </>
  );

  const className = cn(
    "flex h-full min-h-16 w-full flex-col gap-1 rounded-md border-2 p-2 text-left transition-colors",
    style.cell,
    selected && "ring-2 ring-offset-1 ring-primary",
    unit.floorSpan > 1 && "min-h-32"
  );

  if (!onSelect) {
    return <div className={className}>{content}</div>;
  }

  return (
    <button type="button" onClick={() => onSelect(unit)} className={className}>
      {content}
    </button>
  );
}
