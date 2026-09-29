import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  History,
  Loader2,
  MapPin,
  QrCode,
  Search,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ActivityCard } from "@/components/engenharia/sent-history-by-project";
import { StatusBadge } from "@/components/engenharia/status-badge";

export function FieldProjectQrBrowser() {
  const projects = useQuery(api.technicianPortal.listBrowsableProjects);
  const activityUsers = useQuery(api.technicianActivity.listActivityUsers);
  const [search, setSearch] = useState("");
  const [selectedProjectId, setSelectedProjectId] =
    useState<Id<"projects"> | null>(null);

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return projects;
    return projects.filter((project) =>
      [
        project.name,
        project.legacyNumber?.toString(),
        project.client,
        project.address,
      ].some((value) =>
        value?.toLocaleLowerCase("pt-BR").includes(term)
      )
    );
  }, [projects, search]);

  const selectedProject = projects?.find(
    (project) => project._id === selectedProjectId
  );

  return (
    <div className="grid min-h-80 gap-4 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.5fr)]">
      <div
        className={
          selectedProjectId
            ? "hidden space-y-3 lg:block"
            : "space-y-3"
        }
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar obra, cliente ou endereço"
            className="h-11 pl-9"
          />
        </div>

        {projects === undefined ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Carregando obras...
          </div>
        ) : projects.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhuma obra possui etiquetas QR disponíveis.
          </p>
        ) : filteredProjects.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhuma obra corresponde à busca.
          </p>
        ) : (
          <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
            {filteredProjects.map((project) => (
              <button
                key={project._id}
                type="button"
                onClick={() => setSelectedProjectId(project._id)}
                aria-pressed={selectedProjectId === project._id}
                className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 aria-pressed:border-primary aria-pressed:bg-primary/5"
              >
                <div className="rounded-md bg-muted p-2">
                  <Building2 className="size-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {project.legacyNumber ? `#${project.legacyNumber} · ` : ""}
                    {project.name}
                  </p>
                  {(project.client || project.address) && (
                    <p className="truncate text-xs text-muted-foreground">
                      {[project.client, project.address].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {project.qrCount} etiqueta{project.qrCount === 1 ? "" : "s"} ·{" "}
                    {project.registeredCount} cadastrada
                    {project.registeredCount === 1 ? "" : "s"}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={selectedProjectId ? "block" : "hidden lg:block"}>
        {selectedProjectId ? (
          <ProjectDetail
            key={selectedProjectId}
            canViewServices={Boolean(activityUsers)}
            activityUsers={activityUsers ?? []}
            projectId={selectedProjectId}
            projectName={selectedProject?.name ?? "Obra"}
            qrCount={selectedProject?.qrCount ?? null}
            registeredCount={selectedProject?.registeredCount ?? null}
            onBack={() => setSelectedProjectId(null)}
          />
        ) : (
          <div className="flex min-h-80 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
            <Building2 className="mb-3 size-9 text-muted-foreground" />
            <p className="font-medium">Selecione uma obra</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Você pode consultar as etiquetas de qualquer obra ativa, mesmo sem
              estar atribuído como técnico.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

type QrFilter = "all" | "registered" | "free";

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

type ActivityUser = { _id: Id<"users">; name: string; isActive: boolean };

function ProjectDetail({
  projectId,
  projectName,
  qrCount,
  registeredCount,
  canViewServices,
  activityUsers,
  onBack,
}: {
  projectId: Id<"projects">;
  projectName: string;
  qrCount: number | null;
  registeredCount: number | null;
  canViewServices: boolean;
  activityUsers: ActivityUser[];
  onBack: () => void;
}) {
  const [tab, setTab] = useState<"labels" | "services">("labels");
  const showServices = canViewServices && tab === "services";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          aria-label="Voltar para obras"
          onClick={onBack}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0">
          <p className="truncate font-semibold">{projectName}</p>
          <p className="text-xs text-muted-foreground">
            {showServices
              ? "Serviços registrados em campo nesta obra"
              : "Etiquetas de equipamento disponíveis"}
          </p>
        </div>
      </div>
      {canViewServices && (
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
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
                className="flex h-9 items-center justify-center gap-2 rounded-md text-sm font-medium text-muted-foreground transition-colors aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm"
              >
                <Icon className="size-4" />
                {option.label}
              </button>
            );
          })}
        </div>
      )}
      {showServices ? (
        <ProjectServicesList projectId={projectId} activityUsers={activityUsers} />
      ) : (
        <ProjectQrList
          projectId={projectId}
          qrCount={qrCount}
          registeredCount={registeredCount}
        />
      )}
    </div>
  );
}

const ALL_USERS = "all";

function ProjectServicesList({
  projectId,
  activityUsers,
}: {
  projectId: Id<"projects">;
  activityUsers: ActivityUser[];
}) {
  const [selectedUser, setSelectedUser] = useState<string>(ALL_USERS);
  const { results, status, loadMore } = usePaginatedQuery(
    api.technicianActivity.listProjectActivity,
    {
      projectId,
      userId:
        selectedUser === ALL_USERS ? undefined : (selectedUser as Id<"users">),
    },
    { initialNumItems: 20 }
  );

  return (
    <div className="space-y-3">
      <Select
        value={selectedUser}
        onValueChange={(value) => setSelectedUser(value || ALL_USERS)}
      >
        <SelectTrigger className="h-11">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_USERS}>Todos os técnicos</SelectItem>
          {activityUsers.map((user) => (
            <SelectItem key={user._id} value={user._id}>
              {user.isActive ? user.name : `${user.name} (inativo)`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {status === "LoadingFirstPage" ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Carregando serviços...
        </div>
      ) : results.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {selectedUser === ALL_USERS
            ? "Nenhum serviço registrado nesta obra."
            : "Este técnico não registrou serviços nesta obra."}
        </p>
      ) : (
        <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {results.map((item) => (
            <ActivityCard key={`${item.kind}:${item.id}`} item={item} />
          ))}
        </div>
      )}

      {status === "CanLoadMore" && (
        <Button variant="outline" className="w-full" onClick={() => loadMore(20)}>
          Carregar mais serviços
        </Button>
      )}
      {status === "LoadingMore" && (
        <Button variant="outline" className="w-full" disabled>
          <Loader2 className="mr-2 size-4 animate-spin" />
          Carregando...
        </Button>
      )}
    </div>
  );
}

function ProjectQrList({
  projectId,
  qrCount,
  registeredCount,
}: {
  projectId: Id<"projects">;
  qrCount: number | null;
  registeredCount: number | null;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<QrFilter>("all");
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const { results, status, loadMore } = usePaginatedQuery(
    api.technicianPortal.listBrowsableQrsByProject,
    { projectId, search: debouncedSearch || undefined, filter },
    { initialNumItems: 20 }
  );
  const searching = debouncedSearch.length > 0;
  const filterOptions: Array<{ id: QrFilter; label: string; count: number | null }> = [
    { id: "all", label: "Todas", count: qrCount },
    { id: "registered", label: "Cadastradas", count: registeredCount },
    {
      id: "free",
      label: "Livres",
      count:
        qrCount !== null && registeredCount !== null
          ? qrCount - registeredCount
          : null,
    },
  ];
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar código, ambiente ou equipamento"
          className="h-11 pl-9"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {filterOptions.map((option) => (
          <Button
            key={option.id}
            type="button"
            size="sm"
            variant={filter === option.id ? "default" : "outline"}
            aria-pressed={filter === option.id}
            onClick={() => setFilter(option.id)}
          >
            {option.label}
            {option.count !== null && (
              <span className="ml-1 tabular-nums opacity-80">
                ({option.count})
              </span>
            )}
          </Button>
        ))}
      </div>

      {status === "LoadingFirstPage" ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Carregando etiquetas...
        </div>
      ) : results.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {searching
            ? "Nenhuma etiqueta corresponde à busca."
            : filter === "registered"
              ? "Nenhuma etiqueta cadastrada nesta obra."
              : filter === "free"
                ? "Nenhuma etiqueta livre nesta obra."
                : "Nenhuma etiqueta ativa nesta obra."}
        </p>
      ) : (
        <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {results.map((qr) => {
            const title =
              qr.description ||
              [qr.modelo, qr.ambiente].filter(Boolean).join(" · ") ||
              "Etiqueta ainda sem equipamento";
            return (
              <Link
                key={qr._id}
                to="/q/$token"
                params={{ token: qr.token }}
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
              >
                <div className="rounded-md bg-primary/10 p-2">
                  <QrCode className="size-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">
                      {qr.token}
                    </span>
                    {qr.status ? (
                      <StatusBadge status={qr.status} />
                    ) : (
                      <Badge variant="outline">Livre</Badge>
                    )}
                  </div>
                  <p className="truncate text-sm">{title}</p>
                  {qr.ambiente && (
                    <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <MapPin className="size-3" />
                      {qr.ambiente}
                    </p>
                  )}
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}

      {status === "CanLoadMore" && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => loadMore(20)}
        >
          Carregar mais etiquetas
        </Button>
      )}
      {status === "LoadingMore" && (
        <Button variant="outline" className="w-full" disabled>
          <Loader2 className="mr-2 size-4 animate-spin" />
          Carregando...
        </Button>
      )}
    </div>
  );
}
