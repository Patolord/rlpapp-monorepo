import { useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Archive, Pencil, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getErrorMessage } from "@/lib/errors";
import { formatCentsInput, parsePayrollAmountToCents } from "@/lib/rh/money";

export type EmployeeSummary = {
  _id: Id<"employees">;
  code: string | null;
  name: string;
  cpf: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  hiredAt: number | null;
  notes: string | null;
  status: "active" | "on_leave" | "terminated";
  archivedAt: number | null;
  paymentMethod: "pix" | "tbi" | "other";
  pixKey: string | null;
  baseSalaryCents: number;
  receivesFoodBasket: boolean;
  dailyTransitCents: number;
  defaultTransportFoodDays: number;
};

type EmployeeForm = {
  code: string;
  name: string;
  cpf: string;
  jobTitle: string;
  email: string;
  phone: string;
  hiredAt: string;
  notes: string;
  status: EmployeeSummary["status"];
  paymentMethod: EmployeeSummary["paymentMethod"];
  pixKey: string;
  baseSalary: string;
  receivesFoodBasket: boolean;
  dailyTransit: string;
  defaultTransportFoodDays: string;
};

const STATUS_LABEL: Record<EmployeeSummary["status"], string> = {
  active: "Ativo",
  on_leave: "Afastado",
  terminated: "Desligado",
};

function toDateInput(timestamp: number | null): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateInput(value: string): number | undefined {
  if (!value) return undefined;
  const timestamp = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function employeeToForm(employee: EmployeeSummary): EmployeeForm {
  return {
    code: employee.code ?? "",
    name: employee.name,
    cpf: employee.cpf ?? "",
    jobTitle: employee.jobTitle ?? "",
    email: employee.email ?? "",
    phone: employee.phone ?? "",
    hiredAt: toDateInput(employee.hiredAt),
    notes: employee.notes ?? "",
    status: employee.status,
    paymentMethod: employee.paymentMethod,
    pixKey: employee.pixKey ?? "",
    baseSalary: formatCentsInput(employee.baseSalaryCents),
    receivesFoodBasket: employee.receivesFoodBasket,
    dailyTransit: formatCentsInput(employee.dailyTransitCents),
    defaultTransportFoodDays: String(employee.defaultTransportFoodDays),
  };
}

const emptyEmployeeForm: EmployeeForm = {
  code: "",
  name: "",
  cpf: "",
  jobTitle: "",
  email: "",
  phone: "",
  hiredAt: "",
  notes: "",
  status: "active",
  paymentMethod: "pix",
  pixKey: "",
  baseSalary: "0,00",
  receivesFoodBasket: true,
  dailyTransit: "21,40",
  defaultTransportFoodDays: "22",
};

function formPayload(form: EmployeeForm) {
  return {
    code: form.code || undefined,
    name: form.name,
    cpf: form.cpf || undefined,
    jobTitle: form.jobTitle || undefined,
    email: form.email || undefined,
    phone: form.phone || undefined,
    hiredAt: fromDateInput(form.hiredAt),
    notes: form.notes || undefined,
    status: form.status,
    paymentMethod: form.paymentMethod,
    pixKey: form.pixKey || undefined,
    baseSalaryCents: parsePayrollAmountToCents(form.baseSalary || "0"),
    receivesFoodBasket: form.receivesFoodBasket,
    dailyTransitCents: parsePayrollAmountToCents(form.dailyTransit || "0"),
    defaultTransportFoodDays: Number.parseInt(form.defaultTransportFoodDays, 10) || 0,
  };
}

function EmployeeFields({
  form,
  setForm,
}: {
  form: EmployeeForm;
  setForm: (form: EmployeeForm) => void;
}) {
  return (
    <div className="grid gap-4">
      <div>
        <p className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          Dados básicos
        </p>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="employee-code">Código</Label>
              <Input
                id="employee-code"
                value={form.code}
                onChange={(event) =>
                  setForm({ ...form, code: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-name">Nome</Label>
              <Input
                id="employee-name"
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="employee-job">Cargo</Label>
              <Input
                id="employee-job"
                value={form.jobTitle}
                onChange={(event) =>
                  setForm({ ...form, jobTitle: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-cpf">CPF</Label>
              <Input
                id="employee-cpf"
                value={form.cpf}
                onChange={(event) =>
                  setForm({ ...form, cpf: event.target.value })
                }
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="employee-phone">Telefone</Label>
              <Input
                id="employee-phone"
                value={form.phone}
                onChange={(event) =>
                  setForm({ ...form, phone: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-email">E-mail</Label>
              <Input
                id="employee-email"
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="employee-hired">Admissão</Label>
              <Input
                id="employee-hired"
                type="date"
                value={form.hiredAt}
                onChange={(event) =>
                  setForm({ ...form, hiredAt: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-status">Situação</Label>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  setForm({
                    ...form,
                    status: value as EmployeeSummary["status"],
                  })
                }
              >
                <SelectTrigger id="employee-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="on_leave">Afastado</SelectItem>
                  <SelectItem value="terminated">Desligado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="employee-notes">Observações</Label>
            <Input
              id="employee-notes"
              value={form.notes}
              onChange={(event) =>
                setForm({ ...form, notes: event.target.value })
              }
            />
          </div>
        </div>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          Padrões da folha
        </p>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="employee-salary">Salário base (R$)</Label>
              <Input
                id="employee-salary"
                className="text-right tabular-nums"
                value={form.baseSalary}
                onChange={(event) =>
                  setForm({ ...form, baseSalary: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-pay">Forma de pagamento</Label>
              <Select
                value={form.paymentMethod}
                onValueChange={(value) =>
                  setForm({
                    ...form,
                    paymentMethod: value as EmployeeSummary["paymentMethod"],
                  })
                }
              >
                <SelectTrigger id="employee-pay">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="tbi">TBI</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="employee-pix">Chave PIX</Label>
            <Input
              id="employee-pix"
              value={form.pixKey}
              onChange={(event) =>
                setForm({ ...form, pixKey: event.target.value })
              }
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="employee-transit">Passagem diária (R$)</Label>
              <Input
                id="employee-transit"
                className="text-right"
                value={form.dailyTransit}
                onChange={(event) =>
                  setForm({ ...form, dailyTransit: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-days">Dias padrão (transp./alim.)</Label>
              <Input
                id="employee-days"
                className="text-right"
                value={form.defaultTransportFoodDays}
                onChange={(event) =>
                  setForm({
                    ...form,
                    defaultTransportFoodDays: event.target.value,
                  })
                }
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.receivesFoodBasket}
              onCheckedChange={(checked) =>
                setForm({ ...form, receivesFoodBasket: checked === true })
              }
            />
            Recebe cesta básica
          </label>
        </div>
      </div>
    </div>
  );
}

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
        <Pencil className="size-3.5" />
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
              <span className="text-muted-foreground">Cargo:</span>{" "}
              {employee.jobTitle ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">CPF:</span>{" "}
              {employee.cpf ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Pagamento:</span>{" "}
              {employee.paymentMethod.toUpperCase()}
            </p>
            <p>
              <span className="text-muted-foreground">Salário base:</span>{" "}
              {formatCentsInput(employee.baseSalaryCents)}
            </p>
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
                <RotateCcw className="mr-1 size-3.5" />
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
                <Archive className="mr-1 size-3.5" />
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
