import { diffFields, logAudit } from "../../lib/audit";

import { assertNonNegativeCents } from "./payroll";
import {
  DEFAULT_STAFF_GROUP,
  STAFF_GROUP_PAYROLL_DEFAULTS,
  type StaffGroup,
} from "@rlpapp/shared/rh/staffGroups";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { alreadyExists, notFound, ruleViolation } from "../../lib/domainErrors";
import { normalizeTaxId, optionalTaxIdDigits, validateTaxIdForPersonType } from "../kernel/taxId";
import { normalizeText } from "../kernel/text";

// Cadastro de funcionários (RH): listagem, criação, edição, arquivamento.

export type EmployeeRow = {
  _id: Id<"employees">;
  _creationTime: number;
  code: string | null;
  name: string;
  cpf: string | null;
  staffGroup: StaffGroup;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  hiredAt: number | null;
  notes: string | null;
  status: Doc<"employees">["status"];
  archivedAt: number | null;
  paymentMethod: Doc<"employees">["paymentMethod"];
  pixKey: string | null;
  baseSalaryCents: number;
  receivesFoodBasket: boolean;
  dailyTransitCents: number;
  defaultTransportFoodDays: number;
  createdAt: number;
  updatedAt: number | null;
};

/** Cadastros anteriores à equipe não têm o campo: eram todos de obra. */
export function employeeStaffGroupOf(
  employee: Pick<Doc<"employees">, "staffGroup">
): StaffGroup {
  return employee.staffGroup ?? DEFAULT_STAFF_GROUP;
}

export function toEmployeeRow(employee: Doc<"employees">): EmployeeRow {
  return {
    _id: employee._id,
    _creationTime: employee._creationTime,
    code: employee.code ?? null,
    name: employee.name,
    cpf: employee.cpf ?? null,
    staffGroup: employeeStaffGroupOf(employee),
    jobTitle: employee.jobTitle ?? null,
    email: employee.email ?? null,
    phone: employee.phone ?? null,
    hiredAt: employee.hiredAt ?? null,
    notes: employee.notes ?? null,
    status: employee.status,
    archivedAt: employee.archivedAt ?? null,
    paymentMethod: employee.paymentMethod,
    pixKey: employee.pixKey ?? null,
    baseSalaryCents: employee.baseSalaryCents,
    receivesFoodBasket: employee.receivesFoodBasket,
    dailyTransitCents: employee.dailyTransitCents,
    defaultTransportFoodDays: employee.defaultTransportFoodDays,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt ?? null,
  };
}

function employeeSnapshot(employee: Doc<"employees">) {
  return {
    code: employee.code,
    name: employee.name,
    cpf: employee.cpf,
    staffGroup: employeeStaffGroupOf(employee),
    jobTitle: employee.jobTitle,
    email: employee.email,
    phone: employee.phone,
    hiredAt: employee.hiredAt,
    notes: employee.notes,
    status: employee.status,
    archivedAt: employee.archivedAt,
    paymentMethod: employee.paymentMethod,
    pixKey: employee.pixKey,
    baseSalaryCents: employee.baseSalaryCents,
    receivesFoodBasket: employee.receivesFoodBasket,
    dailyTransitCents: employee.dailyTransitCents,
    defaultTransportFoodDays: employee.defaultTransportFoodDays,
  };
}

