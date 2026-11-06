import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency, formatDate } from "@rlpapp/shared";
import { FileText, Plus } from "lucide-react";

import { MedicaoRow, type Medicao } from "@/components/engenharia/medicoes/medicao-row";
import {
  MedicaoFormDialog,
  type ContractOption,
} from "@/components/engenharia/medicoes/medicao-form-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCan } from "@/hooks/use-can";

export type ContractSummary = {
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

export function ContractCard({
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
  const canWrite = useCan("medicoes.write");
  const pctMedido =
    contract.valueCents > 0
      ? Math.round((contract.medidoCents / contract.valueCents) * 100)
      : 0;

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
          {canWrite && (
            <MedicaoFormDialog
              projectId={projectId}
              contracts={contractOptions}
              defaultContractId={contract._id}
              trigger={
                <Button size="sm">
                  <Plus />
                  Nova medição
                </Button>
              }
            />
          )}
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
              className="h-full w-full rounded-full bg-primary transition-transform duration-300 ease-snappy motion-reduce:transition-none"
              style={{ transform: `translateX(${Math.min(pctMedido, 100) - 100}%)` }}
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
