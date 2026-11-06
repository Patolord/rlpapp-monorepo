import { Link } from "@tanstack/react-router";
import { Building2, MoreVertical } from "lucide-react";

import {
  DashboardCardTitle,
  ViewAllLink,
  cardCls,
  type Overview,
} from "@/components/dashboard/dashboard-card";
import { obraLinkSlug } from "@/lib/engenharia/obra-paths";

const statusLabels: Record<string, string> = {
  planning: "Planejamento",
  in_progress: "Em andamento",
  completed: "Concluída",
  paused: "Pausada",
};

export function ProjectsCard({
  projects,
  now,
}: {
  projects: Overview["projects"];
  now: number;
}) {
  return (
    <div className={`${cardCls} p-6`}>
      <DashboardCardTitle
        title="Andamento das obras"
        action={<ViewAllLink label="Ver todas as obras" />}
      />

      {projects.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">
          Nenhuma obra ativa no momento.
        </p>
      ) : (
        <div className="mt-4 divide-y divide-slate-100">
          {projects.map((project) => (
            <ProjectRow key={project._id} project={project} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectRow({
  project,
  now,
}: {
  project: Overview["projects"][number];
  now: number;
}) {
  const deliveryLabel = project.endDate
    ? new Date(project.endDate).toLocaleDateString("pt-BR")
    : "Sem prazo";
  const overdueDays =
    project.overdue && project.endDate
      ? Math.floor((now - project.endDate) / (1000 * 60 * 60 * 24))
      : 0;

  return (
    <Link
      to="/engenharia/obras/$obraSlug"
      params={{ obraSlug: obraLinkSlug(project) }}
      className="group flex items-center gap-4 py-3.5"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
        <Building2 className="size-4" />
      </div>

      <div className="w-40 min-w-0 shrink-0">
        <p className="truncate text-sm font-semibold text-slate-900">
          {project.name}
        </p>
        <p className="truncate text-xs text-slate-400">
          {project.address ?? statusLabels[project.status ?? ""] ?? "Obra"}
        </p>
      </div>

      <div className="flex flex-1 items-center gap-3">
        <span className="w-10 shrink-0 text-sm font-semibold tabular-nums text-slate-900">
          {project.pct}%
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className={
              "h-full w-full rounded-full transition-transform duration-300 ease-snappy motion-reduce:transition-none " +
              (project.overdue ? "bg-red-600" : "bg-primary")
            }
            style={{ transform: `translateX(${project.pct - 100}%)` }}
          />
        </div>
      </div>

      <div className="w-28 shrink-0 text-right">
        {project.overdue ? (
          <>
            <p className="text-xs font-medium text-red-600">Atrasada</p>
            <p className="text-xs text-slate-400">
              {overdueDays > 0 ? `${overdueDays} dias` : "no prazo final"}
            </p>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-400">Entrega prevista</p>
            <p className="text-xs font-medium text-slate-600">{deliveryLabel}</p>
          </>
        )}
      </div>

      <MoreVertical className="size-4 shrink-0 text-slate-300 group-hover:text-slate-400" />
    </Link>
  );
}