function normalizeCode(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

async function assertUniqueEmployeeIdentity(
  ctx: MutationCtx,
  params: {
    name: string;
    code?: string;
    cpf?: string;
    excludeId?: Id<"employees">;
  }
) {
  const nameNormalized = normalizeText(params.name);
  const existingByName = await ctx.db
    .query("employees")
    .withIndex("by_name_normalized", (q) =>
      q.eq("nameNormalized", nameNormalized)
    )
    .collect();
  const nameConflict = existingByName.find(
    (row) => row._id !== params.excludeId && !row.archivedAt
  );
  if (nameConflict) {
    throw alreadyExists("Já existe um funcionário com este nome");
  }

  if (params.code) {
    const code = params.code;
    const existingByCode = await ctx.db
      .query("employees")
      .withIndex("by_code", (q) => q.eq("code", code))
      .collect();
    const codeConflict = existingByCode.find(
      (row) => row._id !== params.excludeId && !row.archivedAt
    );
    if (codeConflict) {
      throw alreadyExists("Já existe um funcionário com este código");
    }
  }

  if (params.cpf) {
    const cpfNormalized = normalizeTaxId(params.cpf);
    const existingByCpf = await ctx.db
      .query("employees")
      .withIndex("by_cpf_normalized", (q) =>
        q.eq("cpfNormalized", cpfNormalized)
      )
      .collect();
    const cpfConflict = existingByCpf.find(
      (row) => row._id !== params.excludeId && !row.archivedAt
    );
    if (cpfConflict) {
      throw alreadyExists("Já existe um funcionário com este CPF");
    }
  }
}

export type EmployeeStatus = Doc<"employees">["status"];

export async function listEmployees(
  ctx: QueryCtx,
  input: {
    search?: string;
    includeArchived?: boolean;
    status?: EmployeeStatus;
    staffGroup?: StaffGroup;
  }
): Promise<EmployeeRow[]> {
  let employees = input.status
    ? await ctx.db
        .query("employees")
        .withIndex("by_status", (q) => q.eq("status", input.status!))
        .collect()
    : await ctx.db.query("employees").order("desc").collect();

  if (!input.includeArchived) {
    employees = employees.filter((row) => !row.archivedAt);
  }
  if (input.staffGroup) {
    employees = employees.filter(
      (row) => employeeStaffGroupOf(row) === input.staffGroup
    );
  }
  if (input.search?.trim()) {
    const term = normalizeText(input.search);
    const digits = input.search.replace(/\D/g, "");
    employees = employees.filter(
      (row) =>
        row.nameNormalized.includes(term) ||
        (row.jobTitle && normalizeText(row.jobTitle).includes(term)) ||
        (row.code && row.code.includes(input.search!.trim())) ||
        (digits && row.cpfNormalized?.includes(digits))
    );
  }
  return employees
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map(toEmployeeRow);
}

export type CreateEmployeeInput = {
  code?: string;
  name: string;
  cpf?: string;
  staffGroup?: StaffGroup;
  jobTitle?: string;
  email?: string;
  phone?: string;
  hiredAt?: number;
  notes?: string;
  status?: EmployeeStatus;
  paymentMethod?: Doc<"employees">["paymentMethod"];
  pixKey?: string;
  baseSalaryCents?: number;
  receivesFoodBasket?: boolean;
  dailyTransitCents?: number;
  defaultTransportFoodDays?: number;
};

export async function createEmployee(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: CreateEmployeeInput
): Promise<Id<"employees">> {
  const name = input.name.trim();
  if (!name) throw ruleViolation("Informe o nome do funcionário");

  const code = normalizeCode(input.code);
  const cpf = input.cpf ? optionalTaxIdDigits(input.cpf) : undefined;
  if (cpf) validateTaxIdForPersonType(cpf, "pf");
  await assertUniqueEmployeeIdentity(ctx, { name, code, cpf });

  const staffGroup = input.staffGroup ?? DEFAULT_STAFF_GROUP;
  const defaults = STAFF_GROUP_PAYROLL_DEFAULTS[staffGroup];
  const now = Date.now();
  const employeeId = await ctx.db.insert("employees", {
    code,
    name,
    nameNormalized: normalizeText(name),
    cpf,
    cpfNormalized: cpf ? normalizeTaxId(cpf) : undefined,
    staffGroup,
    jobTitle: input.jobTitle?.trim() || undefined,
    email: input.email?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    hiredAt: input.hiredAt,
    notes: input.notes?.trim() || undefined,
    status: input.status ?? "active",
    paymentMethod: input.paymentMethod ?? "pix",
    pixKey: input.pixKey?.trim() || undefined,
    baseSalaryCents: assertNonNegativeCents(
      input.baseSalaryCents ?? 0,
      "Salário base"
    ),
    receivesFoodBasket:
      input.receivesFoodBasket ?? defaults.receivesFoodBasket,
    dailyTransitCents: assertNonNegativeCents(
      input.dailyTransitCents ?? defaults.dailyTransitCents,
      "Passagem diária"
    ),
    defaultTransportFoodDays: Math.max(
      0,
      Math.round(
        input.defaultTransportFoodDays ?? defaults.defaultTransportFoodDays
      )
    ),
    createdAt: now,
    updatedAt: now,
    createdByUserId: user._id,
    updatedByUserId: user._id,
  });

  await logAudit(ctx, user, {
    action: "create",
    tableName: "employees",
    recordId: employeeId,
    entityLabel: name,
    snapshotAfter: { name, code, cpf, staffGroup },
  });

  return employeeId;
}

export type UpdateEmployeeInput = {
  employeeId: Id<"employees">;
  code?: string | null;
  name?: string;
  cpf?: string | null;
  staffGroup?: StaffGroup;
  jobTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  hiredAt?: number | null;
  notes?: string | null;
  status?: EmployeeStatus;
  paymentMethod?: Doc<"employees">["paymentMethod"];
  pixKey?: string | null;
  baseSalaryCents?: number;
  receivesFoodBasket?: boolean;
  dailyTransitCents?: number;
  defaultTransportFoodDays?: number;
};

export async function updateEmployee(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: UpdateEmployeeInput
): Promise<void> {
  const employee = await ctx.db.get("employees", input.employeeId);
  if (!employee) throw notFound("Funcionário não encontrado");
  if (employee.archivedAt) {
    throw ruleViolation("Funcionário arquivado — restaure antes de editar");
  }

  const before = employeeSnapshot(employee);
  const updates: Partial<Doc<"employees">> = {
    updatedAt: Date.now(),
    updatedByUserId: user._id,
  };

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw ruleViolation("Informe o nome do funcionário");
    updates.name = name;
    updates.nameNormalized = normalizeText(name);
  }
  if (input.code !== undefined) {
    updates.code = normalizeCode(input.code);
  }
  if (input.cpf !== undefined) {
    const cpf =
      input.cpf === null || input.cpf.trim() === ""
        ? undefined
        : optionalTaxIdDigits(input.cpf);
    if (cpf) validateTaxIdForPersonType(cpf, "pf");
    updates.cpf = cpf;
    updates.cpfNormalized = cpf ? normalizeTaxId(cpf) : undefined;
  }
  if (input.staffGroup !== undefined) updates.staffGroup = input.staffGroup;
  if (input.jobTitle !== undefined) {
    updates.jobTitle = input.jobTitle?.trim() || undefined;
  }
  if (input.email !== undefined) {
    updates.email = input.email?.trim() || undefined;
  }
  if (input.phone !== undefined) {
    updates.phone = input.phone?.trim() || undefined;
  }
  if (input.hiredAt !== undefined) {
    updates.hiredAt = input.hiredAt ?? undefined;
  }
  if (input.notes !== undefined) {
    updates.notes = input.notes?.trim() || undefined;
  }
  if (input.status !== undefined) updates.status = input.status;
  if (input.paymentMethod !== undefined) {
    updates.paymentMethod = input.paymentMethod;
  }
  if (input.pixKey !== undefined) {
    updates.pixKey = input.pixKey?.trim() || undefined;
  }
  if (input.baseSalaryCents !== undefined) {
    updates.baseSalaryCents = assertNonNegativeCents(
      input.baseSalaryCents,
      "Salário base"
    );
  }
  if (input.receivesFoodBasket !== undefined) {
    updates.receivesFoodBasket = input.receivesFoodBasket;
  }
  if (input.dailyTransitCents !== undefined) {
    updates.dailyTransitCents = assertNonNegativeCents(
      input.dailyTransitCents,
      "Passagem diária"
    );
  }
  if (input.defaultTransportFoodDays !== undefined) {
    updates.defaultTransportFoodDays = Math.max(
      0,
      Math.round(input.defaultTransportFoodDays)
    );
  }

  const nextName = updates.name ?? employee.name;
  const nextCode = input.code === undefined ? employee.code : updates.code;
  const nextCpf = input.cpf === undefined ? employee.cpf : updates.cpf;
  await assertUniqueEmployeeIdentity(ctx, {
    name: nextName,
    code: nextCode,
    cpf: nextCpf,
    excludeId: input.employeeId,
  });

  await ctx.db.patch("employees", input.employeeId, updates);
  const after = await ctx.db.get("employees", input.employeeId);
  await logAudit(ctx, user, {
    action: "update",
    tableName: "employees",
    recordId: input.employeeId,
    entityLabel: nextName,
    changes: diffFields(before, employeeSnapshot(after!), [
      "code",
      "name",
      "cpf",
      "staffGroup",
      "jobTitle",
      "email",
      "phone",
      "hiredAt",
      "notes",
      "status",
      "paymentMethod",
      "pixKey",
      "baseSalaryCents",
      "receivesFoodBasket",
      "dailyTransitCents",
      "defaultTransportFoodDays",
    ]),
    snapshotBefore: before,
    snapshotAfter: after ? employeeSnapshot(after) : undefined,
  });
}

