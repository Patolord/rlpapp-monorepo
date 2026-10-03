import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronRight,
  FileText,
  History,
  Package,
  QrCode,
  type LucideIcon,
} from "lucide-react";

import { FieldPageShell } from "@/components/campo/field-page-shell";
import {
  OBRA_STATUS_LABELS,
  obraTitle,
  useFieldObra,
} from "@/components/campo/obra-context";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/qr-operador_/obras/$obraSlug/")({
  component: CampoObraHubPage,
});

function CampoObraHubPage() {
  const { obra, obraSlug, fromCache } = useFieldObra();

  const tiles: Array<{
    key: string;
    label: string;
    description: string;
    icon: LucideIcon;
    badge: string | null;
    to:
      | "/qr-operador/obras/$obraSlug/documentos"
      | "/qr-operador/obras/$obraSlug/etiquetas"
      | "/qr-operador/obras/$obraSlug/estoque";
    offlineReady: boolean;
  }> = [
    {
      key: "documentos",
      label: "Documentos",
      description: "PDFs liberados pela engenharia para esta obra.",
      icon: FileText,
      badge: `${obra.documentCount} PDF${obra.documentCount === 1 ? "" : "s"}`,
      to: "/qr-operador/obras/$obraSlug/documentos",
      offlineReady: true,
    },
    {
      key: "etiquetas",
      label: "Etiquetas QR",
      description: "Equipamentos cadastrados e etiquetas livres.",
      icon: QrCode,
      badge: `${obra.registeredCount}/${obra.qrCount} cadastradas`,
      to: "/qr-operador/obras/$obraSlug/etiquetas",
      offlineReady: false,
    },
    {
      key: "estoque",
      label: "Estoque",
      description: "Saldo de materiais e pedidos da obra.",
      icon: Package,
      badge: null,
      to: "/qr-operador/obras/$obraSlug/estoque",
      offlineReady: false,
    },
  ];

  return (
    <FieldPageShell
      title={obraTitle(obra)}
      subtitle={[obra.client, obra.address].filter(Boolean).join(" · ") || undefined}
    >
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 py-2">
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

          <Link
            to="/meus-registros"
            search={{ action: "history" }}
            className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:border-primary/40 hover:bg-muted/40 active:bg-muted/60"
          >
            <div className="rounded-md bg-muted p-2.5">
              <History className="size-6 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Meus registros</p>
              <p className="text-xs text-muted-foreground">
                Serviços e fotos enviados por você, inclusive os pendentes.
              </p>
            </div>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
          </Link>
        </div>
      </div>
    </FieldPageShell>
  );
}
