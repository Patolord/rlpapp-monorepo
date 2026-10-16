import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { Link2, Link2Off, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getErrorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/rh/time-clock";

const NONE = "__none__";

type RhidPerson = FunctionReturnType<typeof api.timeClock.listRhidPeople>[number];

export function TimeClockLinksView() {
  return (
    <div className="space-y-6">
      <TrackedDepartmentsCard />
      <PeopleLinksCard />
      <WorksiteLinksCard />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Departamentos acompanhados
// ---------------------------------------------------------------------------

function TrackedDepartmentsCard() {
  const settings = useQuery(api.timeClock.getTimeClockSettings, {});
  const people = useQuery(api.timeClock.listRhidPeople, {});
  const update = useMutation(api.timeClock.updateTimeClockSettings);
  const [draft, setDraft] = useState<string[] | null>(null);

  useEffect(() => {
    if (settings) setDraft(settings.trackedDepartments);
  }, [settings]);

  const departments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const person of people ?? []) {
      if (!person.active) continue;
      const key = person.department ?? "";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const tracked of settings?.trackedDepartments ?? []) {
      if (!counts.has(tracked)) counts.set(tracked, 0);
    }
    return Array.from(counts.entries())
      .filter(([name]) => name !== "")
      .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [people, settings]);

  const selected = new Set(draft ?? []);
  const dirty =
    draft !== null &&
    settings !== undefined &&
    (draft.length !== settings.trackedDepartments.length ||
      draft.some((item) => !settings.trackedDepartments.includes(item)));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Departamentos acompanhados</CardTitle>
        <p className="text-sm text-muted-foreground">
          Define quem conta como “ausente” no painel do dia. Sem seleção, todas as pessoas
          ativas do RHID são acompanhadas.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {settings === undefined || people === undefined ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : departments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            O RHID ainda não informou departamentos. Sincronize para carregar o cadastro.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {departments.map(([name, count]) => {
              const active = selected.has(name);
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setDraft((current) => {
                      const next = new Set(current ?? []);
                      if (next.has(name)) next.delete(name);
                      else next.add(name);
                      return Array.from(next);
                    })
                  }
                  className={
                    active
                      ? "rounded-full border border-primary bg-primary px-3 py-1 text-sm text-primary-foreground"
                      : "rounded-full border border-border bg-background px-3 py-1 text-sm text-foreground hover:bg-muted"
                  }
                >
                  {name} <span className="opacity-70">({count})</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={!dirty}
            onClick={async () => {
              try {
                await update({ trackedDepartments: draft ?? [] });
                toast.success("Departamentos acompanhados atualizados");
              } catch (error) {
                toast.error(getErrorMessage(error, "Erro ao salvar"));
              }
            }}
          >
            Salvar
          </Button>
          {selected.size > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => setDraft([])}>
              Acompanhar todos
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Acompanhando todos</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pessoas RHID ↔ funcionários
// ---------------------------------------------------------------------------

function PeopleLinksCard() {
  const people = useQuery(api.timeClock.listRhidPeople, {});
  const employees = useQuery(api.employees.list, {});
  const linkPerson = useMutation(api.timeClock.linkPerson);
  const [search, setSearch] = useState("");
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (people ?? []).filter((person) => {
      if (!showInactive && !person.active) return false;
      if (onlyUnlinked && person.employee) return false;
      if (!term) return true;
      return (
        person.name.toLowerCase().includes(term) ||
        (person.department ?? "").toLowerCase().includes(term) ||
        (person.cpf ?? "").includes(term) ||
        (person.employee?.name ?? "").toLowerCase().includes(term)
      );
    });
  }, [people, search, onlyUnlinked, showInactive]);

  const linkedCount = (people ?? []).filter((p) => p.active && p.employee).length;
  const activeCount = (people ?? []).filter((p) => p.active).length;

  async function handleLink(person: RhidPerson, value: string) {
    const employeeId = value === NONE ? null : (value as Id<"employees">);
    if ((person.employee?._id ?? null) === employeeId) return;
    try {
      await linkPerson({ rhidPersonId: person.rhidPersonId, employeeId });
      toast.success(employeeId ? `${person.name} vinculado` : `Vínculo de ${person.name} removido`);
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao vincular"));
    }
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Pessoas do RHID × funcionários</CardTitle>
          <span className="text-sm text-muted-foreground">
            {linkedCount} de {activeCount} ativos vinculados
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          O vínculo é automático por CPF ou nome idêntico. Ajustes manuais têm prioridade e
          não são desfeitos pela sincronização.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar nome, departamento ou CPF…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={onlyUnlinked}
              onChange={(event) => setOnlyUnlinked(event.target.checked)}
            />
            Só sem vínculo
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
            />
            Mostrar inativos
          </label>
        </div>
      </CardHeader>
      <CardContent>
        {people === undefined || employees === undefined ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            {people.length === 0
              ? "Nenhuma pessoa recebida do RHID ainda."
              : "Ninguém corresponde ao filtro."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pessoa (RHID)</TableHead>
                <TableHead>Departamento</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Funcionário no sistema</TableHead>
                <TableHead>Vínculo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((person) => (
                <TableRow key={person.rhidPersonId}>
                  <TableCell>
                    <div className="font-medium">{person.name}</div>
                    <div className="text-xs text-muted-foreground">
                      #{person.rhidPersonId}
                      {!person.active ? " · inativo no RHID" : ""}
                      {person.active && !person.tracked ? " · não acompanhado" : ""}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{person.department ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {person.cpf ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={person.employee?._id ?? NONE}
                      onValueChange={(value) => void handleLink(person, value)}
                    >
                      <SelectTrigger className="w-[260px]" aria-label={`Funcionário de ${person.name}`}>
                        <SelectValue placeholder="Sem vínculo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>— Sem vínculo —</SelectItem>
                        {employees.map((employee) => (
                          <SelectItem key={employee._id} value={employee._id}>
                            {employee.name}
                            {employee.code ? ` (${employee.code})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {person.employee ? (
                      <Badge variant={person.linkSource === "manual" ? "secondary" : "success"}>
                        <Link2 className="mr-1 size-3" />
                        {person.linkSource === "manual" ? "manual" : "automático"}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        <Link2Off className="mr-1 size-3" />
                        sem vínculo
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Cercas RHID ↔ obras (projects)
// ---------------------------------------------------------------------------

function WorksiteLinksCard() {
  const worksites = useQuery(api.timeClock.listRhidWorksites, {});
  const projects = useQuery(api.timeClock.listProjectOptions, {});
  const linkWorksite = useMutation(api.timeClock.linkWorksite);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cercas do RHID × obras</CardTitle>
        <p className="text-sm text-muted-foreground">
          As cercas (geofences) chegam com as marcações. Vincule cada uma à obra do sistema para
          cruzar presença com projetos.
        </p>
      </CardHeader>
      <CardContent>
        {worksites === undefined || projects === undefined ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : worksites.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            Nenhuma cerca recebida ainda.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cerca (RHID)</TableHead>
                <TableHead>Raio</TableHead>
                <TableHead>Coordenadas</TableHead>
                <TableHead>Obra no sistema</TableHead>
                <TableHead>Última marcação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {worksites.map((worksite) => (
                <TableRow key={worksite.rhidGeofenceId}>
                  <TableCell>
                    <div className="font-medium">{worksite.name}</div>
                    <div className="text-xs text-muted-foreground">#{worksite.rhidGeofenceId}</div>
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {Math.round(worksite.radius)} m
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${worksite.latitude}&mlon=${worksite.longitude}#map=17/${worksite.latitude}/${worksite.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      {worksite.latitude.toFixed(5)}, {worksite.longitude.toFixed(5)}
                    </a>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={worksite.projectId ?? NONE}
                      onValueChange={async (value) => {
                        const projectId = value === NONE ? null : (value as Id<"projects">);
                        if ((worksite.projectId ?? null) === projectId) return;
                        try {
                          await linkWorksite({ rhidGeofenceId: worksite.rhidGeofenceId, projectId });
                          toast.success(projectId ? `${worksite.name} vinculada` : "Vínculo removido");
                        } catch (error) {
                          toast.error(getErrorMessage(error, "Erro ao vincular obra"));
                        }
                      }}
                    >
                      <SelectTrigger className="w-[260px]" aria-label={`Obra de ${worksite.name}`}>
                        <SelectValue placeholder="Sem vínculo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>— Sem vínculo —</SelectItem>
                        {projects.map((project) => (
                          <SelectItem key={project._id} value={project._id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTime(worksite.lastSeenAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