/** Arquiva (desliga) o funcionário; idempotente se já arquivado. */
export async function archiveEmployee(
  ctx: MutationCtx,
  user: Doc<"users">,
  employeeId: Id<"employees">
): Promise<void> {
  const employee = await ctx.db.get("employees", employeeId);
  if (!employee) throw notFound("Funcionário não encontrado");
  if (employee.archivedAt) return;

  const now = Date.now();
  const before = employeeSnapshot(employee);
  await ctx.db.patch("employees", employeeId, {
    status: "terminated",
    archivedAt: now,
    archivedByUserId: user._id,
    updatedAt: now,
    updatedByUserId: user._id,
  });
  await logAudit(ctx, user, {
    action: "archive",
    tableName: "employees",
    recordId: employeeId,
    entityLabel: employee.name,
    snapshotBefore: before,
    snapshotAfter: { ...before, status: "terminated", archivedAt: now },
  });
}

/** Restaura um funcionário arquivado; idempotente se já ativo. */
export async function restoreEmployee(
  ctx: MutationCtx,
  user: Doc<"users">,
  employeeId: Id<"employees">
): Promise<void> {
  const employee = await ctx.db.get("employees", employeeId);
  if (!employee) throw notFound("Funcionário não encontrado");
  if (!employee.archivedAt) return;

  const now = Date.now();
  const before = employeeSnapshot(employee);
  await ctx.db.patch("employees", employeeId, {
    status: "active",
    archivedAt: undefined,
    archivedByUserId: undefined,
    updatedAt: now,
    updatedByUserId: user._id,
  });
  await logAudit(ctx, user, {
    action: "restore",
    tableName: "employees",
    recordId: employeeId,
    entityLabel: employee.name,
    snapshotBefore: before,
    snapshotAfter: { ...before, status: "active", archivedAt: undefined },
  });
}
