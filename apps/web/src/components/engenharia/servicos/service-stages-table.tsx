import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { formatDate } from "@rlpapp/shared";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getErrorMessage } from "@/lib/errors";

export type OfficeStage = FunctionReturnType<
  typeof api.fieldServices.listOfficeStagesByProject
>[number];

/** Etapas registradas pela equipe, da mais nova para a mais antiga. */
export function ServiceStagesTable({
  stages,
  canWrite,
}: {
  stages: OfficeStage[];
  canWrite: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quando</TableHead>
            <TableHead>Disciplina</TableHead>
            <TableHead>Local</TableHead>
            <TableHead>O que foi feito</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead>Quem fez</TableHead>
            <TableHead>Fotos</TableHead>
            <TableHead>Conferida</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stages.map((stage) => (
            <StageRow key={stage._id} stage={stage} canWrite={canWrite} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function StageRow({
  stage,
  canWrite,
}: {
  stage: OfficeStage;
  canWrite: boolean;
}) {
  const reviewStage = useMutation(api.fieldServices.reviewStage);
  const [saving, setSaving] = useState(false);
  const reviewed = stage.reviewedAt !== null;
  const reviewId = `stage-reviewed-${stage._id}`;

  async function handleReview(next: boolean) {
    setSaving(true);
    try {
      await reviewStage({ stageId: stage._id, reviewed: next });
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Não foi possível atualizar a conferência")
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <TableRow>
      <TableCell className="align-top whitespace-nowrap tabular-nums">
        {formatDate(stage.createdAt)}
        <span className="block text-muted-foreground">
          {new Date(stage.createdAt).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </TableCell>
      <TableCell className="align-top font-medium">
        {stage.disciplineName}
      </TableCell>
      <TableCell className="align-top">{stage.location ?? "Geral"}</TableCell>
      <TableCell className="min-w-48 max-w-80 align-top whitespace-pre-wrap">
        {stage.description}
      </TableCell>
      <TableCell className="align-top">
        {stage.outcome === "concluded" ? (
          <Badge variant="success">Concluído</Badge>
        ) : (
          <>
            <Badge variant="warning">Continua depois</Badge>
            {stage.pendingNote && (
              <p className="mt-1 max-w-56 text-muted-foreground">
                Falta: {stage.pendingNote}
              </p>
            )}
          </>
        )}
      </TableCell>
      <TableCell className="max-w-48 align-top">
        {stage.participants.length > 0
          ? stage.participants.map((person) => person.name).join(", ")
          : stage.createdByName}
      </TableCell>
      <TableCell className="align-top">
        {stage.photoUrls.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {stage.photoUrls.map((url, index) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                title={`Abrir foto ${index + 1}`}
                className="block size-9 overflow-hidden rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <img
                  src={url}
                  alt={`Foto ${index + 1} da etapa`}
                  loading="lazy"
                  className="size-full object-cover"
                />
              </a>
            ))}
          </div>
        )}
      </TableCell>
      <TableCell className="align-top">
        {canWrite ? (
          <Label
            htmlFor={reviewId}
            className="flex cursor-pointer items-center gap-2 text-xs font-normal"
          >
            <Checkbox
              id={reviewId}
              checked={reviewed}
              disabled={saving}
              onCheckedChange={(checked) => void handleReview(checked === true)}
            />
            {reviewed ? "Conferida" : "Conferir"}
          </Label>
        ) : reviewed ? (
          <Badge variant="success">Conferida</Badge>
        ) : (
          <Badge variant="muted">A conferir</Badge>
        )}
      </TableCell>
    </TableRow>
  );
}
