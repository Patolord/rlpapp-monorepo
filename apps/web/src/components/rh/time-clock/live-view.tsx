import { api } from "@rlpapp/backend/convex/_generated/api";
import { MetricCard } from "@rlpapp/ui/web";
import { Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex/react";
import {
  AlertTriangle,
  Camera,
  Coffee,
  HardHat,
  LogOut,
  MapPin,
  MapPinOff,
  Search,
  UserX,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  formatDateKeyLong,
  formatDuration,
  formatTime,
  initials,
  LIVE_STATUS_BADGE_CLASS,
  LIVE_STATUS_COLOR,
  LIVE_STATUS_LABEL,
  PUNCH_KIND_LABEL,
  todayDateKey,
  type LiveStatus,
} from "@/lib/rh/time-clock";
import { cn } from "@/lib/utils";

import { KindBadge } from "./day-view";
import { SyncStatusBar } from "./sync-status-bar";

const TimeClockMap = lazy(() => import("./time-clock-map"));

type LiveData = FunctionReturnType<typeof api.timeClock.getLiveStatus>;
type LivePerson = LiveData["people"][number];
type LiveWorksite = LiveData["worksites"][number];

/** Entrada sem saída há mais que isto provavelmente é esquecimento de bater o ponto. */
const STALE_ON_SITE_MS = 13 * 60 * 60 * 1000;

const STATUS_ORDER: Record<LiveStatus, number> = { on_site: 0, lunch: 1, left: 2, absent: 3 };

function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function TimeClockLiveView() {
  const now = useNow();
  const today = todayDateKey(new Date(now));
  const live = useQuery(api.timeClock.getLiveStatus, { date: today });

  const [search, setSearch] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<number | null>(null);
  const [selectedWorksite, setSelectedWorksite] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const term = normalize(search.trim());
  const matches = useMemo(() => {
    if (!live || !term) return [];
    return live.people
      .filter(
        (person) =>
          normalize(person.name).includes(term) ||
          normalize(person.employee?.name ?? "").includes(term) ||
          normalize(person.department ?? "").includes(term)
      )
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  }, [live, term]);

  const peopleById = useMemo(
    () => new Map((live?.people ?? []).map((p) => [p.rhidPersonId, p])),
    [live]
  );
  const selected = selectedPerson === null ? null : (peopleById.get(selectedPerson) ?? null);
  const focusedWorksite =
    selectedWorksite === null
      ? null
      : (live?.worksites.find((w) => w.rhidGeofenceId === selectedWorksite) ?? null);

  const outsideFence = useMemo(
    () =>
      (live?.people ?? []).filter(
        (p) => (p.status === "on_site" || p.status === "lunch") && p.worksiteId === null
      ),
    [live]
  );
  const absent = useMemo(
    () => (live?.people ?? []).filter((p) => p.status === "absent"),
    [live]
  );
  const left = useMemo(() => (live?.people ?? []).filter((p) => p.status === "left"), [live]);

  const markers = useMemo(
    () =>
      (live?.people ?? [])
        .filter((p) => p.latitude !== null && p.longitude !== null && p.status !== "absent")
        .map((p) => ({
          id: String(p.rhidPersonId),
          groupId: p.rhidPersonId,
          latitude: p.latitude as number,
          longitude: p.longitude as number,
          color: LIVE_STATUS_COLOR[p.status],
          title: p.name,
          lines: [
            `${LIVE_STATUS_LABEL[p.status]} desde ${formatTime(p.since)}`,
            p.worksiteName
              ? `${p.locationExact ? "Em" : "Perto de"} ${p.worksiteName}`
              : "Fora de cerca",
          ],
          photoUrl: p.photoUrl,
        })),
    [live]
  );

  const mapWorksites = useMemo(
    () =>
      (live?.worksites ?? []).map((w) => ({
        rhidGeofenceId: w.rhidGeofenceId,
        name: w.name,
        latitude: w.latitude,
        longitude: w.longitude,
        radius: w.radius,
        caption: `${w.onSite} agora${w.lunch ? ` · ${w.lunch} em almoço` : ""}`,
        projectName: w.projectName,
        highlighted: w.rhidGeofenceId === selectedWorksite,
      })),
    [live, selectedWorksite]
  );

  function pickPerson(id: number | null) {
    setSelectedPerson(id);
    if (id !== null) setSelectedWorksite(null);
  }
  function pickWorksite(id: number | null) {
    setSelectedWorksite((current) => (current === id ? null : id));
    setSelectedPerson(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm text-muted-foreground">
          {formatDateKeyLong(today)} · atualiza automaticamente a cada sincronização
        </p>
        <Link
          to="/rh/ponto/dia"
          search={{}}
          className="text-sm text-primary hover:underline"
        >
          Ver histórico do dia →
        </Link>
      </div>

      <SyncStatusBar range={{ from: today, to: today }} label="Atualizar agora" />

      {/* Onde está…? */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute top-3 left-3 size-5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setSelectedPerson(null);
              }}
              placeholder="Onde está… (nome do funcionário)"
              className="h-12 pl-10 text-base"
              aria-label="Onde está"
              autoFocus
            />
            {search ? (
              <button
                type="button"
                aria-label="Limpar busca"
                onClick={() => {
                  setSearch("");
                  setSelectedPerson(null);
                }}
                className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            ) : null}
          </div>
          {term ? (
            <div className="mt-4">
              {live === undefined ? (
                <p className="text-muted-foreground">Carregando...</p>
              ) : matches.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ninguém encontrado para “{search.trim()}”.
                </p>
              ) : (
                <ul className="grid gap-3 md:grid-cols-2">
                  {matches.slice(0, 6).map((person) => (
                    <li key={person.rhidPersonId}>
                      <PersonAnswer
                        person={person}
                        now={now}
                        expanded={selectedPerson === person.rhidPersonId}
                        onToggle={() =>
                          pickPerson(
                            selectedPerson === person.rhidPersonId ? null : person.rhidPersonId
                          )
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
              {matches.length > 6 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Mostrando 6 de {matches.length}. Refine a busca.
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Na obra agora"
          value={live ? live.summary.onSite : "—"}
          description={live ? `de ${live.summary.total} acompanhados` : undefined}
          icon={<HardHat className="size-4 text-emerald-600" />}
        />
        <MetricCard
          title="Em almoço"
          value={live ? live.summary.lunch : "—"}
          description="saíram para almoço e ainda não voltaram"
          icon={<Coffee className="size-4 text-amber-600" />}
        />
        <MetricCard
          title="Encerraram"
          value={live ? live.summary.left : "—"}
          description="já bateram a saída"
          icon={<LogOut className="size-4 text-slate-500" />}
        />
        <MetricCard
          title="Sem marcação"
          value={live ? live.summary.absent : "—"}
          description={
            live && live.summary.outsideFence > 0
              ? `${live.summary.outsideFence} fora de cerca`
              : "ainda não bateram ponto hoje"
          }
          icon={<UserX className="size-4 text-rose-600" />}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* Quem está em cada obra */}
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quem está em cada obra</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {live === undefined ? (
                <p className="text-muted-foreground">Carregando...</p>
              ) : live.worksites.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma cerca conhecida ainda. Sincronize para carregar.
                </p>
              ) : (
                live.worksites.map((worksite) => (
                  <WorksiteBoard
                    key={worksite.rhidGeofenceId}
                    worksite={worksite}
                    now={now}
                    selected={selectedWorksite === worksite.rhidGeofenceId}
                    selectedPerson={selectedPerson}
                    onSelect={() => pickWorksite(worksite.rhidGeofenceId)}
                    onSelectPerson={(id) => pickPerson(selectedPerson === id ? null : id)}
                  />
                ))
              )}

              {outsideFence.length > 0 ? (
                <GroupBoard
                  icon={<MapPinOff className="size-4 text-amber-600" />}
                  title="Fora de cerca"
                  subtitle="última marcação sem obra identificada"
                  people={outsideFence}
                  now={now}
                  selectedPerson={selectedPerson}
                  onSelectPerson={(id) => pickPerson(selectedPerson === id ? null : id)}
                />
              ) : null}
              {left.length > 0 ? (
                <GroupBoard
                  icon={<LogOut className="size-4 text-slate-500" />}
                  title="Encerraram o dia"
                  people={left}
                  now={now}
                  selectedPerson={selectedPerson}
                  onSelectPerson={(id) => pickPerson(selectedPerson === id ? null : id)}
                  muted
                />
              ) : null}
              {absent.length > 0 ? (
                <GroupBoard
                  icon={<UserX className="size-4 text-rose-600" />}
                  title="Sem marcação hoje"
                  people={absent}
                  now={now}
                  selectedPerson={selectedPerson}
                  onSelectPerson={(id) => pickPerson(selectedPerson === id ? null : id)}
                  muted
                />
              ) : null}
            </CardContent>
          </Card>
        </div>

        {/* Mapa + detalhe */}
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                {focusedWorksite ? `Mapa · ${focusedWorksite.name}` : "Mapa agora"}
              </CardTitle>
              {focusedWorksite ? (
                <Button variant="ghost" size="xs" onClick={() => setSelectedWorksite(null)}>
                  Ver tudo
                </Button>
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

          {selected ? (
            <PersonDetail person={selected} now={now} onClose={() => setSelectedPerson(null)} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resposta "onde está X"
// ---------------------------------------------------------------------------

function statusSentence(person: LivePerson, now: number): string {
  const since = person.since;
  const elapsed = since === null ? null : formatDuration(now - since);
  const where = person.worksiteName
    ? `${person.locationExact ? "em" : "perto de"} ${person.worksiteName}`
    : person.latitude !== null
      ? "fora de cerca"
      : "em local sem GPS";
  switch (person.status) {
    case "on_site":
      return `Está ${where} desde ${formatTime(since)}${elapsed ? ` (${elapsed})` : ""}.`;
    case "lunch":
      return `Saiu para almoço às ${formatTime(since)}${elapsed ? ` (há ${elapsed})` : ""}, ${person.worksiteName ? `em ${person.worksiteName}` : where}.`;
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

function PersonAnswer({
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
            <Badge variant="outline" className="border-amber-300 text-amber-700">
              <AlertTriangle className="mr-1 size-3" /> sem saída há {formatDuration(now - person.since!)}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 text-sm">{statusSentence(person, now)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {person.employee
            ? `${person.employee.jobTitle ?? "Funcionário"}${person.employee.code ? ` · cód. ${person.employee.code}` : ""}`
            : (person.department ?? "sem departamento")}
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
// Quadro por obra
// ---------------------------------------------------------------------------

function WorksiteBoard({
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
  selectedPerson: number | null;
  onSelect: () => void;
  onSelectPerson: (id: number) => void;
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
            {worksite.projectName ?? "sem obra vinculada"}
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
            <li key={person.rhidPersonId}>
              <PersonChip
                name={person.name}
                status={person.status}
                since={person.since}
                now={now}
                exact={person.locationExact}
                active={selectedPerson === person.rhidPersonId}
                onClick={() => onSelectPerson(person.rhidPersonId)}
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

function GroupBoard({
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
  selectedPerson: number | null;
  onSelectPerson: (id: number) => void;
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
          <li key={person.rhidPersonId}>
            <PersonChip
              name={person.name}
              status={person.status}
              since={person.since}
              now={now}
              exact={person.locationExact}
              active={selectedPerson === person.rhidPersonId}
              onClick={() => onSelectPerson(person.rhidPersonId)}
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

// ---------------------------------------------------------------------------
// Detalhe da pessoa
// ---------------------------------------------------------------------------

function PersonDetail({
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
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar person={person} size="lg" />
          <div>
            <CardTitle className="text-base">{person.name}</CardTitle>
            <p className="text-sm">{statusSentence(person, now)}</p>
          </div>
        </div>
        <Button variant="ghost" size="xs" onClick={onClose}>
          Fechar
        </Button>
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
                  {punch.geofenceName ?? "fora de cerca"}
                </span>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {person.lastKind ? `Última: ${PUNCH_KIND_LABEL[person.lastKind]}` : ""}
          </span>
          {person.photoUrl ? (
            <a
              href={person.photoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <Camera className="size-3.5" /> última foto
            </a>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: LiveStatus }) {
  return (
    <Badge variant="outline" className={LIVE_STATUS_BADGE_CLASS[status]}>
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
      {person.photoUrl ? (
        <img src={person.photoUrl} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        initials(person.name)
      )}
      <span
        className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-card"
        style={{ backgroundColor: LIVE_STATUS_COLOR[person.status] }}
      />
    </span>
  );
}
