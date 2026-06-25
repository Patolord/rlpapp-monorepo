import { useState, type ReactNode } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  Building2,
  Loader2,
  Printer,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getUnitState, type GridFloor, type GridUnit } from "@/components/engenharia/building";
import { AiChatPanel } from "@/components/engenharia/ai/ai-chat-panel";

export type ProjectStatus =
  | "planning"
  | "in_progress"
  | "completed"
  | "paused";

export type ProjectOverview = {
  _id: Id<"projects">;
  name: string;
  floors: GridFloor[];
  client?: string | null;
  address?: string | null;
  status?: ProjectStatus | null;
  responsibleId?: Id<"users"> | null;
  responsibleName?: string | null;
  startDate?: number | null;
  endDate?: number | null;
  createdAt: number;
  totalItems: number;
  installedItems: number;
  hierarchyFloors: number;
  hierarchyEnvironments: number;
  units: GridUnit[];
};

export type ProjectTab =
  | "building"
  | "global"
  | "entregas"
  | "assistente";

const TABS: { id: ProjectTab; label: string; to: string }[] = [
  { id: "building", label: "Prédio", to: "/engenharia/relatorios/$projectId" },
  { id: "global", label: "Global", to: "/engenharia/relatorios/$projectId/global" },
  {
    id: "entregas",
    label: "Entregas",
    to: "/engenharia/relatorios/$projectId/entregas",
  },
];

export function ProjectShell({
  projectId,
  tab,
  children,
}: {
  projectId: string;
  tab: ProjectTab;
  children: (project: ProjectOverview, now: number) => ReactNode;
}) {
  const project = useQuery(api.projects.getOverview, {
    projectId: projectId as Id<"projects">,
  });
  const now = Date.now();

  if (project === undefined) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (project === null) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <Building2 className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Obra não encontrada</h1>
        <p className="mt-2 text-muted-foreground">
          Esta obra pode ter sido removida.
        </p>
        <Button
          variant="outline"
          className="mt-6"
          render={<Link to="/engenharia/relatorios" />}
        >
          <ArrowLeft className="mr-2 size-4" />
          Voltar para obras
        </Button>
      </div>
    );
  }

  const aiContext = [
    `Obra: ${project.name}`,
    project.client ? `Cliente: ${project.client}` : "",
    `Andares (legado): ${project.floors
      .map((f) => `${f.number} (${f.label})`)
      .join(", ")}`,
    `Equipamentos previstos: ${project.totalItems}, instalados: ${project.installedItems}`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <ProjectShellLayout
      project={project}
      now={now}
      tab={tab}
      aiContext={aiContext}
    >
      {children}
    </ProjectShellLayout>
  );
}

const AI_PANEL_STORAGE_KEY = "engenharia.aiPanel.open";

function ProjectShellLayout({
  project,
  now,
  tab,
  aiContext,
  children,
}: {
  project: ProjectOverview;
  now: number;
  tab: ProjectTab;
  aiContext: string;
  children: (project: ProjectOverview, now: number) => ReactNode;
}) {
  const [aiOpen, setAiOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(AI_PANEL_STORAGE_KEY) !== "false";
  });

  function setAiOpenPersist(next: boolean) {
    setAiOpen(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AI_PANEL_STORAGE_KEY, String(next));
    }
  }

  const pending = project.totalItems - project.installedItems;
  const pct =
    project.totalItems === 0
      ? 0
      : Math.round((project.installedItems / project.totalItems) * 100);
  const overdue = project.units.filter(
    (u) => getUnitState(u, now).overdue
  ).length;

  return (
    <div
      className={cn(
        "mx-auto max-w-7xl space-y-6 transition-[padding] duration-200",
        aiOpen && "lg:pr-116"
      )}
    >
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2"
          render={<Link to="/engenharia/relatorios" />}
        >
          <ArrowLeft className="mr-1.5 size-4" />
          Obras
        </Button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <p className="text-sm text-muted-foreground">
              {project.hierarchyFloors > 0
                ? `${project.hierarchyFloors} andar${project.hierarchyFloors === 1 ? "" : "es"}`
                : `${project.floors.length} andar${project.floors.length === 1 ? "" : "es"}`}
              {" · "}
              {project.units.length > 0
                ? `${project.units.length} apartamentos`
                : project.hierarchyEnvironments > 0
                  ? `${project.hierarchyEnvironments} ambientes`
                  : "0 apartamentos"}
              {" · "}
              {project.totalItems} equipamentos previstos
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            render={
              <Link
                to="/engenharia/relatorios/$projectId/imprimir"
                params={{ projectId: project._id }}
              />
            }
          >
            <Printer className="mr-1.5 size-4" />
            Imprimir
          </Button>
        </div>
      </div>

      <ProgressSummary
        installed={project.installedItems}
        pending={pending}
        overdue={overdue}
        pct={pct}
      />

      <ProjectTabs projectId={project._id} active={tab} />

      {children(project, now)}

      {!aiOpen && (
        <Button
          size="lg"
          className="fixed bottom-6 right-6 z-40 rounded-full shadow-lg"
          onClick={() => setAiOpenPersist(true)}
        >
          <Sparkles className="mr-2 size-4" />
          Assistente IA
        </Button>
      )}
      <AiChatPanel
        projectId={project._id}
        context={aiContext}
        open={aiOpen}
        onOpenChange={setAiOpenPersist}
      />
    </div>
  );
}

function ProjectTabs({
  projectId,
  active,
}: {
  projectId: string;
  active: ProjectTab;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b">
      {TABS.map((t) => (
        <Link
          key={t.id}
          to={t.to}
          params={{ projectId }}
          className={cn(
            "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            active === t.id
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

/**
 * Resumo compacto de progresso da obra: uma barra com a porcentagem instalada e
 * contadores inline, em vez de quatro cartões grandes de métricas.
 */
function ProgressSummary({
  installed,
  pending,
  overdue,
  pct,
}: {
  installed: number;
  pending: number;
  overdue: number;
  pct: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-card px-4 py-3 shadow-sm">
      <div className="flex min-w-40 flex-1 items-center gap-3">
        <span className="text-2xl font-bold tabular-nums text-primary">
          {pct}%
        </span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="flex items-center gap-x-4 text-sm">
        <SummaryStat label="Instalados" value={installed} className="text-green-700" />
        <SummaryStat label="Pendentes" value={pending} />
        <SummaryStat
          label="Em atraso"
          value={overdue}
          className={overdue > 0 ? "text-red-600" : undefined}
        />
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={cn("font-bold tabular-nums", className)}>{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
