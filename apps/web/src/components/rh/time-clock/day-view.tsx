import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex/react";
import { MetricCard } from "@rlpapp/ui/web";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Clock,
  HardHat,
  MapPinOff,
  Search,
  UserCheck,
  UserX,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDateKeyLong,
  formatTime,
  initials,
  isDateKey,
  PUNCH_KIND_COLOR,
  PUNCH_KIND_LABEL,
  PUNCH_KIND_ORDER,
  shiftDateKey,
  todayDateKey,
  type PunchKind,
} from "@/lib/rh/time-clock";
import { cn } from "@/lib/utils";

import { SyncStatusBar } from "./sync-status-bar";

const TimeClockMap = lazy(() => import("./time-clock-map"));

type DayData = FunctionReturnType<typeof api.timeClock.getDay>;
type DayPerson = DayData["people"][number];
type PresenceFilter = "all" | "present" | "absent";

const KIND_BADGE_CLASS: Record<PunchKind, string> = {
  entrada: "border-transparent bg-emerald-100 text-emerald-800",
  almoco_saida: "border-transparent bg-amber-100 text-amber-800",
  almoco_retorno: "border-transparent bg-sky-100 text-sky-800",
  saida: "border-transparent bg-rose-100 text-rose-800",
};

export function KindBadge({ kind }: { kind: PunchKind }) {
  return (
    <Badge variant="outline" className={KIND_BADGE_CLASS[kind]}>
      {PUNCH_KIND_LABEL[kind]}
    </Badge>
  );
}

