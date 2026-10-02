import { api } from "@rlpapp/backend/convex/_generated/api";
import { Link } from "@tanstack/react-router";
import { Building2, ChevronRight, FileText, Loader2, QrCode } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { obraLinkSlug } from "@/lib/engenharia/obra-paths";
import { useOfflineQuery } from "@/lib/use-offline-query";
import { OBRA_STATUS_LABELS } from "@/components/campo/obra-context";

export const MY_OBRAS_CACHE_KEY = "field:my-projects";

export function MyObrasList() {
  const { data: projects, fromCache, cacheChecked } = useOfflineQuery(
    MY_OBRAS_CACHE_KEY,
    api.technicianPortal.listMyProjects
  );

  if (projects === undefined) {
    if (!cacheChecked) return null;
    return (
      <div className="flex min-h-32 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Carregando suas obras...
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Nenhuma obra atribuída a você. Peça à engenharia para liberar o acesso.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {fromCache && (
        <p className="text-xs text-muted-foreground">
          Lista salva neste aparelho — pode estar desatualizada.
        </p>
      )}
      {projects.map((project) => (
        <Link
          key={project._id}
          to="/qr-operador/obras/$obraSlug"
          params={{ obraSlug: obraLinkSlug(project) }}
          className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-muted/40 active:bg-muted/60"
        >
          <div className="rounded-md bg-muted p-2">
            <Building2 className="size-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="truncate text-sm font-semibold">
              {project.legacyNumber ? `#${project.legacyNumber} · ` : ""}
              {project.name}
            </p>
            {(project.client || project.address) && (
              <p className="truncate text-xs text-muted-foreground">
                {[project.client, project.address].filter(Boolean).join(" · ")}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {project.status && (
                <Badge variant="secondary">
                  {OBRA_STATUS_LABELS[project.status] ?? project.status}
                </Badge>
              )}
              <span className="inline-flex items-center gap-1">
                <FileText className="size-3.5" />
                {project.documentCount} PDF{project.documentCount === 1 ? "" : "s"}
              </span>
              <span className="inline-flex items-center gap-1">
                <QrCode className="size-3.5" />
                {project.qrCount} etiqueta{project.qrCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}
