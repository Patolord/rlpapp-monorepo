import { formatDateTime } from "@rlpapp/shared";
import { Monitor } from "lucide-react";

import { Badge } from "@/components/ui/badge";

type TakeoffSource = {
  source: "desktop" | null;
  publishedAt: number | null;
  publishedByName: string | null;
};

/** Selo "Takeoff desktop" para orçamentos publicados pelo app desktop. */
export function TakeoffSourceBadge({ takeoff }: { takeoff: TakeoffSource }) {
  if (takeoff.source !== "desktop") return null;
  return (
    <Badge
      variant="outline"
      className="gap-1 border-sky-200 bg-sky-50 font-normal text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300"
      title={publishedLabel(takeoff) ?? undefined}
    >
      <Monitor className="size-3" aria-hidden />
      Takeoff desktop
    </Badge>
  );
}

/** "Publicado em 01/11/2026 12:00 por Ana", ou null para takeoffs manuais. */
export function publishedLabel(takeoff: TakeoffSource): string | null {
  if (takeoff.source !== "desktop" || takeoff.publishedAt === null) return null;
  const by = takeoff.publishedByName ? ` por ${takeoff.publishedByName}` : "";
  return `Publicado em ${formatDateTime(takeoff.publishedAt)}${by}`;
}
