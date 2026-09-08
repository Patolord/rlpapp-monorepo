import { AlertCircle, Clock3, Info } from "lucide-react";
import { formatUpdated, todayInSaoPaulo } from "./format";
import type { AttendanceDay } from "./types";

export function AttendanceStatus({ day, enabled = true, truncated = false }: { day: AttendanceDay; enabled?: boolean; truncated?: boolean }) {
  const processing = day.status === "running" || day.status === "queued";
  const stale = day.lastSuccessAt !== null && (day.status === "failed" || (day.date === todayInSaoPaulo() && Date.now() - day.lastSuccessAt > 15 * 60_000));
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600">
        <span className="inline-flex items-center gap-1.5"><Clock3 className="size-4" aria-hidden />Última sincronização: {formatUpdated(day.lastSuccessAt)}</span>
        {processing ? <span role="status">{day.status === "queued" ? "Na fila de sincronização" : "Sincronizando…"}</span> : null}
        {day.provisional ? <span className="font-medium text-amber-800">Dados provisórios</span> : null}
        {stale ? <span className="font-medium text-amber-800">Dados desatualizados</span> : null}
        {!enabled ? <span className="font-medium text-amber-800">Sincronização desativada</span> : null}
      </div>
      <p className="flex items-start gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-600"><Info className="mt-0.5 size-4 shrink-0" aria-hidden /><span>Fonte: marcações mobile do RHiD. Sem marcação não confirma falta; a última marcação não indica a localização atual. Horários de São Paulo.</span></p>
      {day.error || day.status === "missing" || truncated || day.warnings.length ? (
        <div role="status" className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="space-y-1">
            {day.error ? <p>Falha na sincronização. {day.error} Os registros da última sincronização continuam disponíveis.</p> : null}
            {day.status === "missing" ? <p>Este dia ainda não foi sincronizado. Solicite a sincronização para consultar as marcações.</p> : null}
            {truncated ? <p>O resultado excedeu o limite de consulta. A lista está incompleta.</p> : null}
            {day.warnings.map((warning) => <p key={warning}>{warning}</p>)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
