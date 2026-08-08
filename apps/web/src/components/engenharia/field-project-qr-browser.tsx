import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  Loader2,
  MapPin,
  QrCode,
  Search,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/engenharia/status-badge";

export function FieldProjectQrBrowser() {
  const projects = useQuery(api.technicianPortal.listBrowsableProjects);
  const [search, setSearch] = useState("");
  const [selectedProjectId, setSelectedProjectId] =
    useState<Id<"projects"> | null>(null);

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return projects;
    return projects.filter((project) =>
      [project.name, project.client, project.address].some((value) =>
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
                  <p className="truncate text-sm font-semibold">{project.name}</p>
                  {(project.client || project.address) && (
                    <p className="truncate text-xs text-muted-foreground">
                      {[project.client, project.address].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={selectedProjectId ? "block" : "hidden lg:block"}>
        {selectedProjectId && selectedProject ? (
          <ProjectQrList
            projectId={selectedProjectId}
            projectName={selectedProject.name}
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

function ProjectQrList({
  projectId,
  projectName,
  onBack,
}: {
  projectId: Id<"projects">;
  projectName: string;
  onBack: () => void;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.technicianPortal.listBrowsableQrsByProject,
    { projectId },
    { initialNumItems: 20 }
  );
  const [search, setSearch] = useState("");
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = results.filter((qr) =>
    [qr.token, qr.description, qr.modelo, qr.ambiente, qr.batchName].some(
      (value) => value?.toLocaleLowerCase("pt-BR").includes(term)
    )
  );

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
            Etiquetas de equipamento disponíveis
          </p>
        </div>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar código, ambiente ou equipamento"
          className="h-11 pl-9"
        />
      </div>

      {status === "LoadingFirstPage" ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Carregando etiquetas...
        </div>
      ) : results.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhuma etiqueta ativa nesta obra.
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhuma etiqueta carregada corresponde à busca.
        </p>
      ) : (
        <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {filtered.map((qr) => {
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
