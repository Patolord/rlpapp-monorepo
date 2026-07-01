import { useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  AlertCircle,
  Bell,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Layers,
  MoreVertical,
  QrCode,
  ScanLine,
  Search,
  Sparkles,
  TrendingUp,
  Wrench,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/app/")({
  component: DashboardPage,
});

type Overview = FunctionReturnType<typeof api.dashboard.getDirectorOverview>;

const cardCls = "rounded-2xl border border-slate-100 bg-white shadow-sm";

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
          <KpiRow overview={overview} />

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
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const weekday = date.toLocaleDateString("pt-BR", { weekday: "long" });

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">
          {greeting}
          {firstName ? `, ${firstName}` : ""}! <span aria-hidden>👋</span>
        </h1>
        <p className="text-sm text-slate-500">
          Aqui está o resumo do que acontece nas suas obras hoje.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative flex-1 xl:w-80 xl:flex-none">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar obras, equipamentos, ambientes..."
            className="w-full rounded-full border-slate-200 bg-white pl-10 text-sm"
          />
        </div>
        <button
          type="button"
          className="relative flex size-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50"
          aria-label="Notificações"
        >
          <Bell className="size-4" />
          <span className="absolute right-2 top-2 size-2 rounded-full bg-primary" />
        </button>
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2">
          <Calendar className="size-4 text-slate-400" />
          <div className="leading-tight">
            <p className="text-sm font-semibold capitalize text-slate-700">
              {dateLabel}
            </p>
            <p className="text-xs capitalize text-slate-400">{weekday}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

type KpiTone = "blue" | "emerald" | "violet" | "orange";

const toneTile: Record<KpiTone, string> = {
  blue: "bg-blue-50 text-blue-600",
  emerald: "bg-emerald-50 text-emerald-600",
  violet: "bg-violet-50 text-violet-600",
  orange: "bg-orange-50 text-orange-600",
};

function KpiCard({
  tone,
  icon: Icon,
  label,
  value,
  trend,
  trendTone,
}: {
  tone: KpiTone;
  icon: typeof Building2;
  label: string;
  value: string;
  trend: React.ReactNode;
  trendTone: "up" | "neutral" | "danger";
}) {
  return (
    <div className={`${cardCls} p-5`}>
      <div className="flex items-center gap-3">
        <div
          className={`flex size-11 items-center justify-center rounded-xl ${toneTile[tone]}`}
        >
          <Icon className="size-5" />
        </div>
        <span className="text-sm font-medium text-slate-500">{label}</span>
      </div>
      <p className="mt-3 text-[28px] font-bold leading-none text-slate-800">
        {value}
      </p>
      <p
        className={
          "mt-2 flex items-center gap-1 text-xs font-medium " +
          (trendTone === "up"
            ? "text-emerald-600"
            : trendTone === "danger"
              ? "text-red-500"
              : "text-slate-400")
        }
      >
        {trendTone === "up" && <TrendingUp className="size-3.5" />}
        {trend}
      </p>
    </div>
  );
}

function KpiRow({ overview }: { overview: Overview }) {
  const { kpis } = overview;
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        tone="blue"
        icon={Building2}
        label="Obras ativas"
        value={kpis.activeProjects.toString()}
        trend={
          kpis.newProjectsThisMonth > 0
            ? `${kpis.newProjectsThisMonth} novas este mês`
            : "Nenhuma nova este mês"
        }
        trendTone={kpis.newProjectsThisMonth > 0 ? "up" : "neutral"}
      />
      <KpiCard
        tone="emerald"
        icon={Wrench}
        label="Equipamentos"
        value={kpis.totalEquipment.toString()}
        trend={
          kpis.newEquipmentThisMonth > 0
            ? `${kpis.newEquipmentThisMonth} este mês`
            : "Cadastro nas obras"
        }
        trendTone={kpis.newEquipmentThisMonth > 0 ? "up" : "neutral"}
      />
      <KpiCard
        tone="violet"
        icon={ClipboardCheck}
        label="Checklists"
        value={`${kpis.checklistCompliance}%`}
        trend="Conformidade geral"
        trendTone="neutral"
      />
      <KpiCard
        tone="orange"
        icon={QrCode}
        label="Códigos QR"
        value={kpis.qrTotal.toString()}
        trend={`${kpis.qrLinked} vinculados`}
        trendTone={kpis.qrLinked > 0 ? "neutral" : "neutral"}
      />
    </div>
  );
}

const statusLabels: Record<string, string> = {
  planning: "Planejamento",
  in_progress: "Em andamento",
  completed: "Concluída",
  paused: "Pausada",
};

