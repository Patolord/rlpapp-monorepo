import { useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  MoreVertical,
  ScanLine,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/app/")({
  component: DashboardPage,
});

type Overview = FunctionReturnType<typeof api.dashboard.getDirectorOverview>;

const cardCls = "rounded-xl border border-slate-100 bg-white shadow-sm";
const eyebrowCls =
  "text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400";

function DashboardPage() {
  const [now] = useState(() => Date.now());
  const currentUser = useQuery(api.users.getCurrentUser);
  const overview = useQuery(api.dashboard.getDirectorOverview, { now });

  const firstName = currentUser?.name?.split(" ")[0] ?? "";

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <DashboardHeader firstName={firstName} now={now} />

      {overview === undefined ? (
        <DashboardSkeleton />
      ) : (
        <>
          <KpiBand overview={overview} />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <ProjectsCard projects={overview.projects} now={now} />
            <CriticalPendingCard pending={overview.criticalPending} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <RecentActivityCard activity={overview.recentActivity} now={now} />
            <WeeklySummaryCard summary={overview.weeklySummary} />
          </div>
        </>
      )}
    </div>
  );
}

function greetingForHour(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function DashboardHeader({
  firstName,
  now,
}: {
  firstName: string;
  now: number;
}) {
  const date = new Date(now);
  const greeting = greetingForHour(date.getHours());
  const dateLabel = date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {greeting}
        {firstName ? `, ${firstName}` : ""}
      </h1>
      <p className="text-sm capitalize text-slate-500">{dateLabel}</p>
    </div>
  );
}

