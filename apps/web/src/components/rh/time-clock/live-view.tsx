import { api } from "@rlpapp/backend/convex/_generated/api";
import { MetricCard, MetricStrip } from "@rlpapp/ui/web";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Coffee, HardHat, LogOut, MapPinOff, Search, UserX, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDateKeyLong, todayDateKey, type LiveStatus } from "@/lib/rh/time-clock";

import { GroupBoard, WorksiteBoard } from "./live-boards";
import { LiveMapCard } from "./live-map-card";
import { PersonAnswer, PersonDetail, type ProjectId, type UserId } from "./live-person";

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
  const [selectedPerson, setSelectedPerson] = useState<UserId | null>(null);
  const [selectedWorksite, setSelectedWorksite] = useState<ProjectId | null>(null);

  const term = normalize(search.trim());
  const matches = useMemo(() => {
    if (!live || !term) return [];
    return live.people
      .filter(
        (person) =>
          normalize(person.name).includes(term) ||
          normalize(person.login ?? "").includes(term) ||
          normalize(person.projectName ?? "").includes(term)
      )
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  }, [live, term]);

  const peopleById = useMemo(
    () => new Map((live?.people ?? []).map((p) => [p.userId, p])),
    [live]
  );
  const selected = selectedPerson === null ? null : (peopleById.get(selectedPerson) ?? null);
  const focusedWorksite =
    selectedWorksite === null
      ? null
      : (live?.worksites.find((w) => w.projectId === selectedWorksite) ?? null);

  const outsideFence = useMemo(
    () =>
      (live?.people ?? []).filter(
        (p) => (p.status === "on_site" || p.status === "lunch") && p.projectId === null
      ),
    [live]
  );
  const absent = useMemo(
    () => (live?.people ?? []).filter((p) => p.status === "absent"),
    [live]
  );
  const left = useMemo(() => (live?.people ?? []).filter((p) => p.status === "left"), [live]);


  function pickPerson(id: UserId | null) {
    setSelectedPerson(id);
    if (id !== null) setSelectedWorksite(null);
  }
  function pickWorksite(id: ProjectId | null) {
    setSelectedWorksite((current) => (current === id ? null : id));
    setSelectedPerson(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm text-muted-foreground">
          {formatDateKeyLong(today)} · atualiza sozinho a cada marcação
        </p>
        <Link
          to="/rh/ponto/dia"
          search={{}}
          className="text-sm text-primary hover:underline"
        >
          Ver histórico do dia →
        </Link>
      </div>

      {/* Onde está…? */}
      <Card>
        <CardContent>
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
                    <li key={person.userId}>
                      <PersonAnswer
                        person={person}
                        now={now}
                        expanded={selectedPerson === person.userId}
                        onToggle={() =>
                          pickPerson(
                            selectedPerson === person.userId ? null : person.userId
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

      <MetricStrip>
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
      </MetricStrip>

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
                  Nenhuma obra com cerca do ponto.{" "}
                  <Link to="/rh/ponto/configuracoes" className="text-primary hover:underline">
                    Definir cercas
                  </Link>
                </p>
              ) : (
                live.worksites.map((worksite) => (
                  <WorksiteBoard
                    key={worksite.projectId}
                    worksite={worksite}
                    now={now}
                    selected={selectedWorksite === worksite.projectId}
                    selectedPerson={selectedPerson}
                    onSelect={() => pickWorksite(worksite.projectId)}
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
          <LiveMapCard
            live={live}
            focusedWorksite={focusedWorksite}
            selectedPerson={selectedPerson}
            selectedWorksite={selectedWorksite}
            onShowAll={() => setSelectedWorksite(null)}
          />

          {selected ? (
            <PersonDetail person={selected} now={now} onClose={() => setSelectedPerson(null)} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
