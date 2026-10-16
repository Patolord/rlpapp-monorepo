import { api } from "@rlpapp/backend/convex/_generated/api";
import { useAction, useQuery } from "convex/react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { formatDateTime, formatRelative } from "@/lib/rh/time-clock";

type SyncRange = { from: string; to: string };

/**
 * Estado da última sincronização com o RHID + botão para disparar uma nova.
 * `range` define o período sincronizado pelo botão (ex.: o dia ou o mês em tela).
 */
export function SyncStatusBar({
  range,
  label,
}: {
  range: SyncRange;
  label: string;
}) {
  const status = useQuery(api.timeClock.getSyncStatus, {});
  const syncRange = useAction(api.rhidSync.syncRange);
  const [pending, setPending] = useState(false);

  const running = status?.lastSyncStatus === "running";
  const busy = pending || running;

  async function handleSync() {
    setPending(true);
    try {
      const summary = await syncRange(range);
      toast.success(
        `RHID sincronizado: ${summary.punches} marcações de ${summary.people} pessoas`
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao sincronizar com o RHID"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-border bg-card px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {status === undefined ? (
          <span className="text-muted-foreground">Carregando estado da sincronização…</span>
        ) : !status.configured ? (
          <>
            <Badge variant="destructive">RHID não configurado</Badge>
            <span className="text-muted-foreground">
              Defina <code>RHID_EMAIL</code> e <code>RHID_PASSWORD</code> nas variáveis do
              Convex para habilitar a coleta.
            </span>
          </>
        ) : (
          <>
            <StatusBadge status={status.lastSyncStatus} />
            <span className="text-muted-foreground" title={formatDateTime(status.lastSyncFinishedAt)}>
              Última sincronização {formatRelative(status.lastSyncFinishedAt)}
              {status.lastSyncFrom
                ? ` · ${status.lastSyncFrom === status.lastSyncTo ? status.lastSyncFrom : `${status.lastSyncFrom} → ${status.lastSyncTo}`}`
                : ""}
              {status.lastSyncTrigger === "cron" ? " · automática" : ""}
            </span>
            {status.lastSyncStatus === "error" && status.lastSyncError ? (
              <span className="text-destructive" title={status.lastSyncError}>
                {status.lastSyncError.length > 90
                  ? `${status.lastSyncError.slice(0, 90)}…`
                  : status.lastSyncError}
              </span>
            ) : null}
          </>
        )}
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={handleSync}
        disabled={busy || status === undefined || !status.configured}
      >
        {busy ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <RefreshCw className="mr-2 size-4" />
        )}
        {busy ? "Sincronizando…" : label}
      </Button>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "running" | "success" | "error" | null;
}) {
  if (status === "running") {
    return (
      <Badge variant="secondary">
        <Loader2 className="mr-1 size-3 animate-spin" />
        Sincronizando
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive">
        <AlertTriangle className="mr-1 size-3" />
        Falhou
      </Badge>
    );
  }
  if (status === "success") {
    return (
      <Badge variant="success">
        <CheckCircle2 className="mr-1 size-3" />
        Atualizado
      </Badge>
    );
  }
  return <Badge variant="outline">Nunca sincronizado</Badge>;
}
