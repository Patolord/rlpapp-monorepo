import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Camera,
  ChevronRight,
  FileText,
  History,
  Package,
  QrCode,
  Search,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

import { FieldPageShell } from "@/components/campo/field-page-shell";
import {
  OBRA_STATUS_LABELS,
  obraSubtitle,
  obraTitle,
  useFieldObra,
} from "@/components/campo/obra-context";
import { PendingBanner } from "@/components/campo/pending-records";
import { extractQrToken } from "@/components/engenharia/field-qr-scanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOnline } from "@/lib/use-online";

export const Route = createFileRoute("/qr-operador_/obras/$obraSlug/")({
  component: CampoObraHubPage,
});

type ObraRoute =
  | "/qr-operador/obras/$obraSlug/documentos"
  | "/qr-operador/obras/$obraSlug/etiquetas"
  | "/qr-operador/obras/$obraSlug/estoque"
  | "/qr-operador/obras/$obraSlug/registros";

function CampoObraHubPage() {
  const { obra, obraSlug, fromCache } = useFieldObra();
  const online = useOnline();
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  function openTyped(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = extractQrToken(code);
    if (!token) return;
    setCode("");
    void navigate({
      to: "/qr-operador/obras/$obraSlug/etiqueta/$token",
      params: { obraSlug, token },
    });
  }

  const tiles: Array<{
    key: string;
    label: string;
    description: string;
    icon: LucideIcon;
    badge: string | null;
    to: ObraRoute;
    /** Só faz sentido (e só funciona no backend) para técnicos atribuídos. */
    requiresAssignment: boolean;
  }> = [
    {
      key: "etiquetas",
      label: "Etiquetas da obra",
      description: "Equipamentos cadastrados e etiquetas livres.",
      icon: QrCode,
      badge: `${obra.registeredCount}/${obra.qrCount} cadastradas`,
      to: "/qr-operador/obras/$obraSlug/etiquetas" as const,
      requiresAssignment: false,
    },
    {
      key: "registros",
      label: "Meus registros nesta obra",
      description: "Serviços e cadastros que você enviou aqui.",
      icon: History,
      badge: null,
      to: "/qr-operador/obras/$obraSlug/registros" as const,
      requiresAssignment: false,
    },
    {
      key: "documentos",
      label: "Documentos",
      description: "PDFs liberados pela engenharia para esta obra.",
      icon: FileText,
      badge: `${obra.documentCount} PDF${obra.documentCount === 1 ? "" : "s"}`,
      to: "/qr-operador/obras/$obraSlug/documentos" as const,
      requiresAssignment: true,
    },
    {
      key: "estoque",
      label: "Estoque",
      description: "Saldo de materiais e pedidos da obra.",
      icon: Package,
      badge: null,
      to: "/qr-operador/obras/$obraSlug/estoque" as const,
      requiresAssignment: true,
    },
  ].filter((tile) => obra.assigned || !tile.requiresAssignment);

  return (
    <FieldPageShell title={obraTitle(obra)} subtitle={obraSubtitle(obra)}>
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 py-2">
        {!obra.assigned && (
          <div className="flex items-start gap-2 rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              Você não está atribuído a esta obra. Pode registrar mesmo assim;
              avise a engenharia se for ficar nela.
            </span>
          </div>
        )}

        <PendingBanner />

        <div className="flex flex-wrap items-center gap-2">
          {obra.status && (
            <Badge variant="secondary">
              {OBRA_STATUS_LABELS[obra.status] ?? obra.status}
            </Badge>
          )}
          {fromCache && (
            <Badge variant="outline">Dados salvos neste aparelho</Badge>
          )}
        </div>

        {/* Ação principal: escanear. Offline, a leitura não resolve a etiqueta. */}
        {online ? (
          <Link
            to="/qr-operador/obras/$obraSlug/escanear"
            params={{ obraSlug }}
            className="flex items-center gap-4 rounded-xl bg-primary p-5 text-primary-foreground transition-opacity hover:opacity-95 active:opacity-90"
          >
            <div className="rounded-xl bg-primary-foreground/15 p-3">
              <Camera className="size-7" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold">Escanear etiqueta</p>
              <p className="text-xs opacity-80">
                Abre a câmera para ler o QR do equipamento
              </p>
            </div>
            <ChevronRight className="size-5 shrink-0" />
          </Link>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            O leitor de QR precisa de conexão para abrir a etiqueta. Digite o
            código abaixo para registrar offline.
          </p>
        )}

        {/* Código manual */}
        <form
          onSubmit={openTyped}
          className="space-y-2 rounded-lg border bg-card p-4"
        >
          <label
            htmlFor="obra-qr-code"
            className="block text-sm font-semibold"
          >
            Etiqueta sem leitura? Digite o código
          </label>
          <div className="flex gap-2">
            <Input
              id="obra-qr-code"
              placeholder="Ex: LORENAH4FC29"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoComplete="off"
              className="h-12 font-mono text-base uppercase placeholder:font-sans placeholder:normal-case"
            />
            <Button type="submit" size="xl" disabled={!code.trim()} className="shrink-0">
              <Search />
              Abrir
            </Button>
          </div>
        </form>

        <div className="grid gap-2">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <Link
                key={tile.key}
                to={tile.to}
                params={{ obraSlug }}
                className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:border-primary/40 hover:bg-muted/40 active:bg-muted/60"
              >
                <div className="rounded-md bg-primary/10 p-2.5">
                  <Icon className="size-6 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{tile.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {tile.description}
                  </p>
                  {tile.badge && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tile.badge}
                    </p>
                  )}
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
          {!obra.assigned && (
            <p className="px-1 text-xs text-muted-foreground">
              Documentos e estoque ficam disponíveis quando a engenharia
              atribuir você a esta obra.
            </p>
          )}
        </div>
      </div>
    </FieldPageShell>
  );
}
