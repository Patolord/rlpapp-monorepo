import { useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { STAFF_GROUP_LABELS } from "@rlpapp/shared/rh/staffGroups";
import { useMutation } from "convex/react";
import { Archive, Pencil, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { AlimonySection } from "@/components/rh/employee-detail/alimony-section";
import { EmployeeFields } from "@/components/rh/employee-detail/employee-fields";
import {
  PAYMENT_METHOD_LABEL,
  STATUS_LABEL,
  describeBenefits,
  emptyEmployeeForm,
  employeeToForm,
  formPayload,
  type EmployeeForm,
  type EmployeeSummary,
} from "@/components/rh/employee-detail/employee-form";
import { LoansSection } from "@/components/rh/employee-detail/loans-section";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getErrorMessage } from "@/lib/errors";
import { formatCentsInput } from "@/lib/rh/money";

export type { EmployeeSummary };

export function EmployeeCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createEmployee = useMutation(api.employees.create);
  const [form, setForm] = useState<EmployeeForm>(emptyEmployeeForm);

  function handleOpenChange(next: boolean) {
    if (next) setForm(emptyEmployeeForm);
    onOpenChange(next);
  }
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate() {
    if (!form.name.trim()) {
      toast.error("Informe o nome");
      return;
    }
    setSubmitting(true);
    try {
      await createEmployee(formPayload(form));
      toast.success("Funcionário criado");
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao criar funcionário"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo funcionário</DialogTitle>
        </DialogHeader>
        <EmployeeFields form={form} setForm={setForm} />
        <DialogFooter>
          <Button onClick={() => void handleCreate()} disabled={submitting}>
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EmployeeDetailDialog({
  employee,
}: {
  employee: EmployeeSummary;
}) {
  const updateEmployee = useMutation(api.employees.update);
  const archiveEmployee = useMutation(api.employees.archive);
  const restoreEmployee = useMutation(api.employees.restore);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => employeeToForm(employee));
  const [submitting, setSubmitting] = useState(false);

  function handleOpen(next: boolean) {
    setOpen(next);
    if (next) {
      setForm(employeeToForm(employee));
      setEditing(false);
    }
  }

  async function handleSave() {
    setSubmitting(true);
    try {
      const payload = formPayload(form);
      await updateEmployee({
        employeeId: employee._id,
        ...payload,
        code: payload.code ?? null,
        cpf: payload.cpf ?? null,
        jobTitle: payload.jobTitle ?? null,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        hiredAt: payload.hiredAt ?? null,
        notes: payload.notes ?? null,
        pixKey: payload.pixKey ?? null,
      });
      toast.success("Funcionário atualizado");
      setEditing(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao atualizar funcionário"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil />
        Detalhe
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {employee.name}
            <Badge variant={employee.archivedAt ? "secondary" : "default"}>
              {employee.archivedAt
                ? "Arquivado"
                : STATUS_LABEL[employee.status]}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        {editing ? (
          <EmployeeFields form={form} setForm={setForm} />
        ) : (
          <div className="grid gap-3 text-sm">
            <p>
              <span className="text-muted-foreground">Código:</span>{" "}
              {employee.code ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Equipe:</span>{" "}
              {STAFF_GROUP_LABELS[employee.staffGroup]}
            </p>
            <p>
              <span className="text-muted-foreground">Cargo:</span>{" "}
              {employee.jobTitle ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">CPF:</span>{" "}
              {employee.cpf ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Pagamento:</span>{" "}
              {PAYMENT_METHOD_LABEL[employee.paymentMethod]}
            </p>
            <p>
              <span className="text-muted-foreground">Salário base:</span>{" "}
              {formatCentsInput(employee.baseSalaryCents)}
            </p>
            <p>
              <span className="text-muted-foreground">Benefícios:</span>{" "}
              {describeBenefits(employee)}
            </p>
            {!employee.archivedAt ? (
              <>
                <LoansSection employee={employee} />
                <AlimonySection employee={employee} />
              </>
            ) : null}
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            {employee.archivedAt ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void restoreEmployee({ employeeId: employee._id })
                    .then(() => toast.success("Funcionário restaurado"))
                    .catch((error) =>
                      toast.error(
                        getErrorMessage(error, "Erro ao restaurar funcionário")
                      )
                    )
                }
              >
                <RotateCcw />
                Restaurar
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void archiveEmployee({ employeeId: employee._id })
                    .then(() => {
                      toast.success("Funcionário arquivado");
                      setOpen(false);
                    })
                    .catch((error) =>
                      toast.error(
                        getErrorMessage(error, "Erro ao arquivar funcionário")
                      )
                    )
                }
              >
                <Archive />
                Arquivar
              </Button>
            )}
          </div>
          {editing ? (
            <Button onClick={() => void handleSave()} disabled={submitting}>
              Salvar
            </Button>
          ) : (
            !employee.archivedAt && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                Editar
              </Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { STATUS_LABEL };
