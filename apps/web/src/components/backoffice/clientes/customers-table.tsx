import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { Archive, ArchiveRestore, UserRoundCheck, UserRoundX } from "lucide-react";
import { toast } from "sonner";

import { CustomerDetailDialog } from "@/components/engenharia/customer-detail-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getErrorMessage } from "@/lib/errors";

type Customer = FunctionReturnType<typeof api.customers.list>[number];

export function CustomersTable({
  customers,
  loading,
}: {
  customers: Customer[];
  loading: boolean;
}) {
  const updateCustomer = useMutation(api.customers.update);
  const archiveCustomer = useMutation(api.customers.archive);
  const restoreCustomer = useMutation(api.customers.restore);

  async function toggleArchive(
    customerId: Customer["_id"],
    archived: boolean
  ) {
    try {
      if (archived) {
        await restoreCustomer({ customerId });
        toast.success("Cliente reativado");
      } else {
        await archiveCustomer({ customerId });
        toast.success("Cliente arquivado");
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao atualizar cliente"));
    }
  }

  async function toggleActive(
    customerId: Customer["_id"],
    active: boolean
  ) {
    try {
      await updateCustomer({ customerId, active: !active });
      toast.success(active ? "Cliente desativado" : "Cliente ativado");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao atualizar cliente"));
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nome</TableHead>
          <TableHead>CNPJ/CPF</TableHead>
          <TableHead>Contato</TableHead>
          <TableHead className="w-28" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {customers.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={4}
              className="py-8 text-center text-muted-foreground"
            >
              {loading
                ? "Carregando..."
                : "Nenhum cliente corresponde aos filtros."}
            </TableCell>
          </TableRow>
        )}
        {customers.map((customer) => (
          <TableRow
            key={customer._id}
            className={
              customer.archivedAt || !customer.active
                ? "text-muted-foreground"
                : undefined
            }
          >
            <TableCell>
              <div className="flex items-center gap-2 font-medium">
                {customer.name}
                {customer.personType && (
                  <Badge variant="outline">
                    {customer.personType.toUpperCase()}
                  </Badge>
                )}
                {customer.archivedAt ? (
                  <Badge variant="secondary">Arquivado</Badge>
                ) : !customer.active ? (
                  <Badge variant="outline">Inativo</Badge>
                ) : null}
              </div>
              {customer.legalName && (
                <div className="text-xs text-muted-foreground">
                  {customer.legalName}
                </div>
              )}
            </TableCell>
            <TableCell>{customer.taxId ?? "—"}</TableCell>
            <TableCell>
              <div className="text-sm">{customer.email ?? "—"}</div>
              <div className="text-xs text-muted-foreground">
                {customer.phone ?? ""}
              </div>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-0.5 text-muted-foreground">
                <CustomerDetailDialog customer={customer} />
                {!customer.archivedAt && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={customer.active ? "Desativar" : "Ativar"}
                    title={customer.active ? "Desativar" : "Ativar"}
                    onClick={() =>
                      toggleActive(customer._id, customer.active)
                    }
                  >
                    {customer.active ? (
                      <UserRoundX />
                    ) : (
                      <UserRoundCheck />
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={customer.archivedAt ? "Restaurar" : "Arquivar"}
                  title={customer.archivedAt ? "Restaurar" : "Arquivar"}
                  onClick={() =>
                    toggleArchive(customer._id, Boolean(customer.archivedAt))
                  }
                >
                  {customer.archivedAt ? (
                    <ArchiveRestore />
                  ) : (
                    <Archive />
                  )}
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