export function TimeClockDayView({
  date,
  onDateChange,
}: {
  date: string;
  onDateChange: (date: string) => void;
}) {
  const day = useQuery(api.timeClock.getDay, isDateKey(date) ? { date } : "skip");
  const [filter, setFilter] = useState<PresenceFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const today = todayDateKey();
  const isToday = date === today;

  const people = useMemo(() => {
    if (!day) return [];
    const term = search.trim().toLowerCase();
    return day.people.filter((person) => {
      if (filter === "present" && !person.present) return false;
      if (filter === "absent" && person.present) return false;
      if (!term) return true;
      return (
        person.name.toLowerCase().includes(term) ||
        (person.department ?? "").toLowerCase().includes(term) ||
        (person.worksiteName ?? "").toLowerCase().includes(term) ||
        (person.employee?.name ?? "").toLowerCase().includes(term)
      );
    });
  }, [day, filter, search]);

  const mapPunches = useMemo(
    () =>
      (day?.punches ?? [])
        .filter((p) => p.latitude !== null && p.longitude !== null)
        .map((p) => ({
          id: p._id,
          rhidPersonId: p.rhidPersonId,
          personName: p.personName,
          timeLabel: p.timeLabel,
          kind: p.kind,
          latitude: p.latitude as number,
          longitude: p.longitude as number,
          photoUrl: p.photoUrl,
          geofenceName: p.geofenceName,
        })),
    [day]
  );

  const selectedPunches = useMemo(
    () =>
      selectedPerson === null
        ? []
        : (day?.punches ?? []).filter((p) => p.rhidPersonId === selectedPerson),
    [day, selectedPerson]
  );
  const selected = selectedPerson === null ? null : day?.people.find((p) => p.rhidPersonId === selectedPerson) ?? null;

  const withoutGps = (day?.punches.length ?? 0) - mapPunches.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Dia anterior"
            onClick={() => onDateChange(shiftDateKey(date, -1))}
          >
            <ChevronLeft />
          </Button>
          <Input
            type="date"
            value={date}
            max={today}
            onChange={(event) => {
              if (isDateKey(event.target.value)) onDateChange(event.target.value);
            }}
            className="w-[170px]"
            aria-label="Data"
          />
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Próximo dia"
            disabled={isToday}
            onClick={() => onDateChange(shiftDateKey(date, 1))}
          >
            <ChevronRight />
          </Button>
          {!isToday ? (
            <Button variant="ghost" size="sm" onClick={() => onDateChange(today)}>
              Hoje
            </Button>
          ) : null}
          <span className="text-sm text-muted-foreground">{formatDateKeyLong(date)}</span>
        </div>
      </div>

      <SyncStatusBar range={{ from: date, to: date }} label="Sincronizar dia" />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Presentes"
          value={day ? day.summary.present : "—"}
          description={day ? `de ${day.summary.total} acompanhados` : undefined}
          icon={<UserCheck className="size-4 text-emerald-600" />}
        />
        <MetricCard
          title="Ausentes"
          value={day ? day.summary.absent : "—"}
          description="sem marcação no dia"
          icon={<UserX className="size-4 text-rose-600" />}
        />
        <MetricCard
          title="Marcações"
          value={day ? day.summary.punches : "—"}
          description={
            day
              ? PUNCH_KIND_ORDER.map((kind) => `${day.summary.byKind[kind]} ${PUNCH_KIND_LABEL[kind].toLowerCase()}`).join(" · ")
              : undefined
          }
          icon={<Clock className="size-4 text-sky-600" />}
        />
        <MetricCard
          title="Obras com movimento"
          value={day ? day.worksites.filter((w) => w.peopleCount > 0).length : "—"}
          description={day ? `${day.worksites.length} cercas conhecidas` : undefined}
          icon={<HardHat className="size-4 text-amber-600" />}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="min-w-0">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">Equipe</CardTitle>
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    ["all", "Todos"],
                    ["present", "Presentes"],
                    ["absent", "Ausentes"],
                  ] as Array<[PresenceFilter, string]>
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    size="xs"
                    variant={filter === value ? "default" : "outline"}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="relative max-w-sm">
              <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar pessoa, departamento ou obra…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            {day === undefined ? (
              <p className="text-muted-foreground">Carregando...</p>
            ) : people.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                {day.people.length === 0
                  ? "Nenhuma pessoa conhecida do RHID. Sincronize para carregar o cadastro."
                  : "Ninguém corresponde ao filtro."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pessoa</TableHead>
                    <TableHead>Entrada</TableHead>
                    <TableHead>Última</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Obra</TableHead>
                    <TableHead className="text-right">Marc.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {people.map((person) => (
                    <PersonRow
                      key={person.rhidPersonId}
                      person={person}
                      selected={selectedPerson === person.rhidPersonId}
                      onSelect={() =>
                        setSelectedPerson((current) =>
                          current === person.rhidPersonId ? null : person.rhidPersonId
                        )
                      }
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mapa do dia</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {mounted ? (
                <Suspense
                  fallback={
                    <div className="flex h-[360px] items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">
                      Carregando mapa…
                    </div>
                  }
                >
                  <TimeClockMap
                    punches={mapPunches}
                    worksites={(day?.worksites ?? []).map((w) => ({
                      rhidGeofenceId: w.rhidGeofenceId,
                      name: w.name,
                      latitude: w.latitude,
                      longitude: w.longitude,
                      radius: w.radius,
                      peopleCount: w.peopleCount,
                      projectName: w.projectName,
                    }))}
                    highlightPersonId={selectedPerson}
                  />
                </Suspense>
              ) : (
                <div className="h-[360px] rounded-md bg-muted" />
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {PUNCH_KIND_ORDER.map((kind) => (
                  <span key={kind} className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block size-2.5 rounded-full"
                      style={{ backgroundColor: PUNCH_KIND_COLOR[kind] }}
                    />
                    {PUNCH_KIND_LABEL[kind]}
                  </span>
                ))}
                {withoutGps > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPinOff className="size-3" />
                    {withoutGps} sem GPS
                  </span>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {selected ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Marcações de {selected.name}</CardTitle>
                <Button variant="ghost" size="xs" onClick={() => setSelectedPerson(null)}>
                  Fechar
                </Button>
              </CardHeader>
              <CardContent>
                {selectedPunches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem marcações neste dia.</p>
                ) : (
                  <ol className="space-y-2">
                    {selectedPunches.map((punch) => (
                      <li
                        key={punch._id}
                        className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono tabular-nums">{punch.timeLabel}</span>
                          <KindBadge kind={punch.kind} />
                          <span className="text-muted-foreground">
                            {punch.geofenceName ?? (punch.latitude === null ? "sem GPS" : "fora de cerca")}
                          </span>
                        </div>
                        {punch.photoUrl ? (
                          <a
                            href={punch.photoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <Camera className="size-3.5" /> foto
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Obras (cercas do RHID)</CardTitle>
            </CardHeader>
            <CardContent>
              {day === undefined ? (
                <p className="text-muted-foreground">Carregando...</p>
              ) : day.worksites.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma cerca recebida ainda. Elas aparecem conforme as marcações chegam.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {day.worksites.map((worksite) => (
                    <li
                      key={worksite.rhidGeofenceId}
                      className="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{worksite.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {worksite.projectName ?? "sem obra vinculada"} · raio{" "}
                          {Math.round(worksite.radius)} m
                        </div>
                      </div>
                      <div className="shrink-0 text-right tabular-nums">
                        <div className="font-semibold">{worksite.peopleCount}</div>
                        <div className="text-xs text-muted-foreground">
                          {worksite.punchCount} marc.
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PersonRow({
  person,
  selected,
  onSelect,
}: {
  person: DayPerson;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <TableRow
      onClick={onSelect}
      className={cn("cursor-pointer", selected && "bg-primary/5")}
      aria-selected={selected}
    >
      <TableCell>
        <div className="flex items-center gap-3">
          <PersonAvatar name={person.name} photoUrl={person.photoUrl} present={person.present} />
          <div className="min-w-0">
            <div className="truncate font-medium">{person.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {person.employee ? (
                <>
                  {person.employee.jobTitle ?? "Funcionário"}
                  {person.employee.code ? ` · cód. ${person.employee.code}` : ""}
                </>
              ) : (
                person.department ?? "sem departamento"
              )}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="tabular-nums">{formatTime(person.firstPunchAt)}</TableCell>
      <TableCell className="tabular-nums">
        {person.punchCount > 1 ? formatTime(person.lastPunchAt) : "—"}
      </TableCell>
      <TableCell>
        {person.present && person.lastKind ? (
          <KindBadge kind={person.lastKind} />
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Ausente
          </Badge>
        )}
      </TableCell>
      <TableCell className="max-w-[180px] truncate text-muted-foreground">
        {person.worksiteName ?? (person.present ? "fora de cerca" : "—")}
      </TableCell>
      <TableCell className="text-right tabular-nums">{person.punchCount || "—"}</TableCell>
    </TableRow>
  );
}

function PersonAvatar({
  name,
  photoUrl,
  present,
}: {
  name: string;
  photoUrl: string | null;
  present: boolean;
}) {
  return (
    <span
      className={cn(
        "relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold",
        present ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"
      )}
    >
      {photoUrl ? (
        <img src={photoUrl} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
