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
  units: GridUnit[];
};

export type ProjectTab =
  | "building"
  | "torres"
  | "dashboard"
  | "global"
  | "entregas"
  | "editar"
  | "assistente";

const TABS: { id: ProjectTab; label: string; to: string }[] = [
  { id: "building", label: "Prédio", to: "/engenharia/relatorios/$projectId" },
  {
    id: "torres",
    label: "Torres",
    to: "/engenharia/relatorios/$projectId/torres",
  },
  {
    id: "dashboard",
    label: "Dashboard",
    to: "/engenharia/relatorios/$projectId/dashboard",
  },
  { id: "global", label: "Global", to: "/engenharia/relatorios/$projectId/global" },
  {
    id: "entregas",
    label: "Entregas",
    to: "/engenharia/relatorios/$projectId/entregas",
  },
  {
    id: "editar",
    label: "Editar layout",
    to: "/engenharia/relatorios/$projectId/editar",
  },
  {
    id: "assistente",
    label: "Assistente IA",
    to: "/engenharia/relatorios/$projectId/assistente",
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
              {project.floors.length} andar
              {project.floors.length === 1 ? "" : "es"} · {project.units.length}{" "}
              apartamentos · {project.totalItems} equipamentos previstos
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Instalados" value={project.installedItems} accent />
        <StatTile label="Pendentes" value={pending} />
        <StatTile label="Em atraso" value={overdue} danger={overdue > 0} />
        <StatTile label="Progresso" value={`${pct}%`} />
      </div>

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

function StatTile({
  label,
  value,
  accent = false,
  danger = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-2xl font-bold tabular-nums",
          accent && "text-primary",
          danger && "text-red-600"
        )}
      >
        {value}
      </p>
    </div>
  );
}
