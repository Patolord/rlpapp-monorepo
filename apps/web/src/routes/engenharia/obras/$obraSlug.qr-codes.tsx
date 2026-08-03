import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Loader2, QrCode, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { EquipmentStatusKey } from "@rlpapp/ui/tokens";

import { AuthShell } from "@/components/auth-shell";
import { ProjectShell, type ProjectOverview } from "@/components/engenharia/project-shell";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useObraProjectId } from "@/lib/engenharia/obra-context";

export const Route = createFileRoute("/engenharia/obras/$obraSlug/qr-codes")({
  component: QrCodesPage,
});

function QrCodesPage() {
  const projectId = useObraProjectId();
  return (
    <AuthShell>
      <ProjectShell projectId={projectId}>
        {(project) => (
          <QrCodesContent
            projectId={projectId as Id<"projects">}
            project={project}
          />
        )}
      </ProjectShell>
    </AuthShell>
  );
}

const ALL = "all";

function QrCodesContent({
  projectId,
  project,
}: {
  projectId: Id<"projects">;
  project: ProjectOverview;
}) {
  const rows = useQuery(api.qrCodes.listByProject, { projectId });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(ALL);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const term = search.trim().toLowerCase();
    return rows
      .filter((r) => status === ALL || r.status === status)
      .filter(
        (r) =>
          !term ||
          r.token.toLowerCase().includes(term) ||
          (r.ambiente?.toLowerCase().includes(term) ?? false) ||
          (r.modelo?.toLowerCase().includes(term) ?? false) ||
          (r.system?.toLowerCase().includes(term) ?? false) ||
          (r.environmentName?.toLowerCase().includes(term) ?? false)
      );
  }, [rows, search, status]);

  if (rows === undefined) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">QR codes da obra</h2>
        <p className="text-sm text-muted-foreground">
          {rows.length} QR{rows.length === 1 ? "" : "s"} atribuído
          {rows.length === 1 ? "" : "s"} de {project.totalItems} equipamento
          {project.totalItems === 1 ? "" : "s"} previsto
          {project.totalItems === 1 ? "" : "s"}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <QrCode className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="font-medium">Nenhum QR code atribuído a esta obra</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Gere QR codes a partir dos equipamentos previstos (botão "Gerar QR"
            na hierarquia da obra) ou vincule etiquetas já escaneadas em campo.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <div className="relative sm:w-64">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar token, ambiente, modelo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="sm:w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os status</SelectItem>
                <SelectItem value="operational">Operacional</SelectItem>
                <SelectItem value="installing">Em instalação</SelectItem>
                <SelectItem value="warning">Alerta</SelectItem>
                <SelectItem value="error">Erro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Token</TableHead>
                    <TableHead>Localização</TableHead>
                    <TableHead>Equipamento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Lote</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-10 text-center text-muted-foreground"
                      >
                        Nenhum QR corresponde aos filtros.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((r) => (
                      <TableRow key={r._id}>
                        <TableCell>
                          <Link
                            to="/engenharia/qr/$token"
                            params={{ token: r.token }}
                            className="font-mono font-medium text-primary hover:underline"
                          >
                            {r.token}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <LocationCell
                            towerName={r.towerName}
                            floorLabel={r.floorLabel}
                            environmentName={r.environmentName}
                            ambiente={r.ambiente}
                          />
                        </TableCell>
                        <TableCell>
                          {r.plannedItemId ? (
                            <div className="flex items-center gap-2">
                              <div className="min-w-0">
                                <p className="truncate font-medium">
                                  {r.system ?? "—"}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {[r.modelo, r.capacidade]
                                    .filter(Boolean)
                                    .join(" · ") || "—"}
                                </p>
                              </div>
                              {r.kind && (
                                <Badge variant="outline" className="shrink-0">
                                  {r.kind === "condensadora"
                                    ? "Condensadora"
                                    : "Evaporadora"}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">
                              Sem item planejado
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.status ? (
                            <StatusBadge
                              status={r.status as EquipmentStatusKey}
                            />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.batchName ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}

function LocationCell({
  towerName,
  floorLabel,
  environmentName,
  ambiente,
}: {
  towerName: string | null;
  floorLabel: string | null;
  environmentName: string | null;
  ambiente: string | null;
}) {
  const parts = [towerName, floorLabel, environmentName].filter(
    (p): p is string => Boolean(p)
  );
  if (parts.length > 0) {
    return <span>{parts.join(" · ")}</span>;
  }
  // Itens legados sem hierarquia: mostra o texto livre do ambiente.
  if (ambiente) {
    return <span className="text-muted-foreground">{ambiente}</span>;
  }
  return <span className="text-muted-foreground">—</span>;
}
