import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { formatCurrency, formatDate } from "@rlpapp/shared";
import { Check, CircleDollarSign, Pencil, Trash2, Undo2 } from "lucide-react";

import {
  MedicaoFormDialog,
  type ContractOption,
  type MedicaoBasis,
} from "@/components/engenharia/medicoes/medicao-form-dialog";
import {
  MEDICAO_BASIS_LABELS,
  MedicaoStatusBadge,
  type MedicaoStatus,
} from "@/components/engenharia/medicoes/medicao-status-badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { runWithToast } from "@/lib/errors";
import { useCan } from "@/hooks/use-can";

export type Medicao = {
  _id: Id<"medicoes">;
  contractId: Id<"contracts">;
  sequence: number;
  description: string | null;
  basis: MedicaoBasis;
  percent: number | null;
  amountCents: number;
  status: MedicaoStatus;
  referenceDate: number;
  approvedAt: number | null;
  paidAt: number | null;
};

export function MedicaoRow({
  projectId,
  medicao,
  contractOptions,
}: {
  projectId: Id<"projects">;
  medicao: Medicao;
  contractOptions: ContractOption[];
}) {
  const setStatus = useMutation(api.medicoes.setMedicaoStatus);
  const removeMedicao = useMutation(api.medicoes.removeMedicao);
  const canWrite = useCan("medicoes.write");
  const canApprove = useCan("medicoes.aprovar");

  async function handleStatus(status: MedicaoStatus, successMessage: string) {
    await runWithToast(
      () => setStatus({ medicaoId: medicao._id, status }),
      successMessage,
      "Não foi possível alterar o status"
    );
  }

  async function handleRemove() {
    if (!window.confirm(`Excluir a medição nº ${medicao.sequence}?`)) return;
    await runWithToast(
      () => removeMedicao({ medicaoId: medicao._id }),
      "Medição excluída",
      "Não foi possível excluir a medição"
    );
  }

  return (
    <TableRow>
      <TableCell className="font-medium tabular-nums">
        {medicao.sequence}
      </TableCell>
      <TableCell className="tabular-nums">
        {formatDate(medicao.referenceDate)}
      </TableCell>
      <TableCell className="max-w-48 truncate">
        {medicao.description ?? "—"}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {MEDICAO_BASIS_LABELS[medicao.basis] ?? medicao.basis}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {medicao.percent != null ? `${medicao.percent}%` : "—"}
      </TableCell>
      <TableCell className="text-right font-semibold tabular-nums">
        {formatCurrency(medicao.amountCents)}
      </TableCell>
      <TableCell>
        <MedicaoStatusBadge status={medicao.status} />
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          {medicao.status === "rascunho" && canApprove && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleStatus("aprovada", "Medição aprovada")}
            >
              <Check />
              Aprovar
            </Button>
          )}
          {medicao.status === "rascunho" && canWrite && (
            <>
              <MedicaoFormDialog
                projectId={projectId}
                contracts={contractOptions}
                medicao={medicao}
                trigger={
                  <Button variant="ghost" size="icon" title="Editar medição">
                    <Pencil />
                  </Button>
                }
              />
              <Button
                variant="ghost"
                size="icon"
                title="Excluir medição"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => void handleRemove()}
              >
                <Trash2 />
              </Button>
            </>
          )}
          {medicao.status === "aprovada" && canApprove && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void handleStatus("paga", "Medição marcada como paga")
                }
              >
                <CircleDollarSign />
                Marcar paga
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Voltar para rascunho"
                onClick={() =>
                  void handleStatus("rascunho", "Medição voltou para rascunho")
                }
              >
                <Undo2 />
              </Button>
            </>
          )}
          {medicao.status === "paga" && canApprove && (
            <Button
              variant="ghost"
              size="icon"
              title="Voltar para aprovada"
              onClick={() =>
                void handleStatus("aprovada", "Medição voltou para aprovada")
              }
            >
              <Undo2 />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
