import { useMemo, useState, type ReactNode } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import type { ProjectHierarchy } from "@/components/engenharia/building-panel/hierarchy";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  ChevronDown,
  Loader2,
  Printer,
  QrCode,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getUnitState, type GridFloor, type GridUnit } from "@/components/engenharia/building";
import { AiChatPanel } from "@/components/engenharia/ai/ai-chat-panel";
import { AssignTechniciansDialog } from "@/components/engenharia/assign-technicians-dialog";
import {
  OBRAS_LIST_PATH,
  obraLinkSlug,
} from "@/lib/engenharia/obra-paths";

export type ProjectStatus =
  | "planning"
  | "in_progress"
  | "completed"
  | "paused";

export type ProjectOverview = {
  _id: Id<"projects">;
  name: string;
  slug: string;
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

export function ProjectShell({
  projectId,
  children,
}: {
  projectId: string;
  children: (project: ProjectOverview, now: number) => ReactNode;
}) {
  const project = useQuery(api.projects.getOverview, {
    projectId: projectId as Id<"projects">,
  });
  const now = Date.now();

  const hierarchy = useQuery(api.projects.getHierarchy, {
    projectId: projectId as Id<"projects">,
  }) as ProjectHierarchy | null | undefined;

  const aiContext = useMemo(() => {
    if (!project) return "";

    const parts: string[] = [
      `Obra: ${project.name}`,
      project.client ? `Cliente: ${project.client}` : "",
      `Equipamentos previstos: ${project.totalItems}, instalados: ${project.installedItems}`,
    ];

    if (hierarchy && hierarchy.towers.length > 0) {
      if (hierarchy.systems.length > 0) {
        parts.push(
          `Sistemas existentes: ${hierarchy.systems
            .map((s) => `"${s.name}"${s.type ? ` (${s.type})` : ""}`)
            .join(", ")}`
        );
      }
      parts.push("--- Hierarquia atual ---");
      for (const tower of hierarchy.towers) {
        parts.push(`Torre: "${tower.name}"`);
        for (const floor of tower.floors) {
          const envNames = floor.environments
            .map((e) => {
              const size: string[] = [];
              if (e.colSpan && e.colSpan > 1)
                size.push(`${e.colSpan} colunas`);
              if (e.rowSpan && e.rowSpan > 1) size.push(`${e.rowSpan} andares`);
              return `"${e.name}" (${e.equipment.length} equip.${
                size.length ? `, ${size.join(", ")}` : ""
              })`;
            })
            .join(", ");
          parts.push(
            `  ${floor.label} (nº ${floor.number}): ${envNames || "sem ambientes"}`
          );
        }
      }
    } else if (project.floors.length > 0) {
      parts.push(
        `Andares (legado): ${project.floors
          .map((f) => `${f.number} (${f.label})`)
          .join(", ")}`
      );
    }

    return parts.filter(Boolean).join("\n");
  }, [project, hierarchy]);

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
          render={<Link to={OBRAS_LIST_PATH} />}
        >
          <ArrowLeft className="mr-2 size-4" />
          Voltar para obras
        </Button>
      </div>
    );
  }

  return (
    <ProjectShellLayout
      project={project}
      now={now}
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
  aiContext,
  children,
}: {
  project: ProjectOverview;
  now: number;
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

  const [metricsOpen, setMetricsOpen] = useState(false);

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
          render={<Link to={OBRAS_LIST_PATH} />}
        >
          <ArrowLeft className="mr-1.5 size-4" />
          Obras
        </Button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{project.name}</h1>
              <span className="hidden items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium tabular-nums sm:flex">
                <span className="text-primary">{pct}%</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-green-700">{project.installedItems}</span>
                <span className="text-muted-foreground">/</span>
                <span>{project.totalItems}</span>
              </span>
            </div>
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
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setMetricsOpen((v) => !v)}
              title="Visualizar métricas"
              className="size-9"
            >
              <BarChart3 className="size-4" />
            </Button>
            <AssignTechniciansDialog projectId={project._id} />
            <Button
              variant="outline"
              size="sm"
              render={
                <Link
                  to="/engenharia/obras/$obraSlug/qr-codes"
                  params={{ obraSlug: obraLinkSlug(project) }}
                />
              }
            >
              <QrCode className="mr-1.5 size-4" />
              QR Codes
            </Button>
            <Button
              variant="outline"
              size="sm"
              render={
                <Link
                  to="/engenharia/obras/$obraSlug/orcamento"
                  params={{ obraSlug: obraLinkSlug(project) }}
                />
              }
            >
              Orçamento
            </Button>
            <Button
              variant="outline"
              size="sm"
              render={
                <Link
                  to="/engenharia/obras/$obraSlug/medicoes"
                  params={{ obraSlug: obraLinkSlug(project) }}
                />
              }
            >
              Medições
            </Button>
            <Button
              variant="outline"
              size="sm"
              render={
                <Link
                  to="/engenharia/obras/$obraSlug/imprimir"
                  params={{ obraSlug: obraLinkSlug(project) }}
                />
              }
            >
              <Printer className="mr-1.5 size-4" />
              Imprimir
            </Button>
          </div>
        </div>
      </div>

      {metricsOpen && (
        <ProgressSummary
          installed={project.installedItems}
          pending={pending}
          overdue={overdue}
          pct={pct}
          onCollapse={() => setMetricsOpen(false)}
        />
      )}

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

/**
 * Resumo compacto de progresso da obra: uma barra com a porcentagem instalada e
 * contadores inline, em vez de quatro cartões grandes de métricas.
 */
function ProgressSummary({
  installed,
  pending,
  overdue,
  pct,
  onCollapse,
}: {
  installed: number;
  pending: number;
  overdue: number;
  pct: number;
  onCollapse: () => void;
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
      <button
        type="button"
        onClick={onCollapse}
        className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Minimizar métricas"
      >
        <ChevronDown className="size-4 rotate-180" />
      </button>
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
