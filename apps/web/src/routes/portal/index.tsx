import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Building2, ChevronRight, Loader2 } from "lucide-react";

import { AuthShell } from "@/components/auth-shell";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/portal/")({
  component: () => (
    <AuthShell>
      <PortalHome />
    </AuthShell>
  ),
});

const STATUS_LABELS: Record<string, string> = {
  planning: "Planejamento",
  in_progress: "Em andamento",
  completed: "Concluída",
  paused: "Pausada",
};

function PortalHome() {
  const projects = useQuery(api.portal.listMyProjects, {});

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6 space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Building2 className="size-6 text-primary" />
          Portal do Cliente
        </h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe a evolução das suas obras em tempo real.
        </p>
      </header>

      {projects === undefined ? (
        <div className="flex min-h-48 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : projects.length === 0 ? (
        <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          Nenhuma obra disponível para o seu acesso.
        </p>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <Link
              key={p._id}
              to="/portal/$projectId"
              params={{ projectId: p._id }}
              className="block"
            >
              <Card className="transition-colors hover:border-primary/50">
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold">
                        {p.legacyNumber ? `#${p.legacyNumber} · ` : ""}
                        {p.name}
                      </span>
                      {p.status && (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {STATUS_LABELS[p.status] ?? p.status}
                        </span>
                      )}
                    </div>
                    {p.client && (
                      <p className="truncate text-sm text-muted-foreground">
                        {p.client}
                      </p>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${p.pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {p.installed}/{p.total} · {p.pct}%
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
