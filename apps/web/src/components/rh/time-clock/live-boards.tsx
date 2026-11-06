import { AlertTriangle, Coffee, HardHat, MapPinOff } from "lucide-react";

import { formatTime, LIVE_STATUS_COLOR, LIVE_STATUS_LABEL, type LiveStatus } from "@/lib/rh/time-clock";
import { cn } from "@/lib/utils";

import { STALE_ON_SITE_MS, type LivePerson, type LiveWorksite, type UserId } from "./live-person";

// ---------------------------------------------------------------------------
// Quadro por obra
// ---------------------------------------------------------------------------

export function WorksiteBoard({
  worksite,
  now,
  selected,
  selectedPerson,
  onSelect,
  onSelectPerson,
}: {
  worksite: LiveWorksite;
  now: number;
  selected: boolean;
  selectedPerson: UserId | null;
  onSelect: () => void;
  onSelectPerson: (id: UserId) => void;
}) {
  const current = worksite.people.filter((p) => p.status !== "left");
  const leftCount = worksite.left;
  return (
    <div
      className={cn(
        "rounded-lg border border-border",
        selected && "border-primary ring-1 ring-primary/30"
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center justify-between gap-3 rounded-t-lg px-3 py-2.5 text-left hover:bg-muted/50"
        aria-pressed={selected}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <HardHat className="size-4 shrink-0 text-teal-700" />
            <span className="truncate font-medium">{worksite.name}</span>
          </div>
          <div className="truncate text-xs text-muted-foreground">
            raio {Math.round(worksite.radiusMeters)} m
            {leftCount > 0 ? ` · ${leftCount} já ${leftCount === 1 ? "saiu" : "saíram"}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {worksite.lunch > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs text-amber-700">
              <Coffee className="size-3.5" /> {worksite.lunch}
            </span>
          ) : null}
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums",
              worksite.onSite > 0
                ? "bg-emerald-100 text-emerald-800"
                : "bg-muted text-muted-foreground"
            )}
            title="Pessoas na obra agora"
          >
            {worksite.onSite}
          </span>
        </div>
      </button>
      {current.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5 border-t border-border px-3 py-2">
          {current.map((person) => (
            <li key={person.userId}>
              <PersonChip
                name={person.name}
                status={person.status}
                since={person.since}
                now={now}
                exact={person.locationExact}
                active={selectedPerson === person.userId}
                onClick={() => onSelectPerson(person.userId)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          Ninguém na obra agora.
        </p>
      )}
    </div>
  );
}

export function GroupBoard({
  icon,
  title,
  subtitle,
  people,
  now,
  selectedPerson,
  onSelectPerson,
  muted = false,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  people: LivePerson[];
  now: number;
  selectedPerson: UserId | null;
  onSelectPerson: (id: UserId) => void;
  muted?: boolean;
}) {
  return (
    <div className={cn("rounded-lg border border-border", muted && "border-dashed")}>
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon}
            <span className="truncate font-medium">{title}</span>
          </div>
          {subtitle ? <div className="text-xs text-muted-foreground">{subtitle}</div> : null}
        </div>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-sm font-semibold tabular-nums text-muted-foreground">
          {people.length}
        </span>
      </div>
      <ul className="flex flex-wrap gap-1.5 border-t border-border px-3 py-2">
        {people.map((person) => (
          <li key={person.userId}>
            <PersonChip
              name={person.name}
              status={person.status}
              since={person.since}
              now={now}
              exact={person.locationExact}
              active={selectedPerson === person.userId}
              onClick={() => onSelectPerson(person.userId)}
              hideTime={person.status === "absent"}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function PersonChip({
  name,
  status,
  since,
  now,
  exact,
  active,
  onClick,
  hideTime = false,
}: {
  name: string;
  status: LiveStatus;
  since: number | null;
  now: number;
  exact: boolean;
  active: boolean;
  onClick: () => void;
  hideTime?: boolean;
}) {
  const stale = status === "on_site" && since !== null && now - since > STALE_ON_SITE_MS;
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${LIVE_STATUS_LABEL[status]}${since !== null ? ` desde ${formatTime(since)}` : ""}${exact ? "" : " · fora da cerca"}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background hover:bg-muted"
      )}
    >
      <span
        className="inline-block size-2 rounded-full"
        style={{ backgroundColor: LIVE_STATUS_COLOR[status] }}
      />
      <span className="max-w-[160px] truncate font-medium">{name}</span>
      {!hideTime && since !== null ? (
        <span className={cn("tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>
          {formatTime(since)}
        </span>
      ) : null}
      {stale ? <AlertTriangle className="size-3 text-amber-600" /> : null}
      {!exact && status !== "absent" ? <MapPinOff className="size-3 opacity-70" /> : null}
    </button>
  );
}
