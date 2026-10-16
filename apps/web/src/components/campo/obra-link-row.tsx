import { Link } from "@tanstack/react-router";
import { Building2, ChevronRight, FileText, QrCode } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { obraLinkSlug } from "@/lib/engenharia/obra-paths";
import { OBRA_STATUS_LABELS, obraSubtitle, obraTitle } from "./obra-context";

interface ObraLinkRowProps {
  project: {
    _id: string;
    slug?: string | null;
    name: string;
    legacyNumber: number | null;
    client: string | null;
    address: string | null;
    status: string | null;
    qrCount: number;
    registeredCount: number;
    documentCount?: number;
  };
}

/** Linha de obra que leva ao hub da obra (lista do técnico e busca geral). */
export function ObraLinkRow({ project }: ObraLinkRowProps) {
  const subtitle = obraSubtitle(project);
  return (
    <Link
      to="/qr-operador/obras/$obraSlug"
      params={{ obraSlug: obraLinkSlug(project) }}
      className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/40 active:bg-muted/60"
    >
      <div className="rounded-md bg-muted p-2">
        <Building2 className="size-5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-semibold">{obraTitle(project)}</p>
        {subtitle && (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {project.status && (
            <Badge variant="secondary">
              {OBRA_STATUS_LABELS[project.status] ?? project.status}
            </Badge>
          )}
          <span className="inline-flex items-center gap-1 tabular-nums">
            <QrCode className="size-3.5" />
            {project.registeredCount}/{project.qrCount} etiquetas cadastradas
          </span>
          {project.documentCount !== undefined && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <FileText className="size-3.5" />
              {project.documentCount} PDF{project.documentCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
