import clsx from "clsx";
import { Bookmark, BookOpen, Cloud, type LucideIcon, PenLine, Weight } from "lucide-react";
import { describePriceSource, type PriceSource } from "../lib/priceSource";

const ICON: Record<PriceSource, { Icon: LucideIcon; className: string }> = {
  catalog: { Icon: Cloud, className: "text-sky-400" },
  saved: { Icon: Bookmark, className: "text-emerald-400" },
  seed: { Icon: BookOpen, className: "text-neutral-500" },
  manual: { Icon: PenLine, className: "text-amber-400" },
  weight: { Icon: Weight, className: "text-violet-400" },
};

/** Where a material price came from: cloud catalog, saved catalog, bundled sheets, typed, by weight. */
export function PriceSourceBadge({
  source,
  priceDate,
  size = 12,
  className,
}: {
  source: PriceSource | undefined;
  priceDate?: number;
  size?: number;
  className?: string;
}) {
  if (!source) return null;
  const { Icon, className: color } = ICON[source];
  return (
    <span
      title={describePriceSource(source, priceDate)}
      className={clsx("inline-flex shrink-0 items-center", color, className)}
    >
      <Icon size={size} aria-label={describePriceSource(source, priceDate)} />
    </span>
  );
}