function ProjectsCard({
  projects,
  now,
}: {
  projects: Overview["projects"];
  now: number;
}) {
  return (
    <div className={`${cardCls} p-6`}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-800">
          Andamento das obras
        </h2>
        <Link
          to="/engenharia/relatorios"
          className="text-sm font-medium text-primary hover:underline"
        >
          Ver todas as obras
        </Link>
      </div>

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
      <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
        <Building2 className="size-6" />
      </div>

      <div className="w-40 min-w-0 shrink-0">
        <p className="truncate text-sm font-semibold text-slate-800">
          {project.name}
        </p>
        <p className="truncate text-xs text-slate-400">
          {project.address ?? statusLabels[project.status ?? ""] ?? "Obra"}
        </p>
      </div>

      <div className="flex flex-1 items-center gap-3">
        <span
          className={
            "w-10 shrink-0 text-sm font-bold tabular-nums " +
            (project.overdue ? "text-orange-600" : "text-blue-600")
          }
        >
          {project.pct}%
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className={
              "h-full rounded-full transition-all " +
              (project.overdue ? "bg-orange-500" : "bg-blue-600")
            }
            style={{ width: `${project.pct}%` }}
          />
        </div>
      </div>

      <div className="w-28 shrink-0 text-right">
        {project.overdue ? (
          <>
            <p className="text-xs font-medium text-red-500">Atrasada</p>
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
      icon: AlertCircle,
      bg: "bg-red-50",
      color: "text-red-500",
      title: `${pending.overdueProjects} ${
        pending.overdueProjects === 1
          ? "obra está atrasada"
          : "obras estão atrasadas"
      }`,
      description: "Clique para ver detalhes",
    },
    {
      show: pending.environmentsWithoutEquipment > 0,
      icon: AlertCircle,
      bg: "bg-amber-50",
      color: "text-amber-500",
      title: `${pending.environmentsWithoutEquipment} ambientes sem equipamento`,
      description: "Requerem atenção",
    },
    {
      show: pending.openWorkItems > 0,
      icon: Sparkles,
      bg: "bg-indigo-50",
      color: "text-indigo-500",
      title: `${pending.openWorkItems} itens de serviço abertos`,
      description: "Aguardando execução",
    },
  ].filter((i) => i.show);

  return (
    <div className={`${cardCls} p-6`}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-800">
          Pendências críticas
        </h2>
        <Link
          to="/engenharia/relatorios"
          className="text-sm font-medium text-primary hover:underline"
        >
          Ver todas
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <CheckCircle2 className="size-8 text-emerald-500" />
          <p className="text-sm text-slate-400">
            Nenhuma pendência crítica. Tudo em dia!
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <Link
              key={item.title}
              to="/engenharia/relatorios"
              className={`flex items-center gap-3 rounded-xl ${item.bg} p-3.5 transition-opacity hover:opacity-80`}
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/70">
                <item.icon className={`size-5 ${item.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {item.title}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {item.description}
                </p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-slate-400" />
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

const badgeTones = [
  "bg-blue-50 text-blue-600",
  "bg-emerald-50 text-emerald-600",
  "bg-orange-50 text-orange-600",
  "bg-violet-50 text-violet-600",
];

const activityTints = [
  "bg-blue-50 text-blue-600",
  "bg-emerald-50 text-emerald-600",
  "bg-orange-50 text-orange-600",
];

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
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-800">
          Atividades recentes
        </h2>
        <Link
          to="/engenharia/relatorios"
          className="text-sm font-medium text-primary hover:underline"
        >
          Ver todas
        </Link>
      </div>

      {activity.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">
          Nenhuma atividade registrada ainda.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {activity.map((item, i) => (
            <div key={item._id} className="flex items-center gap-3">
              <div
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${activityTints[i % activityTints.length]}`}
              >
                <ScanLine className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {actionLabels[item.action] ?? item.action}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {item.equipmentLabel} · {relativeTime(item.createdAt, now)}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${badgeTones[i % badgeTones.length]}`}
              >
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
    {
      icon: ClipboardCheck,
      tint: "bg-blue-50 text-blue-600",
      value: summary.checklistsCompleted,
      label: "Checklists concluídos",
    },
    {
      icon: Wrench,
      tint: "bg-emerald-50 text-emerald-600",
      value: summary.equipmentRegistered,
      label: "Equipamentos registrados",
    },
    {
      icon: Layers,
      tint: "bg-violet-50 text-violet-600",
      value: summary.environmentsUpdated,
      label: "Ambientes atualizados",
    },
    {
      icon: ClipboardList,
      tint: "bg-orange-50 text-orange-600",
      value: summary.maintenanceLogs,
      label: "Registros de campo",
    },
  ];

  return (
    <div className={`${cardCls} p-6`}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-800">Resumo semanal</h2>
        <span className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500">
          Esta semana
        </span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.label} className="space-y-2.5">
            <div
              className={`flex size-10 items-center justify-center rounded-full ${cell.tint}`}
            >
              <cell.icon className="size-5" />
            </div>
            <p className="text-[26px] font-bold leading-none tabular-nums text-slate-800">
              {cell.value}
            </p>
            <p className="text-xs text-slate-400">{cell.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}
