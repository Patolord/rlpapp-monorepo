import { useMutation, useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { formatDate } from "@rlpapp/shared";
import {
  Archive,
  ClipboardList,
  HardHat,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DisciplineFormDialog } from "@/components/engenharia/servicos/discipline-form-dialog";
import { ServiceStagesTable } from "@/components/engenharia/servicos/service-stages-table";
import { useCan } from "@/hooks/use-can";
import { runWithToast } from "@/lib/errors";

type OfficeDiscipline = FunctionReturnType<
  typeof api.fieldServices.listOfficeDisciplinesByProject
>[number];

/** Quantas etapas o histórico traz; acima disso a tela avisa que é um recorte. */
const STAGE_LIMIT = 100;

export function ProjectServicesPanel({
  projectId,
  archived = false,
}: {
  projectId: Id<"projects">;
  /** Obra arquivada: só consulta e conferência; as disciplinas ficam travadas. */
  archived?: boolean;
}) {
  const disciplines = useQuery(
    api.fieldServices.listOfficeDisciplinesByProject,
    { projectId }
  );
  const stages = useQuery(api.fieldServices.listOfficeStagesByProject, {
    projectId,
    limit: STAGE_LIMIT,
  });
  const canWrite = useCan("servicos.write");
  const canEditDisciplines = canWrite && !archived;

  return (
    <div className="space-y-8">
      {archived && (
        <p className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          <Archive className="size-4 shrink-0" />
          Obra arquivada: as etapas continuam disponíveis para consulta, mas
          restaure a obra para mudar as disciplinas.
        </p>
      )}

      <section className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold">Disciplinas</h2>
            <p className="text-sm text-muted-foreground">
              O que a equipe executa nesta obra e como cada frente está.
            </p>
          </div>
          {canEditDisciplines && (
            <DisciplineFormDialog
              projectId={projectId}
              trigger={
                <Button>
                  <Plus />
                  Nova disciplina
                </Button>
              }
            />
          )}
        </div>

        {disciplines === undefined ? (
          <SectionLoading />
        ) : disciplines.length === 0 ? (
          <EmptyState
            icon={<HardHat className="size-9 text-muted-foreground" />}
            title="Nenhuma disciplina definida"
            description="Defina as disciplinas desta obra para a equipe registrar as etapas pelo app."
          />
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {disciplines.map((discipline) => (
              <DisciplineRow
                key={discipline._id}
                projectId={projectId}
                discipline={discipline}
                canEdit={canEditDisciplines}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold">Etapas registradas</h2>
          <p className="text-sm text-muted-foreground">
            O que a equipe registrou pelo app, da etapa mais nova para a mais
            antiga.
          </p>
        </div>

        {stages === undefined ? (
          <SectionLoading />
        ) : stages.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-9 text-muted-foreground" />}
            title="Nenhuma etapa registrada ainda"
            description="As etapas aparecem aqui assim que a equipe registrar pelo app."
          />
        ) : (
          <>
            <ServiceStagesTable stages={stages} canWrite={canWrite} />
            {stages.length >= STAGE_LIMIT && (
              <p className="text-xs text-muted-foreground">
                Mostrando as {STAGE_LIMIT} etapas mais recentes.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function DisciplineRow({
  projectId,
  discipline,
  canEdit,
}: {
  projectId: Id<"projects">;
  discipline: OfficeDiscipline;
  canEdit: boolean;
}) {
  const archiveDiscipline = useMutation(
    api.fieldServices.archiveProjectDiscipline
  );

  async function handleRemove() {
    if (
      !window.confirm(
        `Remover a disciplina "${discipline.name}" desta obra? As etapas já registradas continuam no histórico.`
      )
    ) {
      return;
    }
    await runWithToast(
      () => archiveDiscipline({ disciplineId: discipline._id }),
      "Disciplina removida",
      "Não foi possível remover a disciplina"
    );
  }

  const { lastStage } = discipline;

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{discipline.name}</p>
          {!discipline.fieldTeam && <Badge variant="muted">Outra equipe</Badge>}
        </div>
        {discipline.budgetSheet && (
          <p className="text-xs text-muted-foreground">
            Orçamento: {discipline.budgetSheet}
          </p>
        )}
        <p className="text-sm tabular-nums">
          {discipline.stageCount === 0
            ? "Nenhuma etapa registrada"
            : `${discipline.openCount} em andamento · ${discipline.concludedCount} ${
                discipline.concludedCount === 1 ? "concluído" : "concluídos"
              }`}
        </p>
        {lastStage && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            Última etapa: {lastStage.description}
            {lastStage.location ? ` · ${lastStage.location}` : ""}
            {" · "}
            {formatDate(lastStage.createdAt)}
          </p>
        )}
      </div>

      {canEdit && (
        <div className="flex items-center gap-1.5 sm:shrink-0">
          <DisciplineFormDialog
            projectId={projectId}
            discipline={discipline}
            trigger={
              <Button variant="outline" size="sm">
                <Pencil />
                Editar
              </Button>
            }
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Remover disciplina"
            title="Remover disciplina"
            onClick={() => void handleRemove()}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 />
          </Button>
        </div>
      )}
    </li>
  );
}

function SectionLoading() {
  return (
    <div className="flex min-h-40 items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center">
      {icon}
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}