function KpiCell({
  label,
  value,
  detail,
  index,
}: {
  label: string;
  value: string;
  detail: string;
  index: number;
}) {
  const dividers = [
    "",
    "border-l border-slate-100",
    "border-t border-slate-100 xl:border-t-0 xl:border-l",
    "border-l border-t border-slate-100 xl:border-t-0",
  ];

  return (
    <div className={`px-6 py-5 ${dividers[index]}`}>
      <p className="text-[30px] font-semibold leading-none tabular-nums text-slate-900">
        {value}
      </p>
      <p className={`mt-2.5 ${eyebrowCls}`}>{label}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function KpiBand({ overview }: { overview: Overview }) {
  const { kpis } = overview;

  const cells = [
    {
      label: "Obras ativas",
      value: kpis.activeProjects.toString(),
      detail:
        kpis.newProjectsThisMonth > 0
          ? `${kpis.newProjectsThisMonth} novas este mês`
          : "Nenhuma nova este mês",
    },
    {
      label: "Equipamentos",
      value: kpis.totalEquipment.toString(),
      detail:
        kpis.newEquipmentThisMonth > 0
          ? `${kpis.newEquipmentThisMonth} este mês`
          : "Cadastro nas obras",
    },
    {
      label: "Checklists",
      value: `${kpis.checklistCompliance}%`,
      detail: "Conformidade geral",
    },
    {
      label: "Códigos QR",
      value: kpis.qrTotal.toString(),
      detail: `${kpis.qrLinked} vinculados`,
    },
  ];

  return (
    <div className={`${cardCls} grid grid-cols-2 xl:grid-cols-4`}>
      {cells.map((cell, i) => (
        <KpiCell key={cell.label} index={i} {...cell} />
      ))}
    </div>
  );
}

const statusLabels: Record<string, string> = {
  planning: "Planejamento",
  in_progress: "Em andamento",
  completed: "Concluída",
  paused: "Pausada",
};

function CardTitle({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className={eyebrowCls}>{title}</h2>
      {action}
    </div>
  );
}

function ViewAllLink({ label = "Ver todas" }: { label?: string }) {
  return (
    <Link
      to="/engenharia/relatorios"
      className="text-sm font-medium text-primary hover:underline"
    >
      {label}
    </Link>
  );
}

function ProjectsCard({
  projects,
  now,
}: {
  projects: Overview["projects"];
  now: number;
}) {
  return (
    <div className={`${cardCls} p-6`}>
      <CardTitle
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
      to="/engenharia/relatorios/$projectId"
      params={{ projectId: project._id }}
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
              "h-full rounded-full transition-all " +
              (project.overdue ? "bg-red-600" : "bg-primary")
            }
            style={{ width: `${project.pct}%` }}
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

function CriticalPendingCard({
  pending,
}: {
  pending: Overview["criticalPending"];
}) {
  const items = [
    {
      show: pending.overdueProjects > 0,
      critical: true,
      title: `${pending.overdueProjects} ${
        pending.overdueProjects === 1
          ? "obra está atrasada"
          : "obras estão atrasadas"
      }`,
      description: "Clique para ver detalhes",
    },
    {
      show: pending.environmentsWithoutEquipment > 0,
      critical: false,
      title: `${pending.environmentsWithoutEquipment} ambientes sem equipamento`,
      description: "Requerem atenção",
    },
    {
      show: pending.openWorkItems > 0,
      critical: false,
      title: `${pending.openWorkItems} itens de serviço abertos`,
      description: "Aguardando execução",
    },
  ].filter((i) => i.show);

  return (
    <div className={`${cardCls} p-6`}>
      <CardTitle title="Pendências críticas" action={<ViewAllLink />} />

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <CheckCircle2 className="size-8 text-slate-300" />
          <p className="text-sm text-slate-400">Nenhuma pendência crítica.</p>
        </div>
      ) : (
        <div className="mt-2 divide-y divide-slate-100">
          {items.map((item) => (
            <Link
              key={item.title}
              to="/engenharia/relatorios"
              className="group flex items-center gap-3 py-3.5"
            >
              <span
                className={
                  "size-1.5 shrink-0 rounded-full " +
                  (item.critical ? "bg-red-600" : "bg-slate-400")
                }
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {item.title}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {item.description}
                </p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-slate-300 group-hover:text-slate-400" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const actionLabels: Record<string, string> = {
  installed: "Equipamento instalado",
  tested: "Equipamento testado",
  finalized: "Equipamento finalizado",
  status_changed: "Status alterado",
  created: "Equipamento criado",
  updated: "Equipamento atualizado",
  linked: "Equipamento vinculado",
  unlinked: "Equipamento desvinculado",
};

function relativeTime(from: number, now: number): string {
  const diff = Math.max(0, now - from);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

function RecentActivityCard({
  activity,
  now,
}: {
  activity: Overview["recentActivity"];
  now: number;
}) {
  return (
    <div className={`${cardCls} p-6`}>
      <CardTitle title="Atividades recentes" action={<ViewAllLink />} />

      {activity.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">
          Nenhuma atividade registrada ainda.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {activity.map((item) => (
            <div key={item._id} className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
                <ScanLine className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {actionLabels[item.action] ?? item.action}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {item.equipmentLabel} · {relativeTime(item.createdAt, now)}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
                {item.projectName}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WeeklySummaryCard({
  summary,
}: {
  summary: Overview["weeklySummary"];
}) {
  const cells = [
    { value: summary.checklistsCompleted, label: "Checklists concluídos" },
    { value: summary.equipmentRegistered, label: "Equipamentos registrados" },
    { value: summary.environmentsUpdated, label: "Ambientes atualizados" },
    { value: summary.maintenanceLogs, label: "Registros de campo" },
  ];

  return (
    <div className={`${cardCls} p-6`}>
      <CardTitle
        title="Resumo semanal"
        action={
          <span className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500">
            Esta semana
          </span>
        }
      />
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4">
        {cells.map((cell, i) => {
          const dividers = [
            "",
            "border-l border-slate-100 pl-5",
            "mt-6 sm:mt-0 sm:border-l sm:border-slate-100 sm:pl-5",
            "mt-6 border-l border-slate-100 pl-5 sm:mt-0",
          ];
          return (
          <div
            key={cell.label}
            className={`space-y-1.5 ${dividers[i]}`}
          >
            <p className="text-[26px] font-semibold leading-none tabular-nums text-slate-900">
              {cell.value}
            </p>
            <p className="text-xs text-slate-400">{cell.label}</p>
          </div>
          );
        })}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-32 rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
