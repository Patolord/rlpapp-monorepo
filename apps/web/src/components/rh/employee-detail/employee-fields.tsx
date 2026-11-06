import {
  STAFF_GROUPS,
  STAFF_GROUP_DESCRIPTIONS,
  STAFF_GROUP_LABELS,
  type StaffGroup,
} from "@rlpapp/shared/rh/staffGroups";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  withStaffGroup,
  type EmployeeForm,
  type EmployeeSummary,
} from "./employee-form";

export function EmployeeFields({
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
              <Label htmlFor="employee-group">Equipe</Label>
              <Select
                value={form.staffGroup}
                onValueChange={(value) =>
                  setForm(withStaffGroup(form, value as StaffGroup))
                }
              >
                <SelectTrigger id="employee-group">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_GROUPS.map((group) => (
                    <SelectItem key={group} value={group}>
                      {STAFF_GROUP_LABELS[group]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
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
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
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
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
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
        <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          Padrões da folha
        </p>
        <p className="mt-1 mb-2 text-xs text-muted-foreground">
          {STAFF_GROUP_LABELS[form.staffGroup]}:{" "}
          {STAFF_GROUP_DESCRIPTIONS[form.staffGroup]} Ajuste abaixo se este
          funcionário for exceção.
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
