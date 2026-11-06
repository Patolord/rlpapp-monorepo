import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime, LIVE_STATUS_COLOR, LIVE_STATUS_LABEL, type LiveStatus } from "@/lib/rh/time-clock";

import type { LiveData, LiveWorksite, ProjectId, UserId } from "./live-person";

const TimeClockMap = lazy(() => import("./time-clock-map"));

/** Mapa ao vivo: posição da última marcação de cada pessoa e as cercas das obras. */
export function LiveMapCard({
  live,
  focusedWorksite,
  selectedPerson,
  selectedWorksite,
  onShowAll,
}: {
  live: LiveData | undefined;
  focusedWorksite: LiveWorksite | null;
  selectedPerson: UserId | null;
  selectedWorksite: ProjectId | null;
  onShowAll: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const markers = useMemo(
    () =>
      (live?.people ?? [])
        .filter((p) => p.latitude !== null && p.longitude !== null && p.status !== "absent")
        .map((p) => ({
          id: p.userId,
          groupId: p.userId,
          latitude: p.latitude as number,
          longitude: p.longitude as number,
          color: LIVE_STATUS_COLOR[p.status],
          title: p.name,
          lines: [
            `${LIVE_STATUS_LABEL[p.status]} desde ${formatTime(p.since)}`,
            p.projectName
              ? `${p.locationExact ? "Em" : "Perto de"} ${p.projectName}`
              : "Fora de cerca",
          ],
          photoPunchId: p.photoPunchId,
        })),
    [live]
  );

  const mapWorksites = useMemo(
    () =>
      (live?.worksites ?? []).map((w) => ({
        projectId: w.projectId,
        name: w.name,
        latitude: w.latitude,
        longitude: w.longitude,
        radiusMeters: w.radiusMeters,
        caption: `${w.onSite} agora${w.lunch ? ` · ${w.lunch} em almoço` : ""}`,
        highlighted: w.projectId === selectedWorksite,
      })),
    [live, selectedWorksite]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {focusedWorksite ? `Mapa · ${focusedWorksite.name}` : "Mapa agora"}
        </CardTitle>
        {focusedWorksite ? (
          <CardAction>
            <Button variant="ghost" size="xs" onClick={onShowAll}>
              Ver tudo
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {mounted ? (
          <Suspense
            fallback={
              <div className="flex h-[420px] items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">
                Carregando mapa…
              </div>
            }
          >
            <TimeClockMap
              markers={markers}
              worksites={mapWorksites}
              highlightGroupId={selectedPerson}
              focusWorksiteId={selectedWorksite}
              className="h-[420px] w-full rounded-md"
            />
          </Suspense>
        ) : (
          <div className="h-[420px] rounded-md bg-muted" />
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {(["on_site", "lunch", "left"] as LiveStatus[]).map((status) => (
            <span key={status} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: LIVE_STATUS_COLOR[status] }}
              />
              {LIVE_STATUS_LABEL[status]}
            </span>
          ))}
          <span className="text-muted-foreground/80">
            Posição = GPS da última marcação de cada pessoa
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
