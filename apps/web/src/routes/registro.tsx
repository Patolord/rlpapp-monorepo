import { useEffect, useState } from "react";
import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { UserButton } from "@clerk/tanstack-react-start";
import { usePaginatedQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { getMaintenanceLogTypeLabel } from "@/lib/maintenance-log-type";
import { useOnline } from "@/lib/use-online";
import {
  listPendingRecords,
  removePendingRecord,
  QUEUE_CHANGED_EVENT,
  type PendingRecord,
} from "@/lib/offline-queue";
import { requestOfflineSync } from "@/components/offline-sync";
import {
  QrCode,
  Search,
  CloudOff,
  CloudUpload,
  Trash2,
  AlertTriangle,
  Camera,
  ArrowLeft,
  History,
  Calendar,
  ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/registro")({
  beforeLoad: async ({ context }) => {
    if (!(context as { userId?: string | null }).userId) {
      throw redirect({ to: "/" });
    }
  },
  component: RegistroPage,
});

function usePendingRecords() {
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

function RegistroPage() {
  const navigate = useNavigate();
  const online = useOnline();
  const pending = usePendingRecords();
  const [code, setCode] = useState("");

  function handleOpen(e: React.FormEvent) {
    e.preventDefault();
    const token = code.trim().toUpperCase().replace(/\s+/g, "");
    if (!token) return;
    void navigate({ to: "/q/$token", params: { token } });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <img
            src="/logo.jpg"
            alt="RLP Engenharia"
            className="size-9 rounded-full object-cover"
          />
          <h1 className="text-sm font-semibold">RLP Engenharia</h1>
        </div>
        <UserButton />
      </header>

      <div className="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-6">
        <Button
          variant="ghost"
          size="sm"
          render={<Link to="/qr-operador" />}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>

        {!online && (
          <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-800">
            <CloudOff className="h-5 w-5 shrink-0" />
            <p className="text-sm">
              Sem internet. Você pode registrar mesmo assim — tudo fica salvo
              no aparelho e é enviado quando a conexão voltar.
            </p>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-muted-foreground" />
              Registrar por código
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Digite o código impresso na etiqueta do código QR (ex:
              LORENAH4FC29) para abrir o equipamento sem escanear.
            </p>
            <form onSubmit={handleOpen} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="qr-code" className="text-base">
                  Código da etiqueta
                </Label>
                <Input
                  id="qr-code"
                  placeholder="Ex: LORENAH4FC29"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  autoCapitalize="characters"
                  autoComplete="off"
                  className="h-14 font-mono text-lg uppercase placeholder:font-sans placeholder:normal-case placeholder:text-muted-foreground/50"
                />
              </div>
              <Button
                type="submit"
                disabled={!code.trim()}
                className="h-14 w-full text-lg"
              >
                <Search className="mr-2 h-5 w-5" />
                Abrir equipamento
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CloudUpload className="h-5 w-5 text-muted-foreground" />
                Registros pendentes
              </span>
              {pending.length > 0 && (
                <Badge variant="secondary">{pending.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum registro aguardando envio.
              </p>
            ) : (
              <>
                {pending.map((record) => (
                  <PendingRecordCard key={record.id} record={record} />
                ))}
                <Button
                  onClick={() => requestOfflineSync()}
                  disabled={!online}
                  className="h-12 w-full text-base"
                >
                  <CloudUpload className="mr-2 h-5 w-5" />
                  {online ? "Enviar agora" : "Sem internet para enviar"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <SentHistory />
      </div>
    </div>
  );
}

function SentHistory() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.maintenanceLogs.listMine,
    {},
    { initialNumItems: 10 }
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          Histórico enviado
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {status === "LoadingFirstPage" ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum registro enviado ainda.
          </p>
        ) : (
          <>
            {results.map((log) => (
              <SentLogCard key={log._id} log={log} />
            ))}
            {status === "CanLoadMore" && (
              <Button
                variant="outline"
                onClick={() => loadMore(10)}
                className="h-11 w-full text-base"
              >
                Carregar mais
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

type SentLog = {
  _id: string;
  type?: "installation" | "maintenance";
  status: "installing" | "operational" | "warning" | "error";
  createdAt: number;
  qrToken: string | null;
  equipment: { description?: string } | null;
};

function SentLogCard({ log }: { log: SentLog }) {
  const date = new Date(log.createdAt).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const title =
    log.equipment?.description ||
    log.qrToken ||
    "Equipamento";

  const content = (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={log.type === "installation" ? "default" : "secondary"}>
            {getMaintenanceLogTypeLabel(log.type ?? "maintenance")}
          </Badge>
          <StatusBadge status={log.status} />
        </div>
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          {date}
        </p>
      </div>
      {log.qrToken && (
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      )}
    </div>
  );

  if (!log.qrToken) return content;

  return (
    <Link to="/q/$token" params={{ token: log.qrToken }} className="block">
      {content}
    </Link>
  );
}

function PendingRecordCard({ record }: { record: PendingRecord }) {
  const date = new Date(record.createdAt).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={record.kind === "equipment" ? "default" : "secondary"}>
              {record.kind === "equipment"
                ? "Cadastro de equipamento"
                : record.logType === "installation"
                  ? "Instalação"
                  : "Manutenção"}
            </Badge>
            <span className="font-mono text-sm font-semibold">
              {record.qrToken}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {date} ·{" "}
            <span className="inline-flex items-center gap-1">
              <Camera className="h-3 w-3" />
              {record.photos.length} foto{record.photos.length === 1 ? "" : "s"}
            </span>
          </p>
          {record.kind === "equipment" && (
            <p className="truncate text-sm">{record.description}</p>
          )}
          {record.error && (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {record.error}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground hover:text-destructive"
          aria-label="Descartar registro pendente"
          onClick={() => {
            if (
              window.confirm(
                "Descartar este registro pendente? Os dados serão perdidos."
              )
            ) {
              void removePendingRecord(record.id);
            }
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
