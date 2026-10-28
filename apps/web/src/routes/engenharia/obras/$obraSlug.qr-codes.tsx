import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ClipboardList, History, Loader2, QrCode, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { EquipmentStatusKey } from "@rlpapp/ui/tokens";

import { AuthShell } from "@/components/auth-shell";
import { PendingBanner } from "@/components/campo/pending-records";
import { ProjectServicesList } from "@/components/engenharia/project-services-list";
import { ProjectShell, type ProjectOverview } from "@/components/engenharia/project-shell";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

// "Cadastrada" = etiqueta já vinculada a um equipamento (bipada em campo);
// "Livre" = etiqueta do lote da obra ainda sem equipamento.
type RegistrationFilter = "all" | "registered" | "free";
type Tab = "labels" | "services";

function QrCodesContent({
  projectId,
  project,
}: {
  projectId: Id<"projects">;
  project: ProjectOverview;
}) {
  const rows = useQuery(api.qrCodes.listByProject, { projectId });
  // null quando o usuário não tem engenharia.read: a aba de serviços fica oculta.
  const activityUsers = useQuery(api.technicianActivity.listActivityUsers);
  const canViewServices = Boolean(activityUsers);
  const [tab, setTab] = useState<Tab>("labels");
  const [search, setSearch] = useState("");
  const [registration, setRegistration] = useState<RegistrationFilter>("all");
  const [status, setStatus] = useState(ALL);

  const registeredCount = useMemo(
    () => rows?.filter((r) => r.equipmentId).length ?? 0,
    [rows]
  );

  const filtered = useMemo(() => {
    if (!rows) return [];
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return rows
      .filter(
        (r) =>
          registration === "all" ||
          (registration === "registered") === Boolean(r.equipmentId)
      )
      .filter((r) => status === ALL || r.status === status)
      .filter(
        (r) =>
          !term ||
          [
            r.token,
            r.description,
            r.ambiente,
            r.modelo,
            r.system,
            r.environmentName,
          ].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term))
      );
  }, [rows, search, registration, status]);

  if (rows === undefined) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const showServices = canViewServices && tab === "services";
  const registrationOptions: Array<{
    id: RegistrationFilter;
    label: string;
    count: number;
  }> = [
    { id: "all", label: "Todas", count: rows.length },
    { id: "registered", label: "Cadastradas", count: registeredCount },
    { id: "free", label: "Livres", count: rows.length - registeredCount },
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">
            {showServices ? "Serviços da obra" : "QR codes da obra"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {showServices
              ? "Registros enviados pelos técnicos em campo nesta obra."
              : `${rows.length} QR${rows.length === 1 ? "" : "s"} atribuído${
                  rows.length === 1 ? "" : "s"
                } de ${project.totalItems} equipamento${
                  project.totalItems === 1 ? "" : "s"
                } previsto${project.totalItems === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canViewServices && (
            <div className="grid w-fit grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(
                [
                  { id: "labels", label: "Etiquetas", icon: QrCode },
                  { id: "services", label: "Serviços", icon: History },
                ] as const
              ).map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={tab === option.id}
                    onClick={() => setTab(option.id)}
                    className="flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium text-muted-foreground transition-colors aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm"
                  >
                    <Icon className="size-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          )}
          {/* Histórico completo (todas as obras), antes acessível pela tela
              "Registro de campo" removida. */}
          <Button
            variant="outline"
            size="sm"
            render={<Link to="/meus-registros" />}
          >
            <ClipboardList className="size-4" />
            Meus registros
          </Button>
        </div>
      </div>

      {/* Registros feitos sem internet ainda não enviados; some com a fila vazia. */}
      <PendingBanner />

      {showServices ? (
        <ProjectServicesList
          projectId={projectId}
          activityUsers={activityUsers ?? []}
        />
      ) : rows.length === 0 ? (
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
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative sm:w-72">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar token, descrição, ambiente, modelo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {registrationOptions.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  size="sm"
                  variant={registration === option.id ? "default" : "outline"}
                  aria-pressed={registration === option.id}
                  onClick={() => setRegistration(option.id)}
                >
                  {option.label}
                  <span className="ml-1 tabular-nums opacity-80">
                    ({option.count})
                  </span>
                </Button>
              ))}
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
                          <EquipmentCell row={r} />
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

type QrRow = FunctionReturnType<typeof api.qrCodes.listByProject>[number];

function EquipmentCell({ row }: { row: QrRow }) {
  if (row.plannedItemId) {
    return (
      <div className="flex items-center gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{row.system ?? "—"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[row.modelo, row.capacidade].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        {row.kind && (
          <Badge variant="outline" className="shrink-0">
            {row.kind === "condensadora" ? "Condensadora" : "Evaporadora"}
          </Badge>
        )}
      </div>
    );
  }
  // Cadastrada em campo sem item planejado: a descrição do técnico é o nome.
  if (row.equipmentId) {
    return (
      <div className="min-w-0">
        <p className="truncate font-medium">
          {row.description || "Cadastrado em campo"}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          Sem item planejado
        </p>
      </div>
    );
  }
  return <span className="text-muted-foreground">Etiqueta livre</span>;
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
