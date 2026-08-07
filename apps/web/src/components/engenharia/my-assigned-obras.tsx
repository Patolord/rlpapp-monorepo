import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  QrCode,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { cn } from "@/lib/utils";

// Lista obras atribuídas ao técnico e os QRs/equipamentos de cada uma.
export function MyAssignedObras() {
  const projects = useQuery(api.technicianPortal.listMyProjects);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          Minhas obras
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {projects === undefined ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma obra atribuída. Peça à engenharia para liberar o acesso.
          </p>
        ) : (
          projects.map((project) => (
            <AssignedProjectGroup
              key={project._id}
              projectId={project._id}
              name={project.name}
              qrCount={project.qrCount}
              registeredCount={project.registeredCount}
              defaultOpen={projects.length === 1}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function AssignedProjectGroup({
  projectId,
  name,
  qrCount,
  registeredCount,
  defaultOpen,
}: {
  projectId: Id<"projects">;
  name: string;
  qrCount: number;
  registeredCount: number;
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
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">
            {registeredCount} cadastrado{registeredCount === 1 ? "" : "s"} ·{" "}
            {qrCount} QR{qrCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="secondary">{qrCount}</Badge>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        </div>
      </button>
      {open && (
        <div className="space-y-2 border-t p-3">
          <AssignedProjectQrList projectId={projectId} />
        </div>
      )}
    </div>
  );
}

function AssignedProjectQrList({
  projectId,
}: {
  projectId: Id<"projects">;
}) {
  const qrs = useQuery(api.technicianPortal.listQrsByProject, { projectId });

  if (qrs === undefined) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  }

  if (qrs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum código QR nesta obra ainda.
      </p>
    );
  }

  return (
    <>
      {qrs.map((qr) => {
        const title =
          qr.description ||
          (qr.modelo
            ? qr.ambiente
              ? `${qr.modelo} · ${qr.ambiente}`
              : qr.modelo
            : null) ||
          "QR sem equipamento";

        return (
          <Link
            key={qr._id}
            to="/q/$token"
            params={{ token: qr.token }}
            className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 font-mono text-sm font-semibold">
                  <QrCode className="h-3.5 w-3.5 text-muted-foreground" />
                  {qr.token}
                </span>
                {qr.status && <StatusBadge status={qr.status} />}
                {!qr.equipmentId && (
                  <Badge variant="outline">Livre</Badge>
                )}
              </div>
              <p className="truncate text-sm">{title}</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </Link>
        );
      })}
    </>
  );
}
