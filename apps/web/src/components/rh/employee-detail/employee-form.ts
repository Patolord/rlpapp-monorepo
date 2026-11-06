import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import {
  STAFF_GROUP_PAYROLL_DEFAULTS,
  type StaffGroup,
} from "@rlpapp/shared/rh/staffGroups";

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
};

export type EmployeeForm = {
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

export const STATUS_LABEL: Record<EmployeeSummary["status"], string> = {
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

export function employeeToForm(employee: EmployeeSummary): EmployeeForm {
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
export function withStaffGroup(form: EmployeeForm, group: StaffGroup): EmployeeForm {
  return { ...form, staffGroup: group, ...staffGroupDefaults(group) };
}

export const emptyEmployeeForm: EmployeeForm = {
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

export function formPayload(form: EmployeeForm) {
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

/** Resumo dos benefícios da folha para a visualização do funcionário. */
export function describeBenefits(employee: EmployeeSummary): string {
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

export const PAYMENT_METHOD_LABEL: Record<EmployeeSummary["paymentMethod"], string> = {
  pix: "PIX",
  tbi: "TBI",
  other: "Outro",
};
