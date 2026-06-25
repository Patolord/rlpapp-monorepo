import { cn } from "@/lib/utils";
import {
  EQUIPMENT_VISUAL_STYLES,
  getEquipmentVisualState,
  type HierarchyItem,
} from "@/components/engenharia/building-panel/hierarchy";

export function EquipmentStatusDot({
  item,
  now,
  showLabel = false,
  className,
}: {
  item: HierarchyItem;
  now: number;
  showLabel?: boolean;
  className?: string;
}) {
  const state = getEquipmentVisualState(item, now);
  const style = EQUIPMENT_VISUAL_STYLES[state];

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn("size-2.5 shrink-0 rounded-full", style.dot)} />
      {showLabel && (
        <span className={cn("text-xs font-medium", style.text)}>
          {style.label}
        </span>
      )}
    </span>
  );
}
