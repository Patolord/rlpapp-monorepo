import { api } from "@rlpapp/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Camera, List, MapPin, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { runWithToast } from "@/lib/errors";
import { AttendanceMap } from "./attendance-map";
import { AttendanceStatus } from "./attendance-status";
import { formatTime, hasCoordinates, todayInSaoPaulo } from "./format";
import { PunchPhoto } from "./punch-photo";
import type { AttendancePunch, DashboardData } from "./types";

const selectClass = "h-10 w-full rounded-md border border-input bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary";
export { selectClass };

function PunchFilters({
  search, setSearch, status, setStatus, worksite, setWorksite, worksites,
}: {
  search: string; setSearch: (value: string) => void;
  status: string; setStatus: (value: string) => void;
  worksite: string; setWorksite: (value: string) => void;
  worksites: DashboardData["worksites"];
}) {
  return <>
    <label className="flex-1 space-y-1 text-sm font-medium">Funcionário<div className="relative"><Search aria-hidden className="absolute left-3 top-3 size-4 text-slate-400" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome" /></div></label>
    <label className="space-y-1 text-sm font-medium md:w-44">Marcações<select className={selectClass} value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos</option><option value="punched">Com marcação</option><option value="no-punch">Sem marcação</option></select></label>
    <label className="space-y-1 text-sm font-medium md:w-56">Obra da última marcação<select className={selectClass} value={worksite} onChange={(event) => setWorksite(event.target.value)}><option value="all">Todas</option><option value="unmatched">Sem obra vinculada</option>{worksites.filter((site) => site.projectId).map((site) => <option key={site.key} value={site.projectId!}>{site.name}</option>)}</select></label>
  </>;
}

