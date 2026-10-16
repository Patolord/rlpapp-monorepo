import { api } from "@rlpapp/backend/convex/_generated/api";
import { formatCurrency } from "@rlpapp/shared";
import { MetricCard } from "@rlpapp/ui/web";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { CalendarDays, ChevronDown, ChevronRight, Download, HardHat, Users, Wallet } from "lucide-react";
import { Fragment, useState } from "react";
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
import { MONTH_LABELS } from "@/lib/rh/labels";
import { formatCentsInput, parsePayrollAmountToCents } from "@/lib/rh/money";
import { downloadCsv, formatDateKeyShort } from "@/lib/rh/time-clock";

import { SyncStatusBar } from "./sync-status-bar";

type MonthStats = FunctionReturnType<typeof api.timeClock.getMonthStats>;

export function TimeClockMonthView({
  year,
  month,
  onChange,
}: {
  year: number;
  month: number;
  onChange: (next: { year: number; month: number }) => void;
}) {
  const stats = useQuery(api.timeClock.getMonthStats, { year, month });
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 4 }, (_, index) => currentYear - index);

  const estimatedCost = stats ? stats.totalManDays * stats.manDayCostCents : 0;
  const maxPresent = stats ? Math.max(1, ...stats.byDate.map((d) => d.presentCount)) : 1;

  function exportCsv() {
    if (!stats) return;
    const rows: Array<Array<string | number>> = [
      ["Pessoa", "Funcionário", "Obra", "Homem-dia"],
    ];
    for (const person of stats.byPerson) {
      for (const worksite of person.worksites) {
        rows.push([
          person.personName,
          person.employee?.name ?? "",
          worksite.worksiteName ?? "Sem obra",
          worksite.days,
        ]);
      }
    }
    rows.push([]);
    rows.push(["Obra", "Projeto", "Pessoas", "Homem-dia", "Custo estimado (R$)"]);
    for (const worksite of stats.byWorksite) {
      rows.push([
        worksite.worksiteName ?? "Sem obra",
        worksite.projectName ?? "",
        worksite.uniquePeople,
        worksite.totalManDays,
        formatCentsInput(worksite.totalManDays * stats.manDayCostCents),
      ]);
    }
    downloadCsv(`ponto-${year}-${String(month).padStart(2, "0")}.csv`, rows);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(month)}
            onValueChange={(value) => onChange({ year, month: Number(value) })}
          >
            <SelectTrigger className="w-[120px]" aria-label="Mês">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_LABELS.map((label, index) => (
                <SelectItem key={label} value={String(index + 1)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(year)}
            onValueChange={(value) => onChange({ year: Number(value), month })}
          >
            <SelectTrigger className="w-[110px]" aria-label="Ano">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!stats}>
          <Download className="mr-2 size-4" />
          Exportar CSV
        </Button>
      </div>

      {stats ? (
        <SyncStatusBar range={{ from: stats.from, to: stats.to }} label="Sincronizar mês" />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Homem-dia"
          value={stats ? stats.totalManDays : "—"}
          description="1 por pessoa com marcação no dia"
          icon={<CalendarDays className="size-4 text-sky-600" />}
        />
        <MetricCard
          title="Pessoas"
          value={stats ? stats.uniquePeople : "—"}
          description="com ao menos um dia trabalhado"
          icon={<Users className="size-4 text-emerald-600" />}
        />
        <MetricCard
          title="Obras"
          value={stats ? stats.uniqueWorksites : "—"}
          description="cercas com presença no mês"
          icon={<HardHat className="size-4 text-amber-600" />}
        />
        <MetricCard
          title="Custo estimado"
          value={stats ? formatCurrency(estimatedCost) : "—"}
          description={
            stats ? (
              <ManDayCostEditor manDayCostCents={stats.manDayCostCents} />
            ) : undefined
          }
          icon={<Wallet className="size-4 text-violet-600" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Presença por dia</CardTitle>
        </CardHeader>
        <CardContent>
          {stats === undefined ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : stats.byDate.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma marcação no mês. Use “Sincronizar mês” para buscar no RHID.
            </p>
          ) : (
            <div className="flex h-36 items-end gap-1 overflow-x-auto pb-6">
              {stats.byDate.map((day) => (
                <div
                  key={day.date}
                  className="relative flex h-full min-w-[26px] flex-1 flex-col items-center justify-end"
                  title={`${formatDateKeyShort(day.date)}: ${day.presentCount} presentes`}
                >
                  <span className="mb-1 text-[10px] tabular-nums text-muted-foreground">
                    {day.presentCount}
                  </span>
                  <div
                    className="w-full rounded-t bg-primary/80"
                    style={{ height: `${Math.max(4, (day.presentCount / maxPresent) * 100)}%` }}
                  />
                  <span className="absolute -bottom-5 text-[10px] text-muted-foreground">
                    {day.date.slice(8, 10)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <WorksiteTable stats={stats} />
        <PersonTable stats={stats} />
      </div>
    </div>
  );
}

function ManDayCostEditor({ manDayCostCents }: { manDayCostCents: number }) {
  const update = useMutation(api.timeClock.updateTimeClockSettings);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(formatCentsInput(manDayCostCents));

  if (!editing) {
    return (
      <span>
        {formatCurrency(manDayCostCents)} por homem-dia ·{" "}
        <button
          type="button"
          className="text-primary hover:underline"
          onClick={() => {
            setValue(formatCentsInput(manDayCostCents));
            setEditing(true);
          }}
        >
          alterar
        </button>
      </span>
    );
  }

  return (
    <form
      className="mt-1 flex items-center gap-1"
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          await update({ manDayCostCents: parsePayrollAmountToCents(value) });
          toast.success("Custo do homem-dia atualizado");
          setEditing(false);
        } catch (error) {
          toast.error(getErrorMessage(error, "Erro ao salvar custo"));
        }
      }}
    >
      <span className="text-xs">R$</span>
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="h-7 w-24 text-xs"
        inputMode="decimal"
        autoFocus
        aria-label="Custo do homem-dia"
      />
      <Button type="submit" size="xs">
        Salvar
      </Button>
      <Button type="button" size="xs" variant="ghost" onClick={() => setEditing(false)}>
        Cancelar
      </Button>
    </form>
  );
}

function WorksiteTable({ stats }: { stats: MonthStats | undefined }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">Por obra</CardTitle>
      </CardHeader>
      <CardContent>
        {stats === undefined ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : stats.byWorksite.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados no mês.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Obra</TableHead>
                <TableHead className="text-right">Pessoas</TableHead>
                <TableHead className="text-right">Homem-dia</TableHead>
                <TableHead className="text-right">Custo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.byWorksite.map((worksite) => {
                const key = String(worksite.rhidGeofenceId ?? "none");
                const expanded = open.has(key);
                return (
                  <Fragment key={key}>
                    <TableRow className="cursor-pointer" onClick={() => toggle(key)}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {expanded ? (
                            <ChevronDown className="size-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-4 text-muted-foreground" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {worksite.worksiteName ?? "Sem obra (fora de cerca)"}
                            </div>
                            {worksite.projectName ? (
                              <div className="truncate text-xs text-muted-foreground">
                                {worksite.projectName}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {worksite.uniquePeople}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {worksite.totalManDays}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(worksite.totalManDays * stats.manDayCostCents)}
                      </TableCell>
                    </TableRow>
                    {expanded
                      ? worksite.people.map((person) => (
                          <TableRow key={`${key}-${person.rhidPersonId}`} className="bg-muted/40">
                            <TableCell className="pl-10 text-sm">{person.personName}</TableCell>
                            <TableCell />
                            <TableCell className="text-right text-sm tabular-nums">
                              {person.days}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                              {formatCurrency(person.days * stats.manDayCostCents)}
                            </TableCell>
                          </TableRow>
                        ))
                      : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function PersonTable({ stats }: { stats: MonthStats | undefined }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (key: number) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">Por pessoa</CardTitle>
      </CardHeader>
      <CardContent>
        {stats === undefined ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : stats.byPerson.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados no mês.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pessoa</TableHead>
                <TableHead>Obras</TableHead>
                <TableHead className="text-right">Dias</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.byPerson.map((person) => {
                const expanded = open.has(person.rhidPersonId);
                return (
                  <Fragment key={person.rhidPersonId}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => toggle(person.rhidPersonId)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {expanded ? (
                            <ChevronDown className="size-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-4 text-muted-foreground" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate font-medium">{person.personName}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {person.employee ? (
                                person.employee.jobTitle ?? "Funcionário vinculado"
                              ) : (
                                <Badge variant="outline" className="text-[10px]">
                                  sem vínculo
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {person.worksites.length}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {person.totalDays}
                      </TableCell>
                    </TableRow>
                    {expanded
                      ? person.worksites.map((worksite, index) => (
                          <TableRow
                            key={`${person.rhidPersonId}-${worksite.rhidGeofenceId ?? `none-${index}`}`}
                            className="bg-muted/40"
                          >
                            <TableCell className="pl-10 text-sm" colSpan={2}>
                              {worksite.worksiteName ?? "Sem obra (fora de cerca)"}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {worksite.days}
                            </TableCell>
                          </TableRow>
                        ))
                      : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
