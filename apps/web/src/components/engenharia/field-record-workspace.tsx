import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Building2,
  Camera,
  CloudOff,
  CloudUpload,
  History,
  Keyboard,
  Search,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import { FieldProjectQrBrowser } from "@/components/engenharia/field-project-qr-browser";
import { FieldQrScanner } from "@/components/engenharia/field-qr-scanner";
import { SentHistoryByProject } from "@/components/engenharia/sent-history-by-project";
import { requestOfflineSync } from "@/components/offline-sync";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listPendingRecords,
  QUEUE_CHANGED_EVENT,
  removePendingRecord,
  type PendingRecord,
} from "@/lib/offline-queue";
import { useOnline } from "@/lib/use-online";
import { cn } from "@/lib/utils";

type FieldAction = "manual" | "scan" | "projects" | "history";

const actions: Array<{
  id: FieldAction;
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    id: "manual",
    title: "Digitar código",
    description: "Abra uma etiqueta pelo código impresso.",
    icon: Keyboard,
  },
  {
    id: "scan",
    title: "Escanear com câmera",
    description: "Leia o QR diretamente com o celular.",
    icon: Camera,
  },
  {
    id: "projects",
    title: "Buscar por obra",
    description: "Encontre etiquetas mesmo sem atribuição.",
    icon: Building2,
  },
  {
    id: "history",
    title: "Meu histórico",
    description: "Consulte os registros que você enviou.",
    icon: History,
  },
];

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

export function FieldRecordWorkspace({
  initialAction = "manual",
}: {
  initialAction?: FieldAction;
}) {
  const online = useOnline();
  const pending = usePendingRecords();
  const [activeAction, setActiveAction] = useState<FieldAction>(initialAction);

  useEffect(() => {
    setActiveAction(initialAction);
  }, [initialAction]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div>
        <p className="text-sm font-medium text-primary">Operação em campo</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Registro de campo
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Escolha como deseja localizar o equipamento ou consulte o que já foi
          registrado.
        </p>
      </div>

      {!online && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
          <CloudOff className="mt-0.5 size-5 shrink-0" />
          <p className="text-sm">
            Sem internet. Novos registros ficam salvos neste aparelho e serão
            enviados quando a conexão voltar.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {actions.map((action) => {
          const Icon = action.icon;
          const active = activeAction === action.id;
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => setActiveAction(action.id)}
              aria-pressed={active}
              className={cn(
                "group rounded-xl border p-3 text-left transition-all sm:p-4",
                "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm",
                active && "border-primary bg-primary/5 ring-1 ring-primary/20"
              )}
            >
              <div
                className={cn(
                  "mb-3 inline-flex rounded-lg bg-muted p-2.5 text-muted-foreground",
                  active && "bg-primary text-primary-foreground"
                )}
              >
                <Icon className="size-5" />
              </div>
              <p className="text-sm font-semibold sm:text-base">{action.title}</p>
              <p className="mt-1 hidden text-xs leading-relaxed text-muted-foreground sm:block">
                {action.description}
              </p>
            </button>
          );
        })}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {activeAction === "history" ? (
          <SentHistoryByProject />
        ) : (
          <Card className="min-w-0">
            <CardHeader className="border-b">
              <CardTitle>
                {actions.find((action) => action.id === activeAction)?.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              {activeAction === "manual" && <ManualCodeEntry />}
              {activeAction === "scan" && <FieldQrScanner />}
              {activeAction === "projects" && <FieldProjectQrBrowser />}
            </CardContent>
          </Card>
        )}

        <PendingRecordsCard records={pending} online={online} />
      </div>
    </div>
  );
}

function ManualCodeEntry() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  function handleOpen(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = code.trim().toUpperCase().replace(/\s+/g, "");
    if (!token) return;
    void navigate({ to: "/q/$token", params: { token } });
  }

  return (
    <div className="mx-auto max-w-xl py-3">
      <p className="mb-5 text-sm text-muted-foreground">
        Digite o código exibido abaixo do QR da etiqueta, sem espaços.
      </p>
      <form onSubmit={handleOpen} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="field-qr-code" className="text-base">
            Código da etiqueta
          </Label>
          <Input
            id="field-qr-code"
            placeholder="Ex: LORENAH4FC29"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoComplete="off"
            className="h-14 font-mono text-lg uppercase placeholder:font-sans placeholder:normal-case"
          />
        </div>
        <Button
          type="submit"
          disabled={!code.trim()}
          className="h-12 w-full text-base"
        >
          <Search className="mr-2 size-5" />
          Abrir equipamento
        </Button>
      </form>
    </div>
  );
}

function PendingRecordsCard({
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
        {records.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-center">
            <p className="text-sm font-medium">Tudo enviado</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Nenhum registro aguardando sincronização.
            </p>
          </div>
        ) : (
          <>
            <div className="max-h-72 space-y-2 overflow-y-auto">
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
        )}
      </CardContent>
    </Card>
  );
}

function PendingRecordRow({ record }: { record: PendingRecord }) {
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
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          aria-label={`Descartar registro ${record.qrToken}`}
          onClick={() => {
            if (window.confirm("Descartar este registro pendente?")) {
              void removePendingRecord(record.id);
            }
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
