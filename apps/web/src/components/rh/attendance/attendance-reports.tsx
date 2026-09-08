import { api } from "@rlpapp/backend/convex/_generated/api";
import { usePaginatedQuery, useQuery } from "convex/react";
import { Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatMoney, formatTime, todayInSaoPaulo } from "./format";
import { reportCsv, validReportRange, type AttendanceReportData } from "./report-utils";

function exportReport(data: AttendanceReportData, startDate: string, endDate: string, group: "employees" | "worksites") {
  const url = URL.createObjectURL(new Blob([reportCsv(data, startDate, endDate, group)], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ponto-${group === "employees" ? "funcionarios" : "obras"}-${startDate}-${endDate}.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AttendanceReports() {
  const today = todayInSaoPaulo();
  const [startDate, setStartDate] = useState(() => `${today.slice(0, 7)}-01`);
  const [endDate, setEndDate] = useState(today);
  const valid = validReportRange(startDate, endDate) && endDate <= today;
  const report = useQuery(api.attendance.getReport, valid ? { startDate, endDate, today } : "skip");
  return <div className="space-y-5">
    <div><h1 className="text-2xl font-bold text-slate-900">Relatórios de ponto</h1><p className="mt-1 text-sm text-slate-600">Dias com marcação por funcionário e por obra.</p></div>
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <label className="min-w-36 flex-1 space-y-1 text-sm font-medium sm:flex-none">Data inicial<Input type="date" value={startDate} max={endDate || today} onChange={(event) => setStartDate(event.target.value)} /></label>
      <label className="min-w-36 flex-1 space-y-1 text-sm font-medium sm:flex-none">Data final<Input type="date" value={endDate} min={startDate} max={today} onChange={(event) => setEndDate(event.target.value)} /></label>
      <p className="pb-2 text-xs text-slate-500">Até 90 dias por consulta.</p>
    </div>
    {!valid ? <p role="alert" className="rounded-md bg-amber-50 p-4 text-sm text-amber-900">Informe um período válido de até 90 dias, encerrado até hoje.</p> : report ? <AttendanceReportView data={report} startDate={startDate} endDate={endDate} onExport={exportReport} /> : <p role="status" className="p-6 text-sm text-slate-500">Carregando relatório…</p>}
    {valid && report ? <ReportDayDetails key={`${startDate}-${endDate}`} startDate={startDate} endDate={endDate} /> : null}
  </div>;
}

export function AttendanceReportView({ data, startDate, endDate, onExport }: { data: AttendanceReportData; startDate: string; endDate: string; onExport?: (data: AttendanceReportData, startDate: string, endDate: string, group: "employees" | "worksites") => void }) {
  const [group, setGroup] = useState<"employees" | "worksites">("employees");
  const [search, setSearch] = useState("");
  const pendingDays = data.days.filter((day) => day.status !== "ready");
  const provisional = data.days.some((day) => day.provisional);
  const items = (group === "employees" ? data.employees : data.worksites).filter((item) => item.name.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")));
  return <div className="space-y-5">
    <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-medium">Estimativa operacional · {provisional ? "dados provisórios" : "cobertura da fonte não verificada"}</p>
      <p>Fonte: marcações mobile do RHiD. Um dia-pessoa corresponde a uma pessoa com ao menos uma marcação no dia. A estimativa usa a diária de referência atual e não representa valores da folha de pagamento.</p>
      <p>O custo do dia é atribuído ao local da primeira marcação. Locais sem vínculo permanecem separados das obras cadastradas.</p>
      {pendingDays.length ? <p>{pendingDays.length} {pendingDays.length === 1 ? "dia ainda não foi sincronizado com sucesso" : "dias ainda não foram sincronizados com sucesso"}. Totais podem estar incompletos.</p> : null}
      {data.truncated ? <p role="alert">A distribuição por funcionário e obra está incompleta. O total geral inclui todos os dias publicados. Reduza o período ou consulte o detalhamento por dia.</p> : null}
    </div>
    <dl className="grid gap-3 sm:grid-cols-3">
      {[{ label: "Dias-pessoa com marcação", value: data.totalManDays }, { label: "Diária de referência", value: formatMoney(data.dailyRateCents) }, { label: "Custo estimado", value: formatMoney(data.totalCostCents) }].map((metric) => <div key={metric.label} className="rounded-lg border border-slate-200 bg-white p-4"><dt className="text-sm text-slate-500">{metric.label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{metric.value}</dd></div>)}
    </dl>
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex gap-1" aria-label="Agrupamento do relatório"><Button aria-pressed={group === "employees"} variant={group === "employees" ? "secondary" : "ghost"} onClick={() => setGroup("employees")}>Funcionários</Button><Button aria-pressed={group === "worksites"} variant={group === "worksites" ? "secondary" : "ghost"} onClick={() => setGroup("worksites")}>Obras</Button></div>
        <Button variant="outline" disabled={!onExport || data.truncated} onClick={() => onExport?.(data, startDate, endDate, group)}><Download />Exportar CSV</Button>
      </div>
      <label className="my-4 block max-w-sm space-y-1 text-sm font-medium">{group === "employees" ? "Buscar funcionário" : "Buscar obra"}<Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome" /></label>
      <div className="mb-2 hidden grid-cols-[minmax(0,1fr)_8rem_10rem] gap-4 px-3 text-xs font-medium text-slate-500 sm:grid"><span>{group === "employees" ? "Funcionário" : "Obra"}</span><span className="text-right">Dias-pessoa</span><span className="text-right">Custo estimado</span></div>
      <ul className="divide-y divide-slate-100">{items.map((item) => <li key={item.key} className="grid min-w-0 grid-cols-2 gap-2 px-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_8rem_10rem] sm:gap-4"><span className="col-span-2 break-words font-medium sm:col-span-1">{item.name}</span><span className="tabular-nums sm:text-right"><span className="text-slate-500 sm:hidden">Dias-pessoa: </span>{item.days}</span><span className="text-right tabular-nums">{formatMoney(item.days * data.dailyRateCents)}</span></li>)}</ul>
      {!items.length ? <p className="py-8 text-center text-sm text-slate-500">{search ? "Nenhum resultado corresponde à busca." : "Nenhuma marcação disponível neste período."}</p> : null}
    </section>
    <details className="rounded-lg border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-medium">Cobertura por dia · {formatDate(startDate)} a {formatDate(endDate)}</summary><ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">{data.days.map((day) => <li key={day.date} className="flex justify-between gap-2 border-b border-slate-100 py-2"><span className="tabular-nums">{formatDate(day.date)}</span><span className={day.status === "ready" ? "text-slate-500" : "text-amber-800"}>{day.status === "ready" ? day.provisional ? "Provisório" : "Sincronizado" : day.status === "failed" ? "Falha" : day.status === "running" ? "Sincronizando" : day.status === "queued" ? "Na fila" : "Sem sincronização"}</span></li>)}</ul></details>
  </div>;
}

function ReportDayDetails({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(startDate);
  return <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"><Button variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Fechar detalhamento por dia" : "Consultar detalhamento por dia"}</Button>{open ? <><label className="block max-w-xs space-y-1 text-sm font-medium">Dia do detalhamento<Input type="date" min={startDate} max={endDate} value={date} onChange={(event) => { const value = event.target.value; if (value >= startDate && value <= endDate) setDate(value); }} /></label><ReportDayRows key={date} date={date} /></> : null}</section>;
}

function ReportDayRows({ date }: { date: string }) {
  const { results, status, loadMore } = usePaginatedQuery(api.attendance.listReportDays, { date }, { initialNumItems: 30 });
  if (status === "LoadingFirstPage") return <p role="status" className="text-sm text-slate-500">Carregando dia…</p>;
  return <><ul className="divide-y divide-slate-100">{results.map((row) => <li key={row._id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div><p className="font-medium">{row.employeeName}</p><p className="text-xs text-slate-500">{row.worksiteName ?? "Sem obra vinculada"}</p></div><p className="text-xs tabular-nums text-slate-600">{row.punchCount} marcações · {formatTime(row.firstPunchAt)} – {formatTime(row.lastPunchAt)}</p></li>)}</ul>{!results.length ? <p className="text-sm text-slate-500">Nenhuma marcação publicada neste dia.</p> : null}{status === "CanLoadMore" || status === "LoadingMore" ? <Button variant="outline" disabled={status === "LoadingMore"} onClick={() => loadMore(30)}>{status === "LoadingMore" ? "Carregando…" : "Carregar mais pessoas"}</Button> : null}</>;
}
