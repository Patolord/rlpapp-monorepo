import { api } from "@rlpapp/backend/convex/_generated/api";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Building2, ChevronRight, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { obraLinkSlug } from "@/lib/engenharia/obra-paths";

const STATUS_LABELS: Record<string, string> = {
  planning: "Planejamento",
  in_progress: "Em andamento",
  completed: "Concluída",
  paused: "Pausada",
};

export function CampoObraStockList() {
  const projects = useQuery(api.technicianPortal.listMyProjects);

  if (projects === undefined) {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
        Nenhuma obra atribuída. Peça à engenharia para liberar o acesso.
      </p>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-3">
      {projects.map((project) => (
        <Link
          key={project._id}
          to="/qr-operador/estoque/$obraSlug"
          params={{ obraSlug: obraLinkSlug(project) }}
          className="block"
        >
          <Card className="transition-colors hover:border-primary/50">
            <CardContent className="flex items-center gap-3 py-4">
              <Building2 className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {project.legacyNumber ? `#${project.legacyNumber} · ` : ""}
                  {project.name}
                </p>
                {project.status && (
                  <Badge variant="secondary" className="mt-1">
                    {STATUS_LABELS[project.status] ?? project.status}
                  </Badge>
                )}
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
