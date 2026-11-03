import { useEffect, useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency, formatDisplayName, formatUsername } from "@rlpapp/shared";
import {
  STAFF_GROUPS,
  STAFF_GROUP_DESCRIPTIONS,
  STAFF_GROUP_LABELS,
  STAFF_GROUP_PAYROLL_DEFAULTS,
  type StaffGroup,
} from "@rlpapp/shared/rh/staffGroups";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  HandCoins,
  Link2,
  Link2Off,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { PayrollLoanDialog } from "@/components/rh/payroll-loan-dialog";

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
import { formatMonthLabel } from "@/lib/rh/labels";
import { formatCentsInput, parsePayrollAmountToCents } from "@/lib/rh/money";

export type EmployeeSummary = {
  _id: Id<"employees">;
  code: string | null;
  name: string;
  cpf: string | null;
  /** Equipe: obra, escritório ou diretoria. Define os padrões da folha. */
  staffGroup: StaffGroup;
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
  /** Usuário do app que bate ponto como este funcionário. */
  userId: Id<"users"> | null;
};

type EmployeeForm = {
  code: string;
  name: string;
  cpf: string;
  staffGroup: StaffGroup;
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
    staffGroup: employee.staffGroup,
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

/** Campos da folha preenchidos pelo padrão da equipe. */
function staffGroupDefaults(
  group: StaffGroup
): Pick<
  EmployeeForm,
  "receivesFoodBasket" | "dailyTransit" | "defaultTransportFoodDays"
> {
  const defaults = STAFF_GROUP_PAYROLL_DEFAULTS[group];
  return {
    receivesFoodBasket: defaults.receivesFoodBasket,
    dailyTransit: formatCentsInput(defaults.dailyTransitCents),
    defaultTransportFoodDays: String(defaults.defaultTransportFoodDays),
  };
}

/** Troca a equipe e aplica os padrões dela aos campos de benefícios. */
function withStaffGroup(form: EmployeeForm, group: StaffGroup): EmployeeForm {
  return { ...form, staffGroup: group, ...staffGroupDefaults(group) };
}

const emptyEmployeeForm: EmployeeForm = {
  code: "",
  name: "",
  cpf: "",
  staffGroup: "obra",
  jobTitle: "",
  email: "",
  phone: "",
  hiredAt: "",
  notes: "",
  status: "active",
  paymentMethod: "pix",
  pixKey: "",
  baseSalary: "0,00",
  ...staffGroupDefaults("obra"),
};

function formPayload(form: EmployeeForm) {
  return {
    code: form.code || undefined,
    name: form.name,
    cpf: form.cpf || undefined,
    staffGroup: form.staffGroup,
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

/** Resumo dos benefícios da folha para a visualização do funcionário. */
function describeBenefits(employee: EmployeeSummary): string {
  const parts: string[] = [];
  if (employee.receivesFoodBasket) parts.push("cesta básica");
  if (employee.defaultTransportFoodDays > 0) {
    parts.push(`vale-alimentação (${employee.defaultTransportFoodDays} dias)`);
    if (employee.dailyTransitCents > 0) {
      parts.push(
        `vale-transporte (R$ ${formatCentsInput(employee.dailyTransitCents)}/dia)`
      );
    }
  }
  return parts.length ? parts.join(", ") : "nenhum";
}

const PAYMENT_METHOD_LABEL: Record<EmployeeSummary["paymentMethod"], string> = {
  pix: "PIX",
  tbi: "TBI",
  other: "Outro",
};

function currentMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** Campo que salva ao sair (blur/Enter), acompanhando o valor vindo do servidor. */
function CommitInput({
  value,
  onCommit,
  className,
  placeholder,
  "aria-label": ariaLabel,
}: {
  value: string;
  onCommit: (value: string) => void;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  return (
    <Input
      className={className}
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        if (text === value) return;
        try {
          onCommit(text);
        } catch (error) {
          // Valor que não dá para interpretar (ex.: "abc"): avisa e volta ao salvo.
          toast.error(getErrorMessage(error, "Valor inválido"));
          setText(value);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
      }}
    />
  );
}

/**
 * Empréstimos do funcionário: resumo no cadastro e gestão completa no mesmo
 * diálogo usado pela folha. As parcelas entram como desconto na folha de cada
 * mês a partir do início escolhido.
 */
function LoansSection({ employee }: { employee: EmployeeSummary }) {
  const { year, month } = currentMonth();
  const loans = useQuery(api.payroll.listLoans, {
    employeeId: employee._id,
    year,
    paymentMonth: month,
  });
  const [open, setOpen] = useState(false);
  // `settled` já é verdadeiro no mês da última parcela; ela ainda está em
  // desconto, então continua visível até o mês virar.
  const active = (loans ?? []).filter((loan) => !loan.settled || loan.dueCents > 0);
  const outstanding = active.reduce((sum, loan) => sum + loan.outstandingCents, 0);

  return (
    <div className="grid gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          Empréstimos
        </p>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <HandCoins />
          {active.length ? "Gerenciar" : "Novo empréstimo"}
        </Button>
      </div>
      {loans === undefined ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : active.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum empréstimo em aberto. As parcelas são descontadas na folha de
          cada mês, a partir do início escolhido.
        </p>
      ) : (
        <ul className="grid gap-1.5 text-sm">
          {active.map((loan) => (
            <li key={loan._id} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium tabular-nums">
                {formatCurrency(loan.totalCents)}
              </span>
              <span className="text-muted-foreground">
                em {loan.installmentCount}× de {formatCurrency(loan.installmentCents)}
                {" · "}
                {loan.paidCount} paga{loan.paidCount === 1 ? "" : "s"}
                {" · "}
                saldo {formatCurrency(loan.outstandingCents)}
                {" · "}
                {loan.dueCents > 0
                  ? "em desconto"
                  : `início ${formatMonthLabel(loan.startYear, loan.startMonth)}`}
              </span>
            </li>
          ))}
          {active.length > 1 ? (
            <li className="text-xs text-muted-foreground">
              Saldo total em aberto: {formatCurrency(outstanding)}
            </li>
          ) : null}
        </ul>
      )}
      {open ? (
        <PayrollLoanDialog
          employeeId={employee._id}
          employeeName={employee.name}
          jobTitle={employee.jobTitle}
          year={year}
          paymentMonth={month}
          closed={false}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

const emptyAlimonyForm = {
  beneficiaryName: "",
  amount: "",
  paymentMethod: "pix" as EmployeeSummary["paymentMethod"],
  pixKey: "",
};

/**
 * Pensão alimentícia: beneficiários pagos por conta deste funcionário. Cada
 * pensão vira uma linha própria na folha, separada da linha do funcionário.
 */
function AlimonySection({ employee }: { employee: EmployeeSummary }) {
  const alimonies = useQuery(api.alimonies.listForEmployee, {
    employeeId: employee._id,
  });
  const createAlimony = useMutation(api.alimonies.create);
  const updateAlimony = useMutation(api.alimonies.update);
  const archiveAlimony = useMutation(api.alimonies.archive);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyAlimonyForm);
  const [submitting, setSubmitting] = useState(false);

  function commit(
    alimonyId: Id<"employeeAlimonies">,
    patch: Omit<Parameters<typeof updateAlimony>[0], "alimonyId">
  ) {
    void updateAlimony({ alimonyId, ...patch }).catch((error) =>
      toast.error(getErrorMessage(error, "Erro ao atualizar pensão"))
    );
  }

  async function handleCreate() {
    if (!form.beneficiaryName.trim()) {
      toast.error("Informe o nome do beneficiário");
      return;
    }
    setSubmitting(true);
    try {
      await createAlimony({
        employeeId: employee._id,
        beneficiaryName: form.beneficiaryName,
        amountCents: parsePayrollAmountToCents(form.amount || "0"),
        paymentMethod: form.paymentMethod,
        pixKey: form.pixKey || undefined,
      });
      toast.success("Pensão cadastrada");
      setForm(emptyAlimonyForm);
      setAdding(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao cadastrar pensão"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          Pensão alimentícia
        </p>
        {!adding ? (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus />
            Beneficiário
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Paga direto ao beneficiário, em linha própria da folha. Não entra nos
        descontos nem no total do funcionário. O valor aqui é o padrão; cada mês
        pode ter o seu.
      </p>
      {alimonies === undefined ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : alimonies.length === 0 && !adding ? (
        <p className="text-xs text-muted-foreground">Nenhuma pensão cadastrada.</p>
      ) : (
        <ul className="grid gap-2">
          {alimonies.map((alimony) => (
            <li
              key={alimony._id}
              className="grid gap-2 rounded-md bg-muted/40 p-2 sm:grid-cols-[1fr_110px_88px_auto]"
            >
              <CommitInput
                aria-label="Beneficiário"
                className="h-8"
                value={alimony.beneficiaryName}
                onCommit={(value) =>
                  commit(alimony._id, { beneficiaryName: value })
                }
              />
              <CommitInput
                aria-label="Valor padrão (R$)"
                className="h-8 text-right tabular-nums"
                value={formatCentsInput(alimony.amountCents)}
                onCommit={(value) =>
                  commit(alimony._id, {
                    amountCents: parsePayrollAmountToCents(value || "0"),
                  })
                }
              />
              <Select
                value={alimony.paymentMethod}
                onValueChange={(value) =>
                  commit(alimony._id, {
                    paymentMethod: value as EmployeeSummary["paymentMethod"],
                  })
                }
              >
                <SelectTrigger className="h-8" aria-label="Forma de pagamento">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["pix", "tbi", "other"] as const).map((method) => (
                    <SelectItem key={method} value={method}>
                      {PAYMENT_METHOD_LABEL[method]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                title="Encerrar pensão"
                aria-label="Encerrar pensão"
                onClick={() => {
                  if (
                    !confirm(
                      `Encerrar a pensão de ${alimony.beneficiaryName}? Ela sai das folhas em aberto e não entra nos próximos meses.`
                    )
                  ) {
                    return;
                  }
                  void archiveAlimony({ alimonyId: alimony._id })
                    .then(() => toast.success("Pensão encerrada"))
                    .catch((error) =>
                      toast.error(getErrorMessage(error, "Erro ao encerrar pensão"))
                    );
                }}
              >
                <Trash2 />
              </Button>
              <CommitInput
                aria-label="Chave PIX"
                placeholder="Chave PIX"
                className="h-8 sm:col-span-4"
                value={alimony.pixKey ?? ""}
                onCommit={(value) => commit(alimony._id, { pixKey: value || null })}
              />
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <div className="grid gap-2 rounded-md border border-dashed p-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_110px_88px]">
            <Input
              aria-label="Nome do beneficiário"
              placeholder="Nome do beneficiário"
              className="h-8"
              value={form.beneficiaryName}
              onChange={(event) =>
                setForm({ ...form, beneficiaryName: event.target.value })
              }
            />
            <Input
              aria-label="Valor mensal (R$)"
              placeholder="Valor (R$)"
              className="h-8 text-right tabular-nums"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
            />
            <Select
              value={form.paymentMethod}
              onValueChange={(value) =>
                setForm({
                  ...form,
                  paymentMethod: value as EmployeeSummary["paymentMethod"],
                })
              }
            >
              <SelectTrigger className="h-8" aria-label="Forma de pagamento">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["pix", "tbi", "other"] as const).map((method) => (
                  <SelectItem key={method} value={method}>
                    {PAYMENT_METHOD_LABEL[method]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input
            aria-label="Chave PIX do beneficiário"
            placeholder="Chave PIX do beneficiário"
            className="h-8"
            value={form.pixKey}
            onChange={(event) => setForm({ ...form, pixKey: event.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setForm(emptyAlimonyForm);
              }}
            >
              Cancelar
            </Button>
            <Button size="sm" disabled={submitting} onClick={() => void handleCreate()}>
              Cadastrar pensão
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const NO_USER = "__none__";

/**
 * Vínculo com o usuário do app (quem bate ponto como este funcionário).
 * É um vínculo próprio, salvo na hora, independente do formulário de edição.
 */
function AppUserSection({ employee }: { employee: EmployeeSummary }) {
  const users = useQuery(api.users.list, { onlyActive: true });
  const linkUser = useMutation(api.employees.linkUser);
  const [selected, setSelected] = useState<string>(employee.userId ?? NO_USER);
  const [saving, setSaving] = useState(false);

  const current = users?.find((user) => user._id === employee.userId) ?? null;
  const sorted = [...(users ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR")
  );
  const dirty = selected !== (employee.userId ?? NO_USER);

  async function save(userId: Id<"users"> | null) {
    setSaving(true);
    try {
      await linkUser({ employeeId: employee._id, userId });
      setSelected(userId ?? NO_USER);
      toast.success(userId ? "Usuário vinculado" : "Usuário desvinculado");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao vincular usuário"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-2 rounded-md border p-3">
      <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        Usuário do app (ponto)
      </p>
      <p className="text-xs text-muted-foreground">
        {current
          ? `Vinculado a ${formatDisplayName(current.name)}${current.username ? ` (@${formatUsername(current.username)})` : ""}. `
          : employee.userId
            ? "Vinculado a um usuário inativo. "
            : "Sem usuário vinculado: este funcionário ainda não consegue bater ponto pelo app. "}
        O vínculo também é feito sozinho quando o e-mail do funcionário é igual ao do usuário.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={selected}
          onValueChange={(value) => setSelected(value ?? NO_USER)}
          disabled={saving || users === undefined}
        >
          <SelectTrigger className="min-w-56 flex-1" aria-label="Usuário do app">
            <SelectValue placeholder="Escolher usuário" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_USER}>Nenhum</SelectItem>
            {sorted.map((user) => (
              <SelectItem key={user._id} value={user._id}>
                {formatDisplayName(user.name)}
                {user.username ? ` (@${formatUsername(user.username)})` : user.email ? ` (${user.email})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={!dirty || saving}
          onClick={() =>
            void save(selected === NO_USER ? null : (selected as Id<"users">))
          }
        >
          <Link2 />
          Vincular
        </Button>
        {employee.userId ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={() => void save(null)}
          >
            <Link2Off />
            Desvincular
          </Button>
        ) : null}
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
                <AppUserSection employee={employee} />
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
