import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  Activity,
  CheckCircle2,
  Clock,
  Gauge,
  Loader2,
  TrendingUp,
  Users,
} from "lucide-react";

import { AuthShell } from "@/components/auth-shell";
import {
  ProjectShell,
  type ProjectOverview,
} from "@/components/engenharia/project-shell";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/engenharia/relatorios/$projectId/dashboard"
)({
  component: () => (
    <AuthShell>
      <DashboardPage />
    </AuthShell>
  ),
});

function DashboardPage() {
  const { projectId } = Route.useParams();
  return (
    <ProjectShell projectId={projectId} tab="dashboard">
      {(project, now) => <DashboardContent project={project} now={now} />}
    </ProjectShell>
  );
}

const ACTION_LABELS: Record<string, string> = {
  created: "criou",
  installed: "instalou",
  tested: "testou",
  finalized: "finalizou",
  status_changed: "mudou status de",
  qr_generated: "gerou QR de",
  media_added: "anexou mídia em",
  checklist_completed: "concluiu item de",
  checklist_unchecked: "desmarcou item de",
};

function DashboardContent({
  project,
  now,
}: {
  project: ProjectOverview;
  now: number;
}) {
  const report = useQuery(api.reports.getProjectReport, {
    projectId: project._id,
    now,
  });

  if (report === undefined) {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (report === null) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Obra não encontrada.
      </p>
    );
  }

  const { progress, byTower, productivity, recentActivity, averageInstallDays } =
    report;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          icon={<Gauge className="size-4" />}
          label="Progresso"
          value={`${progress.pct}%`}
          accent
        />
        <Metric
          icon={<CheckCircle2 className="size-4" />}
          label="Instalados"
          value={`${progress.installed}/${progress.total}`}
        />
        <Metric
          icon={<Clock className="size-4" />}
          label="Em atraso"
          value={progress.overdue}
          danger={progress.overdue > 0}
        />
        <Metric
          icon={<TrendingUp className="size-4" />}
          label="Tempo médio inst."
          value={
            averageInstallDays === null ? "—" : `${averageInstallDays} d`
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 py-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <Activity className="size-4" />
              Progresso por torre
            </h2>
            {byTower.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sem equipamentos cadastrados.
              </p>
            ) : (
              <div className="space-y-3">
                {byTower.map((t) => (
                  <div key={t.towerName} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{t.towerName}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {t.installed}/{t.total} · {t.pct}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${t.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 py-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <Users className="size-4" />
              Produtividade da equipe
            </h2>
            {productivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma ação de campo registrada ainda.
              </p>
            ) : (
              <div className="space-y-2">
                {productivity.map((p) => (
                  <div
                    key={p.userId}
                    className="flex items-center justify-between gap-2 rounded border bg-muted/20 px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{p.userName}</span>
                    <span className="flex gap-3 text-xs text-muted-foreground tabular-nums">
                      <span>{p.installed} inst.</span>
                      <span>{p.tested} testes</span>
                      <span className="font-semibold text-green-700">
                        {p.finalized} final.
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-3 py-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Clock className="size-4" />
            Atividade recente
          </h2>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma atividade registrada.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {recentActivity.map((a) => (
                <li
                  key={a._id}
                  className="flex items-center gap-2 text-sm"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="font-medium">{a.userName}</span>
                  <span className="text-muted-foreground">
                    {ACTION_LABELS[a.action] ?? a.action}
                  </span>
                  <span className="truncate">{a.equipmentLabel}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {new Date(a.createdAt).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  accent = false,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {icon}
          {label}
        </div>
        <p
          className={cn(
            "mt-1 text-2xl font-bold tabular-nums",
            accent && "text-primary",
            danger && "text-red-600"
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
