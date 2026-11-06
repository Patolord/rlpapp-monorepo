import type { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { AlertTriangle, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatDuration,
  formatTime,
  initials,
  LIVE_STATUS_BADGE_VARIANT,
  LIVE_STATUS_COLOR,
  LIVE_STATUS_LABEL,
  PUNCH_KIND_LABEL,
  type LiveStatus,
} from "@/lib/rh/time-clock";
import { cn } from "@/lib/utils";

import { KindBadge } from "./day-view";
import { PunchPhotoButton } from "./punch-photo";

export type LiveData = FunctionReturnType<typeof api.timeClock.getLiveStatus>;
export type LivePerson = LiveData["people"][number];
export type LiveWorksite = LiveData["worksites"][number];
export type UserId = Id<"users">;
export type ProjectId = Id<"projects">;

/** Entrada sem saída há mais que isto provavelmente é esquecimento de bater o ponto. */
export const STALE_ON_SITE_MS = 13 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Resposta "onde está X"
// ---------------------------------------------------------------------------

function statusSentence(person: LivePerson, now: number): string {
  const since = person.since;
  const elapsed = since === null ? null : formatDuration(now - since);
  const where = person.projectName
    ? `${person.locationExact ? "em" : "perto de"} ${person.projectName}`
    : person.latitude !== null
      ? "fora de cerca"
      : "em local sem GPS";
  switch (person.status) {
    case "on_site":
      return `Está ${where} desde ${formatTime(since)}${elapsed ? ` (${elapsed})` : ""}.`;
    case "lunch":
      return `Saiu para almoço às ${formatTime(since)}${elapsed ? ` (há ${elapsed})` : ""}, ${person.projectName ? `em ${person.projectName}` : where}.`;
    case "left":
      return `Encerrou o dia às ${formatTime(since)} ${where}.`;
    default:
      return "Ainda não bateu ponto hoje.";
  }
}

function isStale(person: LivePerson, now: number): boolean {
  return (
    person.status === "on_site" && person.since !== null && now - person.since > STALE_ON_SITE_MS
  );
}

export function PersonAnswer({
  person,
  now,
  expanded,
  onToggle,
}: {
  person: LivePerson;
  now: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const stale = isStale(person, now);
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50",
        expanded && "border-primary ring-1 ring-primary/30"
      )}
    >
      <Avatar person={person} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold">{person.name}</span>
          <StatusBadge status={person.status} />
          {stale ? (
            <Badge variant="warning">
              <AlertTriangle className="mr-1 size-3" /> sem saída há {formatDuration(now - person.since!)}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 text-sm">{statusSentence(person, now)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {person.login ?? "—"}
          {person.punches.length > 0
            ? ` · ${person.punches.length} ${person.punches.length === 1 ? "marcação" : "marcações"} hoje`
            : ""}
        </p>
      </div>
      <MapPin
        className="mt-1 size-4 shrink-0"
        style={{ color: LIVE_STATUS_COLOR[person.status] }}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Detalhe da pessoa
// ---------------------------------------------------------------------------

export function PersonDetail({
  person,
  now,
  onClose,
}: {
  person: LivePerson;
  now: number;
  onClose: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Avatar person={person} size="lg" />
          <div>
            <CardTitle className="text-base">{person.name}</CardTitle>
            <p className="text-sm">{statusSentence(person, now)}</p>
          </div>
        </div>
        <CardAction>
          <Button variant="ghost" size="xs" onClick={onClose}>
            Fechar
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {person.punches.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem marcações hoje.</p>
        ) : (
          <ol className="space-y-2">
            {person.punches.map((punch, index) => (
              <li
                key={index}
                className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="font-mono tabular-nums">{punch.timeLabel}</span>
                <KindBadge kind={punch.kind} />
                <span className="truncate text-muted-foreground">
                  {punch.projectName ?? "fora de cerca"}
                </span>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {person.lastKind ? `Última: ${PUNCH_KIND_LABEL[person.lastKind]}` : ""}
          </span>
          {person.photoPunchId ? (
            <PunchPhotoButton punchId={person.photoPunchId} personName={person.name} />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: LiveStatus }) {
  return (
    <Badge variant={LIVE_STATUS_BADGE_VARIANT[status]}>
      {LIVE_STATUS_LABEL[status]}
    </Badge>
  );
}

function Avatar({ person, size = "md" }: { person: LivePerson; size?: "md" | "lg" }) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold",
        size === "lg" ? "size-11" : "size-9",
        person.status === "on_site"
          ? "bg-emerald-100 text-emerald-800"
          : person.status === "lunch"
            ? "bg-amber-100 text-amber-800"
            : "bg-muted text-muted-foreground"
      )}
    >
      {initials(person.name)}
      <span
        className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-card"
        style={{ backgroundColor: LIVE_STATUS_COLOR[person.status] }}
      />
    </span>
  );
}