export function AttendanceDashboard() {
  const [date, setDate] = useState(() => todayInSaoPaulo());
  const dashboard = useQuery(api.attendance.getDashboard, { date, today: todayInSaoPaulo() });
  const sync = useMutation(api.attendance.requestSync);
  const [syncing, setSyncing] = useState(false);
  async function requestSync() {
    setSyncing(true);
    await runWithToast(() => sync({ date }), "Sincronização solicitada", "Não foi possível solicitar a sincronização");
    setSyncing(false);
  }
  return <>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-slate-900">Marcações de ponto</h1><p className="mt-1 text-sm text-slate-600">Consulte os registros e os locais informados pela equipe.</p></div>
      <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto"><label className="min-w-36 flex-1 space-y-1 text-sm font-medium sm:flex-none">Data<Input type="date" aria-label="Data das marcações" value={date} max={todayInSaoPaulo()} onChange={(event) => { if (event.target.value) setDate(event.target.value); }} /></label><Button variant="outline" onClick={() => void requestSync()} disabled={syncing || !dashboard?.settings.enabled || !dashboard.settings.credentialsConfigured || dashboard.day.status === "queued" || dashboard.day.status === "running"}><RefreshCw className={syncing ? "animate-spin" : ""} />Atualizar agora</Button></div>
    </div>
    {dashboard ? <AttendanceDashboardView data={dashboard} renderPhoto={(punch) => <PunchPhoto punchId={punch._id} employeeName={punch.employeeName} />} /> : <div aria-label="Carregando marcações" role="status" className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-64 w-full" /></div>}
  </>;
}

export function AttendanceDashboardView({ data, renderPhoto }: { data: DashboardData; renderPhoto?: (punch: AttendancePunch) => ReactNode }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [worksite, setWorksite] = useState("all");
  const [mapVisible, setMapVisible] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const punchesByEmployee = useMemo(() => {
    const grouped = new Map<string, AttendancePunch[]>();
    for (const punch of data.punches) {
      const items = grouped.get(punch.employeeKey) ?? [];
      items.push(punch);
      grouped.set(punch.employeeKey, items);
    }
    for (const items of grouped.values()) items.sort((a, b) => a.timestamp - b.timestamp);
    return grouped;
  }, [data.punches]);
  const employees = useMemo(() => data.employees.filter((employee) => employee.name.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")) && (status === "all" || (status === "punched" ? employee.hasPunch : !employee.hasPunch)) && (worksite === "all" || employee.worksiteId === worksite || (worksite === "unmatched" && !employee.worksiteId))), [data.employees, search, status, worksite]);
  const visibleKeys = useMemo(() => new Set(employees.map((employee) => employee.key)), [employees]);
  const mapPunches = useMemo(() => data.punches.filter((punch) => visibleKeys.has(punch.employeeKey)), [data.punches, visibleKeys]);

  return <div className="space-y-5">
    <AttendanceStatus day={data.day} enabled={data.settings.enabled} truncated={data.truncated} />
    <dl className="grid grid-cols-2 divide-x divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-4">
      {[{ label: "Com marcação", value: data.totals.punched }, { label: "Sem marcação", value: data.totals.noPunch }, { label: "Marcações", value: data.totals.punches }, { label: "Pessoas na consulta", value: data.totals.employees }].map((metric) => <div key={metric.label} className="p-4"><dt className="text-xs text-slate-500 sm:text-sm">{metric.label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{metric.value}</dd></div>)}
    </dl>
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 md:flex-row md:items-end">
      <div className="hidden min-w-0 flex-1 md:flex md:items-end md:gap-3">
        <PunchFilters search={search} setSearch={setSearch} status={status} setStatus={setStatus} worksite={worksite} setWorksite={setWorksite} worksites={data.worksites} />
      </div>
      <Button type="button" variant="outline" className="md:hidden" onClick={() => setFiltersOpen(true)}><SlidersHorizontal />Filtros</Button>
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="gap-0" showCloseButton={false}>
          <SheetHeader>
            <SheetTitle>Filtros</SheetTitle>
            <SheetDescription>Refine a lista por pessoa, marcação e obra da última marcação.</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 p-4">
            <PunchFilters search={search} setSearch={setSearch} status={status} setStatus={setStatus} worksite={worksite} setWorksite={setWorksite} worksites={data.worksites} />
            <Button type="button" className="w-full" onClick={() => setFiltersOpen(false)}>Fechar</Button>
          </div>
        </SheetContent>
      </Sheet>
      <div className="flex gap-1" aria-label="Visualização"><Button variant={!mapVisible ? "secondary" : "ghost"} aria-pressed={!mapVisible} onClick={() => setMapVisible(false)}><List />Lista</Button><Button variant={mapVisible ? "secondary" : "ghost"} aria-pressed={mapVisible} onClick={() => setMapVisible(true)}><MapPin />Mapa</Button></div>
    </div>
    {mapVisible ? <AttendanceMap punches={mapPunches} worksites={data.worksites} /> : null}
    <div className="flex items-center justify-between"><h2 className="font-semibold text-slate-900">Equipe</h2><p className="text-sm text-slate-500" aria-live="polite">{employees.length} pessoas</p></div>
    {employees.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">{data.employees.length ? "Nenhuma pessoa corresponde aos filtros." : "Nenhuma pessoa disponível. Confira os vínculos e solicite a sincronização."}</p> : <div className="grid items-start gap-3 xl:grid-cols-2">
      {employees.map((employee) => {
        const punches = punchesByEmployee.get(employee.key) ?? [];
        const isExpanded = expanded === employee.key;
        return <article key={employee.key} className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-semibold text-slate-900">{employee.name}</h3><p className="mt-1 text-sm text-slate-500">{employee.worksiteName ?? "Sem obra vinculada"}</p></div><Badge variant={employee.hasPunch ? "secondary" : "outline"} className="shrink-0">{employee.hasPunch ? "Com marcação" : "Sem marcação"}</Badge></div>
          {!employee.matched ? <p className="mt-2 text-xs text-amber-800">Sem vínculo com funcionário do RH</p> : null}
          <div className="mt-4 flex flex-wrap items-end justify-between gap-2"><p className="text-sm text-slate-600">Última marcação <strong className="ml-1 tabular-nums text-slate-900">{formatTime(employee.lastPunchAt)}</strong></p>{punches.length ? <Button size="sm" variant="ghost" aria-expanded={isExpanded} onClick={() => { setExpanded(isExpanded ? null : employee.key); setPhoto(null); }}>{isExpanded ? "Fechar registros" : `Ver ${punches.length} ${punches.length === 1 ? "registro" : "registros"}`}</Button> : null}</div>
          {isExpanded ? <ol className="mt-3 space-y-3 border-t border-slate-100 pt-3" aria-label={`Marcações de ${employee.name}`}>{punches.map((punch, index) => <li key={punch._id} className="space-y-2"><div className="flex items-start gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold tabular-nums text-slate-600" aria-label={`Marcação ${index + 1}`}>{index + 1}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium tabular-nums">{formatTime(punch.timestamp)}</p><p className="break-words text-xs text-slate-500">{punch.projectName ?? "Sem obra vinculada"} · {hasCoordinates(punch) ? "Com localização" : "Sem localização"}</p></div>{punch.hasPhoto && renderPhoto ? <Button variant="ghost" size="sm" onClick={() => setPhoto(photo === punch._id ? null : punch._id)} aria-expanded={photo === punch._id}><Camera />{photo === punch._id ? "Fechar foto" : "Ver foto"}</Button> : null}</div>{photo === punch._id && renderPhoto ? renderPhoto(punch) : null}</li>)}</ol> : null}
        </article>;
      })}
    </div>}
  </div>;
}
