import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Building2, Plus, Layers, ChevronRight } from "lucide-react";

import { AuthShell } from "@/components/auth-shell";
import { ProjectFormDialog } from "@/components/engenharia/project-form-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { obraLinkSlug } from "@/lib/engenharia/obra-paths";

export const Route = createFileRoute("/engenharia/obras/")({
  component: () => (
    <AuthShell>
      <ObrasPage />
    </AuthShell>
  ),
});

type ProjectSummary = {
  _id: string;
  slug: string;
  name: string;
  legacyNumber: number | null;
  customerName: string | null;
  floors: { number: number; label: string }[];
  createdAt: number;
  totalItems: number;
  installedItems: number;
  unitCount: number;
};

function ObrasPage() {
  const projects = useQuery(api.projects.list, {});

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Obras</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe o avanço das instalações prédio por prédio.
          </p>
        </div>
        <ProjectFormDialog
          trigger={
            <Button>
              <Plus className="mr-2 size-4" />
              Nova obra
            </Button>
          }
        />
      </div>

      {projects === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-44 animate-pulse" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project._id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Building2 className="size-7" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Nenhuma obra cadastrada</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Crie a primeira obra para montar o prédio e acompanhar o que já foi
            instalado em cada andar.
          </p>
        </div>
        <ProjectFormDialog
          trigger={
            <Button>
              <Plus className="mr-2 size-4" />
              Criar primeira obra
            </Button>
          }
        />
      </CardContent>
    </Card>
  );
}

function ProjectCard({ project }: { project: ProjectSummary }) {
  const pct =
    project.totalItems === 0
      ? 0
      : Math.round((project.installedItems / project.totalItems) * 100);
  const date = new Date(project.createdAt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <Link
      to="/engenharia/obras/$obraSlug"
      params={{ obraSlug: obraLinkSlug(project) }}
      className="group block"
    >
      <Card className="h-full transition-shadow group-hover:shadow-md">
        <CardContent className="flex h-full flex-col gap-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <h2 className="truncate text-lg font-semibold">
                {project.legacyNumber ? `#${project.legacyNumber} · ` : ""}
                {project.name}
              </h2>
              {project.customerName && (
                <p className="truncate text-sm text-muted-foreground">
                  {project.customerName}
                </p>
              )}
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Layers className="size-3.5" />
                {project.floors.length} andar
                {project.floors.length === 1 ? "" : "es"} ·{" "}
                {project.unitCount} aptos · {date}
              </p>
            </div>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>

          <div className="mt-auto space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Instalados</span>
              <span className="text-sm font-semibold tabular-nums">
                {project.installedItems}/{project.totalItems}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-right text-xs text-muted-foreground tabular-nums">
              {pct}% concluído
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
