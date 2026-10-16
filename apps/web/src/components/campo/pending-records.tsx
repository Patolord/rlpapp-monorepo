import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  CloudUpload,
  Trash2,
  WifiOff,
} from "lucide-react";

import { requestOfflineSync } from "@/components/offline-sync";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  listPendingRecords,
  QUEUE_CHANGED_EVENT,
  removePendingRecord,
  type PendingRecord,
} from "@/lib/offline-queue";
import { useOnline } from "@/lib/use-online";

/** Registros da fila offline, atualizados sempre que a fila muda. */
export function usePendingRecords() {
  const [records, setRecords] = useState<PendingRecord[]>([]);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void listPendingRecords().then((items) => {
        if (alive) setRecords(items);
      });
    };
    refresh();
    window.addEventListener(QUEUE_CHANGED_EVENT, refresh);
    return () => {
      alive = false;
      window.removeEventListener(QUEUE_CHANGED_EVENT, refresh);
    };
  }, []);

  return records;
}

/** Aviso de registros feitos sem internet ainda não enviados. Some com a fila vazia. */
export function PendingBanner() {
  const records = usePendingRecords();
  if (records.length === 0) return null;
  const count = records.length;
  return (
    <Link
      to="/qr-operador/pendentes"
      className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <WifiOff className="size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {count} {count === 1 ? "registro pendente" : "registros pendentes"}
        </p>
        <p className="text-xs opacity-80">
          Aguardando envio. Toque para ver.
        </p>
      </div>
      <ChevronRight className="size-4 shrink-0" />
    </Link>
  );
}

export function PendingRecordsCard({
  records,
  online,
}: {
  records: PendingRecord[];
  online: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <CloudUpload className="size-5 text-muted-foreground" />
            Pendentes
          </span>
          {records.length > 0 && (
            <Badge variant="secondary">{records.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <PendingRecordsList records={records} online={online} />
      </CardContent>
    </Card>
  );
}

export function PendingRecordsList({
  records,
  online,
}: {
  records: PendingRecord[];
  online: boolean;
}) {
  if (records.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center">
        <p className="text-sm font-medium">Tudo enviado</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Nenhum registro aguardando sincronização.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {records.map((record) => (
          <PendingRecordRow key={record.id} record={record} />
        ))}
      </div>
      <Button
        onClick={() => requestOfflineSync()}
        disabled={!online}
        className="h-11 w-full"
      >
        <CloudUpload className="mr-2 size-4" />
        {online ? "Enviar agora" : "Aguardando internet"}
      </Button>
    </>
  );
}

function PendingRecordRow({ record }: { record: PendingRecord }) {
  const [confirming, setConfirming] = useState(false);
  const date = new Date(record.createdAt).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const projectName =
    record.kind === "equipment" ? record.projectName : undefined;

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <Badge variant={record.kind === "equipment" ? "default" : "secondary"}>
            {record.kind === "equipment"
              ? "Cadastro"
              : record.logType === "installation"
                ? "Instalação"
                : "Manutenção"}
          </Badge>
          <p className="truncate font-mono text-sm font-semibold">
            {record.qrToken}
          </p>
          {projectName && (
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <Building2 className="size-3.5 shrink-0" />
              {projectName}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {date} · {record.photos.length} foto
            {record.photos.length === 1 ? "" : "s"}
          </p>
          {record.error && (
            <p className="flex gap-1 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {record.error}
            </p>
          )}
        </div>
        {confirming ? (
          <div className="flex shrink-0 flex-col gap-1">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void removePendingRecord(record.id)}
            >
              Descartar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Manter
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            aria-label={`Descartar registro ${record.qrToken}`}
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Página inteira da fila (tela /qr-operador/pendentes). */
export function PendingRecordsPage() {
  const records = usePendingRecords();
  const online = useOnline();
  return (
    <div className="space-y-3">
      {records.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <CloudUpload className="size-4 shrink-0" />
          <span>
            {records.length} registro{records.length > 1 ? "s" : ""} aguardando
            envio.{online ? " Toque em Enviar agora." : " Sem internet no momento."}
          </span>
        </div>
      )}
      <PendingRecordsList records={records} online={online} />
    </div>
  );
}
