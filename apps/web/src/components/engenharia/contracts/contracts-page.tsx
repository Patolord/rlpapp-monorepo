import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency, formatDate } from "@rlpapp/shared";
import { FileText, Pencil, Plus, Search, Trash2 } from "lucide-react";

import {
  ContractFormDialog,
  type ContractDirection,
  type ContractKind,
} from "@/components/engenharia/contracts/contract-form-dialog";
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
import { runWithToast } from "@/lib/errors";
import { obraLinkSlug } from "@/lib/engenharia/obra-paths";

const DIRECTION_LABELS: Record<ContractDirection, string> = {
  client_sale: "Venda ao cliente",
  contractor_hire: "Contratação",
};

const KIND_LABELS: Record<ContractKind, string> = {
  base: "Base",
  addendum: "Aditivo",
};

export function ContractsPage({
  lockedProjectId,
  defaultCustomerId,
  title = "Contratos",
  description = "Contratos de venda ao cliente e contratação de empreiteiros.",
}: {
  lockedProjectId?: Id<"projects">;
  defaultCustomerId?: Id<"customers"> | null;
  title?: string;
  description?: string;
}) {
  const [search, setSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState<
    "all" | ContractDirection
  >("all");

  const contracts = useQuery(api.contracts.list, {
    projectId: lockedProjectId,
    direction: directionFilter === "all" ? undefined : directionFilter,
    search: search.trim() || undefined,
  });
  const removeContract = useMutation(api.contracts.remove);

  const totals = useMemo(() => {
    const rows = contracts ?? [];
    return {
      count: rows.length,
      clientSale: rows
        .filter((r) => r.direction === "client_sale")
        .reduce((sum, row) => sum + row.valueCents, 0),
      contractorHire: rows
        .filter((r) => r.direction === "contractor_hire")
        .reduce((sum, row) => sum + row.valueCents, 0),
    };
  }, [contracts]);

  async function handleRemove(contractId: Id<"contracts">, name: string) {
    if (!window.confirm(`Excluir o contrato "${name}"?`)) return;
    await runWithToast(
      () => removeContract({ contractId }),
      "Contrato excluído",
      "Não foi possível excluir o contrato"
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <ContractFormDialog
          lockedProjectId={lockedProjectId}
          defaultCustomerId={defaultCustomerId}
          trigger={
            <Button>
              <Plus className="mr-2 size-4" />
              Novo contrato
            </Button>
          }
        />
      </div>

      {contracts !== undefined && contracts.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard label="Contratos" value={`${totals.count}`} />
          <SummaryCard
            label="Total vendido"
            value={formatCurrency(totals.clientSale)}
          />
          <SummaryCard
            label="Total contratado"
            value={formatCurrency(totals.contractorHire)}
          />
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar por título, cliente, empreiteiro..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              value={directionFilter}
              onValueChange={(value) =>
                setDirectionFilter(value as "all" | ContractDirection)
              }
            >
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as direções</SelectItem>
                <SelectItem value="client_sale">Venda ao cliente</SelectItem>
                <SelectItem value="contractor_hire">
                  Contratação de empreiteiro
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {contracts === undefined ? (
            <div className="h-40 animate-pulse rounded-lg bg-muted" />
          ) : contracts.length === 0 ? (
            <EmptyState
              lockedProjectId={lockedProjectId}
              defaultCustomerId={defaultCustomerId}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contrato</TableHead>
                  <TableHead>Direção</TableHead>
                  <TableHead>Contraparte</TableHead>
                  {!lockedProjectId && <TableHead>Obra</TableHead>}
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map((contract) => {
                  const counterparty =
                    contract.direction === "client_sale"
                      ? contract.customerName
                      : contract.contractorName;
                  return (
                    <TableRow key={contract._id}>
                      <TableCell>
                        <div className="font-medium">{contract.title}</div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <Badge variant="outline" className="font-normal">
                            {KIND_LABELS[contract.kind]}
                          </Badge>
                          {contract.parentTitle && (
                            <span>de {contract.parentTitle}</span>
                          )}
                          {contract.signedAt && (
                            <span>
                              · assinado {formatDate(contract.signedAt)}
                            </span>
                          )}
                          <span>
                            · {contract.serviceItemCount} serviço
                            {contract.serviceItemCount === 1 ? "" : "s"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            contract.direction === "client_sale"
                              ? "default"
                              : "secondary"
                          }
                          className="font-normal"
                        >
                          {DIRECTION_LABELS[contract.direction]}
                        </Badge>
                      </TableCell>
                      <TableCell>{counterparty ?? "—"}</TableCell>
                      {!lockedProjectId && (
                        <TableCell>
                          {contract.projectId && contract.projectSlug ? (
                            <Link
                              to="/engenharia/obras/$obraSlug/contratos"
                              params={{
                                obraSlug: obraLinkSlug({
                                  slug: contract.projectSlug,
                                  _id: contract.projectId,
                                }),
                              }}
                              className="hover:underline"
                            >
                              {contract.projectName ?? "Obra"}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      )}
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatCurrency(contract.valueCents)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <ContractFormDialog
                            contractId={contract._id}
                            lockedProjectId={lockedProjectId}
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Editar"
                              >
                                <Pencil className="size-4" />
                              </Button>
                            }
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Excluir"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              void handleRemove(contract._id, contract.title)
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  lockedProjectId,
  defaultCustomerId,
}: {
  lockedProjectId?: Id<"projects">;
  defaultCustomerId?: Id<"customers"> | null;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-14 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <FileText className="size-7" />
      </div>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Nenhum contrato cadastrado</h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          Cadastre contratos de venda ao cliente ou contratação de empreiteiros
          com os serviços e valores acordados.
        </p>
      </div>
      <ContractFormDialog
        lockedProjectId={lockedProjectId}
        defaultCustomerId={defaultCustomerId}
        trigger={
          <Button>
            <Plus className="mr-2 size-4" />
            Criar primeiro contrato
          </Button>
        }
      />
    </div>
  );
}
