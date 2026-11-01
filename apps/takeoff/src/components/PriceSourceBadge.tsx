import clsx from "clsx";
import { Bookmark, BookOpen, Cloud, type LucideIcon, PenLine, Weight } from "lucide-react";
import { describePriceSource, type PriceSource, SEED_LABOR_NOTE } from "../lib/priceSource";

const ICON: Record<PriceSource, { Icon: LucideIcon; className: string }> = {
  catalog: { Icon: Cloud, className: "text-sky-400" },
  saved: { Icon: Bookmark, className: "text-emerald-400" },
  seed: { Icon: BookOpen, className: "text-neutral-500" },
  manual: { Icon: PenLine, className: "text-amber-400" },
  weight: { Icon: Weight, className: "text-violet-400" },
};

/**
 * Where a material price came from: cloud catalog, saved catalog, bundled sheets, typed, by
 * weight. `laborSource: "seed"` adds that the labour came from the bundled sheets (a company
 * entry without labour), with a small dot on the icon.
 */
export function PriceSourceBadge({
  source,
  priceDate,
  laborSource,
  size = 12,
  className,
}: {
  source: PriceSource | undefined;
  priceDate?: number;
  laborSource?: "seed";
  size?: number;
  className?: string;
}) {
  if (!source) return null;
  const { Icon, className: color } = ICON[source];
  const description =
    describePriceSource(source, priceDate) + (laborSource === "seed" ? `\n${SEED_LABOR_NOTE}` : "");
  return (
    <span
      title={description}
      className={clsx("relative inline-flex shrink-0 items-center", color, className)}
    >
      <Icon size={size} aria-label={description} />
      {laborSource === "seed" && (
        <span className="absolute -right-0.5 -bottom-0.5 h-1.5 w-1.5 rounded-full bg-neutral-500" />
      )}
    </span>
  );
}
