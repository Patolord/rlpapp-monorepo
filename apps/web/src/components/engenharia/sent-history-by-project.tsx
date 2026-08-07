import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, usePaginatedQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/engenharia/status-badge";
import {
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Histórico de serviços do usuário logado agrupado por obra: cadastro de
// equipamento, registros de instalação/manutenção + ações de campo
// (instalado/testado/finalizado).
export function SentHistoryByProject() {
  const projects = useQuery(api.technicianActivity.listMineProjects);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          Histórico enviado
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {projects === undefined ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum registro enviado ainda.
          </p>
        ) : (
          projects.map((group) => (
            <ProjectGroup
              key={group.projectId ?? "none"}
              projectId={group.projectId}
              projectName={group.projectName}
              count={group.count}
              lastActivityAt={group.lastActivityAt}
              defaultOpen={projects.length === 1}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function formatDate(timestamp: number, withTime = false) {
  return new Date(timestamp).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function ProjectGroup({
  projectId,
  projectName,
  count,
  lastActivityAt,
  defaultOpen,
}: {
  projectId: Id<"projects"> | null;
  projectName: string | null;
  count: number;
  lastActivityAt: number;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-muted/50"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <Building2 className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {projectName ?? "Sem obra"}
            </p>
            <p className="text-xs text-muted-foreground">
              Último serviço em {formatDate(lastActivityAt)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="secondary">
            {count} serviço{count === 1 ? "" : "s"}
          </Badge>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        </div>
      </button>
      {open && (
        <div className="space-y-3 border-t p-3">
          <ProjectActivityList projectId={projectId} />
        </div>
      )}
    </div>
  );
}

function ProjectActivityList({
  projectId,
}: {
  projectId: Id<"projects"> | null;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.technicianActivity.listMineForProject,
    { projectId },
    { initialNumItems: 10 }
  );

  if (status === "LoadingFirstPage") {
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  }

  if (results.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum serviço nesta obra.
      </p>
    );
  }

  return (
    <>
      {results.map((item) => (
        <ActivityCard key={item.id} item={item} />
      ))}
      {status === "CanLoadMore" && (
        <Button
          variant="outline"
          onClick={() => loadMore(10)}
          className="h-11 w-full text-base"
        >
          Carregar mais
        </Button>
      )}
    </>
  );
}

type ActivityItem = {
  kind: "maintenanceLog" | "fieldAction" | "registration";
  id: string;
  createdAt: number;
  title: string;
  label: string;
  status: "installing" | "operational" | "warning" | "error" | null;
  qrToken: string | null;
  notes: string | null;
};

function activityBadgeVariant(
  item: ActivityItem
): "default" | "secondary" | "outline" {
  if (item.kind === "fieldAction") return "outline";
  if (item.kind === "registration") return "secondary";
  if (item.label === "Instalação") return "default";
  return "secondary";
}

function ActivityCard({ item }: { item: ActivityItem }) {
  const content = (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={activityBadgeVariant(item)}>
            {item.label}
          </Badge>
          {item.status && <StatusBadge status={item.status} />}
        </div>
        <p className="truncate text-sm font-medium">{item.title}</p>
        {item.notes && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {item.notes}
          </p>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          {formatDate(item.createdAt, true)}
        </p>
      </div>
      {item.qrToken && (
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      )}
    </div>
  );

  if (!item.qrToken) return content;

  return (
    <Link
      to="/q/$token"
      params={{ token: item.qrToken }}
      className="block"
    >
      {content}
    </Link>
  );
}
