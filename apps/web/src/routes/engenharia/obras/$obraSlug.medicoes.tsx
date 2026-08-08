import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { formatCurrency, formatDate } from "@rlpapp/shared";
import {
  Check,
  CircleDollarSign,
  FileText,
  Pencil,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";

import { AuthShell } from "@/components/auth-shell";
import { ProjectShell } from "@/components/engenharia/project-shell";
import {
  ContractFormDialog,
} from "@/components/engenharia/medicoes/contract-form-dialog";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { runWithToast } from "@/lib/errors";
import { useObraProjectId } from "@/lib/engenharia/obra-context";

export const Route = createFileRoute(
  "/engenharia/obras/$obraSlug/medicoes"
)({
  component: MedicoesPage,
});

function MedicoesPage() {
  const projectId = useObraProjectId();
  return (
    <AuthShell>
      <ProjectShell projectId={projectId}>
        {() => <MedicoesContent projectId={projectId as Id<"projects">} />}
      </ProjectShell>
    </AuthShell>
  );
}

type ContractSummary = {
  _id: Id<"contracts">;
  title: string;
  valueCents: number;
  notes: string | null;
  signedAt: number | null;
  medicaoCount: number;
  medidoCents: number;
  aprovadoCents: number;
  pagoCents: number;
  saldoCents: number;
};

type Medicao = {
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

function MedicoesContent({ projectId }: { projectId: Id<"projects"> }) {
  const contracts = useQuery(api.medicoes.listContracts, { projectId });
  const medicoes = useQuery(api.medicoes.listMedicoes, { projectId });

  const contractOptions: ContractOption[] = (contracts ?? []).map((c) => ({
    _id: c._id,
    title: c.title,
    valueCents: c.valueCents,
  }));

  const totals = (contracts ?? []).reduce(
    (acc, c) => ({
      contratado: acc.contratado + c.valueCents,
      medido: acc.medido + c.medidoCents,
      pago: acc.pago + c.pagoCents,
    }),
    { contratado: 0, medido: 0, pago: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Medições</h2>
          <p className="text-sm text-muted-foreground">
            Cobranças por serviços realizados, deduzidas dos contratos da obra.
          </p>
        </div>
        <ContractFormDialog
          projectId={projectId}
          trigger={
            <Button variant="outline">
              <Plus className="mr-2 size-4" />
              Novo contrato
            </Button>
          }
        />
      </div>

      {contracts !== undefined && contracts.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-card px-4 py-3 text-sm shadow-sm">
          <TotalStat label="Contratado" value={totals.contratado} />
          <TotalStat label="Medido" value={totals.medido} />
          <TotalStat label="Pago" value={totals.pago} className="text-green-700" />
          <TotalStat
            label="Saldo"
            value={totals.contratado - totals.medido}
            className={
              totals.contratado - totals.medido < 0 ? "text-red-600" : undefined
            }
          />
        </div>
      )}

      {contracts === undefined || medicoes === undefined ? (
        <Card className="h-40 animate-pulse" />
      ) : contracts.length === 0 ? (
        <EmptyState projectId={projectId} />
      ) : (
        contracts.map((contract) => (
          <ContractCard
            key={contract._id}
            projectId={projectId}
            contract={contract}
            contractOptions={contractOptions}
            medicoes={medicoes.filter((m) => m.contractId === contract._id)}
          />
        ))
      )}
    </div>
  );
}

function TotalStat({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold tabular-nums ${className ?? ""}`}>
        {formatCurrency(value)}
      </span>
    </span>
  );
}

function EmptyState({ projectId }: { projectId: Id<"projects"> }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CircleDollarSign className="size-7" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Nenhum contrato cadastrado</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Cadastre o contrato da obra para começar a registrar as medições
            contra o valor contratado.
          </p>
        </div>
        <ContractFormDialog
          projectId={projectId}
          trigger={
            <Button>
              <Plus className="mr-2 size-4" />
              Criar primeiro contrato
            </Button>
          }
        />
      </CardContent>
    </Card>
  );
}

function ContractCard({
  projectId,
  contract,
  contractOptions,
  medicoes,
}: {
  projectId: Id<"projects">;
  contract: ContractSummary;
  contractOptions: ContractOption[];
  medicoes: Medicao[];
}) {
  const removeContract = useMutation(api.medicoes.removeContract);
  const pctMedido =
    contract.valueCents > 0
      ? Math.round((contract.medidoCents / contract.valueCents) * 100)
      : 0;

  async function handleRemove() {
    if (!window.confirm(`Excluir o contrato "${contract.title}"?`)) return;
    await runWithToast(
      () => removeContract({ contractId: contract._id }),
      "Contrato excluído",
      "Não foi possível excluir o contrato"
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              {contract.title}
            </CardTitle>
            <p className="text-sm text-muted-foreground tabular-nums">
              {formatCurrency(contract.valueCents)}
              {contract.signedAt
                ? ` · assinado em ${formatDate(contract.signedAt)}`
                : ""}
              {contract.notes ? ` · ${contract.notes}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <ContractFormDialog
              projectId={projectId}
              contract={{
                _id: contract._id,
                title: contract.title,
                valueCents: contract.valueCents,
                notes: contract.notes,
                signedAt: contract.signedAt,
              }}
              trigger={
                <Button variant="ghost" size="icon" title="Editar contrato">
                  <Pencil className="size-4" />
                </Button>
              }
            />
            <Button
              variant="ghost"
              size="icon"
              title="Excluir contrato"
              className="text-muted-foreground hover:text-destructive"
              disabled={contract.medicaoCount > 0}
              onClick={() => void handleRemove()}
            >
              <Trash2 className="size-4" />
            </Button>
            <MedicaoFormDialog
              projectId={projectId}
              contracts={contractOptions}
              defaultContractId={contract._id}
              trigger={
                <Button size="sm">
                  <Plus className="mr-1.5 size-4" />
                  Nova medição
                </Button>
              }
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
            <span>
              Medido:{" "}
              <span className="font-semibold text-foreground">
                {formatCurrency(contract.medidoCents)}
              </span>{" "}
              ({pctMedido}%)
            </span>
            <span>
              Aprovado:{" "}
              <span className="font-semibold text-foreground">
                {formatCurrency(contract.aprovadoCents)}
              </span>
            </span>
            <span>
              Pago:{" "}
              <span className="font-semibold text-green-700">
                {formatCurrency(contract.pagoCents)}
              </span>
            </span>
            <span>
              Saldo:{" "}
              <span
                className={`font-semibold ${
                  contract.saldoCents < 0 ? "text-red-600" : "text-foreground"
                }`}
              >
                {formatCurrency(contract.saldoCents)}
              </span>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(pctMedido, 100)}%` }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {medicoes.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nenhuma medição registrada neste contrato.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">Nº</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Base</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {medicoes.map((medicao) => (
                <MedicaoRow
                  key={medicao._id}
                  projectId={projectId}
                  medicao={medicao}
                  contractOptions={contractOptions}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function MedicaoRow({
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
          {medicao.status === "rascunho" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleStatus("aprovada", "Medição aprovada")}
              >
                <Check className="mr-1 size-3.5" />
                Aprovar
              </Button>
              <MedicaoFormDialog
                projectId={projectId}
                contracts={contractOptions}
                medicao={medicao}
                trigger={
                  <Button variant="ghost" size="icon" title="Editar medição">
                    <Pencil className="size-4" />
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
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
          {medicao.status === "aprovada" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void handleStatus("paga", "Medição marcada como paga")
                }
              >
                <CircleDollarSign className="mr-1 size-3.5" />
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
                <Undo2 className="size-4" />
              </Button>
            </>
          )}
          {medicao.status === "paga" && (
            <Button
              variant="ghost"
              size="icon"
              title="Voltar para aprovada"
              onClick={() =>
                void handleStatus("aprovada", "Medição voltou para aprovada")
              }
            >
              <Undo2 className="size-4" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
