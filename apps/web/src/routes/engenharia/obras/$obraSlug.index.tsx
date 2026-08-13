import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Building2,
  Calculator,
  ClipboardCheck,
  FileText,
  Package,
  Warehouse,
  Wind,
  type LucideIcon,
} from "lucide-react";

import { AuthShell } from "@/components/auth-shell";
import {
  ProjectShell,
  type ProjectOverview,
} from "@/components/engenharia/project-shell";
import { useObraProjectId } from "@/lib/engenharia/obra-context";
import { obraLinkSlug } from "@/lib/engenharia/obra-paths";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/engenharia/obras/$obraSlug/")({
  component: () => (
    <AuthShell>
      <ObraHubPage />
    </AuthShell>
  ),
});

function ObraHubPage() {
  const projectId = useObraProjectId();
  return (
    <ProjectShell projectId={projectId}>
      {(project) => <ObraHubContent project={project} />}
    </ProjectShell>
  );
}

type ModuleTile = {
  to:
    | "/engenharia/obras/$obraSlug/predio"
    | "/engenharia/obras/$obraSlug/orcamento"
    | "/engenharia/obras/$obraSlug/dutos"
    | "/engenharia/obras/$obraSlug/contratos"
    | "/engenharia/obras/$obraSlug/medicoes"
    | "/engenharia/obras/$obraSlug/compras"
    | "/engenharia/obras/$obraSlug/estoque";
  label: string;
  description: string;
  icon: LucideIcon;
  progress?: { installed: number; total: number };
};

function ObraHubContent({ project }: { project: ProjectOverview }) {
  const slug = obraLinkSlug(project);
  const pct =
    project.totalItems === 0
      ? 0
      : Math.round((project.installedItems / project.totalItems) * 100);

  const modules: ModuleTile[] = [
    {
      to: "/engenharia/obras/$obraSlug/predio",
      label: "Prédio",
      description: "Torres, andares, ambientes e equipamentos",
      icon: Building2,
      progress: {
        installed: project.installedItems,
        total: project.totalItems,
      },
    },
    {
      to: "/engenharia/obras/$obraSlug/orcamento",
      label: "Orçamento",
      description: "Takeoffs e estimativas de materiais",
      icon: Calculator,
    },
    {
      to: "/engenharia/obras/$obraSlug/dutos",
      label: "Dutos",
      description: "Levantamento NBR 16401 e quantitativos",
      icon: Wind,
    },
    {
      to: "/engenharia/obras/$obraSlug/contratos",
      label: "Contratos",
      description: "Vendas ao cliente e contratações de empreiteiros",
      icon: FileText,
    },
    {
      to: "/engenharia/obras/$obraSlug/medicoes",
      label: "Medições",
      description: "Medições de faturamento dos contratos da obra",
      icon: ClipboardCheck,
    },
    {
      to: "/engenharia/obras/$obraSlug/compras",
      label: "Compras",
      description: "Takeoffs da obra e preços de referência",
      icon: Package,
    },
    {
      to: "/engenharia/obras/$obraSlug/estoque",
      label: "Estoque",
      description: "Saldos e movimentações desta obra",
      icon: Warehouse,
    },
  ];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Módulos da obra</h2>
        <p className="text-sm text-muted-foreground">
          Escolha uma área para trabalhar neste projeto.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <Link
              key={mod.to}
              to={mod.to}
              params={{ obraSlug: slug }}
              className={cn(
                "group relative flex flex-col gap-3 rounded-xl border bg-card p-5",
                "transition-colors hover:border-foreground/20 hover:bg-muted/40",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
            >
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background text-foreground/80 group-hover:border-foreground/15">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 space-y-1">
                  <h3 className="font-semibold tracking-tight">{mod.label}</h3>
                  <p className="text-sm text-muted-foreground">
                    {mod.description}
                  </p>
                </div>
              </div>
              {mod.progress && mod.progress.total > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between text-xs tabular-nums text-muted-foreground">
                    <span>
                      {mod.progress.installed}/{mod.progress.total} instalados
                    </span>
                    <span className="font-medium text-foreground">{pct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
