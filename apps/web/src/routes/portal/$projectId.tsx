import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowLeft, CheckCircle2, Clock, Gauge, Loader2 } from "lucide-react";

import { AuthShell } from "@/components/auth-shell";
import { BuildingPanel } from "@/components/engenharia/building-panel/building-panel";
import type { ProjectHierarchy } from "@/components/engenharia/building-panel/hierarchy";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/portal/$projectId")({
  component: () => (
    <AuthShell>
      <PortalProject />
    </AuthShell>
  ),
});

function PortalProject() {
  const { projectId } = Route.useParams();
  const now = Date.now();

  const summary = useQuery(api.portal.getProjectSummary, {
    projectId: projectId as ProjectHierarchy["_id"],
    now,
  });
  const hierarchy = useQuery(api.portal.getProjectHierarchy, {
    projectId: projectId as ProjectHierarchy["_id"],
  }) as ProjectHierarchy | null | undefined;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <Link
        to="/portal"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar para obras
      </Link>

      {summary === undefined ? (
        <div className="flex min-h-48 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <header className="mb-4 space-y-1">
            <h1 className="text-2xl font-bold">{summary.name}</h1>
            {summary.address && (
              <p className="text-sm text-muted-foreground">{summary.address}</p>
            )}
          </header>

          <div className="mb-6 grid grid-cols-3 gap-3">
            <PortalMetric
              icon={<Gauge className="size-4" />}
              label="Progresso"
              value={`${summary.pct}%`}
              accent
            />
            <PortalMetric
              icon={<CheckCircle2 className="size-4" />}
              label="Instalados"
              value={`${summary.installed}/${summary.total}`}
            />
            <PortalMetric
              icon={<Clock className="size-4" />}
              label="Em atraso"
              value={summary.overdue}
              danger={summary.overdue > 0}
            />
          </div>

          {hierarchy === undefined ? (
            <div className="flex min-h-48 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : hierarchy === null ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Estrutura da obra ainda não disponível.
            </p>
          ) : (
            <BuildingPanel hierarchy={hierarchy} now={now} />
          )}
        </>
      )}
    </div>
  );
}

function PortalMetric({
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
      <CardContent className="py-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <p
          className={`mt-1 text-xl font-bold tabular-nums ${
            accent ? "text-primary" : danger ? "text-red-600" : ""
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
