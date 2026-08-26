import { v } from "convex/values";
import { hrMutation, hrQuery } from "./lib/rbac";
import { logAudit, diffFields } from "./lib/audit";
import {
  formatTaxId,
  normalizeCustomerName,
  normalizeTaxId,
  validateTaxIdForPersonType,
} from "./lib/customers/helpers";
import {
  DEFAULT_DAILY_TRANSIT_CENTS,
  DEFAULT_TRANSPORT_FOOD_DAYS,
  assertNonNegativeCents,
} from "./lib/rh/payroll";
import {
  employeePaymentMethod,
  employeeStatus,
} from "./schema";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export const employeeValidator = v.object({
  _id: v.id("employees"),
  _creationTime: v.number(),
  code: v.union(v.string(), v.null()),
  name: v.string(),
  cpf: v.union(v.string(), v.null()),
  jobTitle: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  phone: v.union(v.string(), v.null()),
  hiredAt: v.union(v.number(), v.null()),
  notes: v.union(v.string(), v.null()),
  status: employeeStatus,
  archivedAt: v.union(v.number(), v.null()),
  paymentMethod: employeePaymentMethod,
  pixKey: v.union(v.string(), v.null()),
  baseSalaryCents: v.number(),
  receivesFoodBasket: v.boolean(),
  dailyTransitCents: v.number(),
  defaultTransportFoodDays: v.number(),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
});

export type EmployeeRow = {
  _id: Id<"employees">;
  _creationTime: number;
  code: string | null;
  name: string;
  cpf: string | null;
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

function toEmployeeRow(employee: Doc<"employees">): EmployeeRow {
  return {
    _id: employee._id,
    _creationTime: employee._creationTime,
    code: employee.code ?? null,
    name: employee.name,
    cpf: employee.cpf ?? null,
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
  const nameNormalized = normalizeCustomerName(params.name);
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
    throw new Error("Já existe um funcionário com este nome");
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
      throw new Error("Já existe um funcionário com este código");
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
      throw new Error("Já existe um funcionário com este CPF");
    }
  }
}

export const list = hrQuery({
  args: {
    search: v.optional(v.string()),
    includeArchived: v.optional(v.boolean()),
    status: v.optional(employeeStatus),
  },
  returns: v.array(employeeValidator),
  handler: async (ctx, args) => {
    let employees = args.status
      ? await ctx.db
          .query("employees")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .collect()
      : await ctx.db.query("employees").order("desc").collect();

    if (!args.includeArchived) {
      employees = employees.filter((row) => !row.archivedAt);
    }
    if (args.search?.trim()) {
      const term = normalizeCustomerName(args.search);
      const digits = args.search.replace(/\D/g, "");
      employees = employees.filter(
        (row) =>
          row.nameNormalized.includes(term) ||
          (row.jobTitle && normalizeCustomerName(row.jobTitle).includes(term)) ||
          (row.code && row.code.includes(args.search!.trim())) ||
          (digits && row.cpfNormalized?.includes(digits))
      );
    }
    return employees
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map(toEmployeeRow);
  },
});

export const get = hrQuery({
  args: { employeeId: v.id("employees") },
  returns: v.union(employeeValidator, v.null()),
  handler: async (ctx, args) => {
    const employee = await ctx.db.get("employees", args.employeeId);
    return employee ? toEmployeeRow(employee) : null;
  },
});

export const create = hrMutation({
  args: {
    code: v.optional(v.string()),
    name: v.string(),
    cpf: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    hiredAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    status: v.optional(employeeStatus),
    paymentMethod: v.optional(employeePaymentMethod),
    pixKey: v.optional(v.string()),
    baseSalaryCents: v.optional(v.number()),
    receivesFoodBasket: v.optional(v.boolean()),
    dailyTransitCents: v.optional(v.number()),
    defaultTransportFoodDays: v.optional(v.number()),
  },
  returns: v.id("employees"),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("Informe o nome do funcionário");

    const code = normalizeCode(args.code);
    const cpf = args.cpf ? formatTaxId(args.cpf) : undefined;
    if (cpf) validateTaxIdForPersonType(cpf, "pf");
    await assertUniqueEmployeeIdentity(ctx, { name, code, cpf });

    const now = Date.now();
    const employeeId = await ctx.db.insert("employees", {
      code,
      name,
      nameNormalized: normalizeCustomerName(name),
      cpf,
      cpfNormalized: cpf ? normalizeTaxId(cpf) : undefined,
      jobTitle: args.jobTitle?.trim() || undefined,
      email: args.email?.trim() || undefined,
      phone: args.phone?.trim() || undefined,
      hiredAt: args.hiredAt,
      notes: args.notes?.trim() || undefined,
      status: args.status ?? "active",
      paymentMethod: args.paymentMethod ?? "pix",
      pixKey: args.pixKey?.trim() || undefined,
      baseSalaryCents: assertNonNegativeCents(
        args.baseSalaryCents ?? 0,
        "Salário base"
      ),
      receivesFoodBasket: args.receivesFoodBasket ?? true,
      dailyTransitCents: assertNonNegativeCents(
        args.dailyTransitCents ?? DEFAULT_DAILY_TRANSIT_CENTS,
        "Passagem diária"
      ),
      defaultTransportFoodDays: Math.max(
        0,
        Math.round(args.defaultTransportFoodDays ?? DEFAULT_TRANSPORT_FOOD_DAYS)
      ),
      createdAt: now,
      updatedAt: now,
      createdByUserId: ctx.user._id,
      updatedByUserId: ctx.user._id,
    });

    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "employees",
      recordId: employeeId,
      entityLabel: name,
      snapshotAfter: { name, code, cpf },
    });

    return employeeId;
  },
});

export const update = hrMutation({
  args: {
    employeeId: v.id("employees"),
    code: v.optional(v.union(v.string(), v.null())),
    name: v.optional(v.string()),
    cpf: v.optional(v.union(v.string(), v.null())),
    jobTitle: v.optional(v.union(v.string(), v.null())),
    email: v.optional(v.union(v.string(), v.null())),
    phone: v.optional(v.union(v.string(), v.null())),
    hiredAt: v.optional(v.union(v.number(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    status: v.optional(employeeStatus),
    paymentMethod: v.optional(employeePaymentMethod),
    pixKey: v.optional(v.union(v.string(), v.null())),
    baseSalaryCents: v.optional(v.number()),
    receivesFoodBasket: v.optional(v.boolean()),
    dailyTransitCents: v.optional(v.number()),
    defaultTransportFoodDays: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const employee = await ctx.db.get("employees", args.employeeId);
    if (!employee) throw new Error("Funcionário não encontrado");
    if (employee.archivedAt) {
      throw new Error("Funcionário arquivado — restaure antes de editar");
    }

    const before = employeeSnapshot(employee);
    const updates: Partial<Doc<"employees">> = {
      updatedAt: Date.now(),
      updatedByUserId: ctx.user._id,
    };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Informe o nome do funcionário");
      updates.name = name;
      updates.nameNormalized = normalizeCustomerName(name);
    }
    if (args.code !== undefined) {
      updates.code = normalizeCode(args.code);
    }
    if (args.cpf !== undefined) {
      const cpf =
        args.cpf === null || args.cpf.trim() === ""
          ? undefined
          : formatTaxId(args.cpf);
      if (cpf) validateTaxIdForPersonType(cpf, "pf");
      updates.cpf = cpf;
      updates.cpfNormalized = cpf ? normalizeTaxId(cpf) : undefined;
    }
    if (args.jobTitle !== undefined) {
      updates.jobTitle = args.jobTitle?.trim() || undefined;
    }
    if (args.email !== undefined) {
      updates.email = args.email?.trim() || undefined;
    }
    if (args.phone !== undefined) {
      updates.phone = args.phone?.trim() || undefined;
    }
    if (args.hiredAt !== undefined) {
      updates.hiredAt = args.hiredAt ?? undefined;
    }
    if (args.notes !== undefined) {
      updates.notes = args.notes?.trim() || undefined;
    }
    if (args.status !== undefined) updates.status = args.status;
    if (args.paymentMethod !== undefined) {
      updates.paymentMethod = args.paymentMethod;
    }
    if (args.pixKey !== undefined) {
      updates.pixKey = args.pixKey?.trim() || undefined;
    }
    if (args.baseSalaryCents !== undefined) {
      updates.baseSalaryCents = assertNonNegativeCents(
        args.baseSalaryCents,
        "Salário base"
      );
    }
    if (args.receivesFoodBasket !== undefined) {
      updates.receivesFoodBasket = args.receivesFoodBasket;
    }
    if (args.dailyTransitCents !== undefined) {
      updates.dailyTransitCents = assertNonNegativeCents(
        args.dailyTransitCents,
        "Passagem diária"
      );
    }
    if (args.defaultTransportFoodDays !== undefined) {
      updates.defaultTransportFoodDays = Math.max(
        0,
        Math.round(args.defaultTransportFoodDays)
      );
    }

    const nextName = updates.name ?? employee.name;
    const nextCode = args.code === undefined ? employee.code : updates.code;
    const nextCpf = args.cpf === undefined ? employee.cpf : updates.cpf;
    await assertUniqueEmployeeIdentity(ctx, {
      name: nextName,
      code: nextCode,
      cpf: nextCpf,
      excludeId: args.employeeId,
    });

    await ctx.db.patch("employees", args.employeeId, updates);
    const after = await ctx.db.get("employees", args.employeeId);
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "employees",
      recordId: args.employeeId,
      entityLabel: nextName,
      changes: diffFields(before, employeeSnapshot(after!), [
        "code",
        "name",
        "cpf",
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
    return null;
  },
});

export const archive = hrMutation({
  args: { employeeId: v.id("employees") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const employee = await ctx.db.get("employees", args.employeeId);
    if (!employee) throw new Error("Funcionário não encontrado");
    if (employee.archivedAt) return null;

    const now = Date.now();
    const before = employeeSnapshot(employee);
    await ctx.db.patch("employees", args.employeeId, {
      status: "terminated",
      archivedAt: now,
      archivedByUserId: ctx.user._id,
      updatedAt: now,
      updatedByUserId: ctx.user._id,
    });
    await logAudit(ctx, ctx.user, {
      action: "archive",
      tableName: "employees",
      recordId: args.employeeId,
      entityLabel: employee.name,
      snapshotBefore: before,
      snapshotAfter: { ...before, status: "terminated", archivedAt: now },
    });
    return null;
  },
});

export const restore = hrMutation({
  args: { employeeId: v.id("employees") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const employee = await ctx.db.get("employees", args.employeeId);
    if (!employee) throw new Error("Funcionário não encontrado");
    if (!employee.archivedAt) return null;

    const now = Date.now();
    const before = employeeSnapshot(employee);
    await ctx.db.patch("employees", args.employeeId, {
      status: "active",
      archivedAt: undefined,
      archivedByUserId: undefined,
      updatedAt: now,
      updatedByUserId: ctx.user._id,
    });
    await logAudit(ctx, ctx.user, {
      action: "restore",
      tableName: "employees",
      recordId: args.employeeId,
      entityLabel: employee.name,
      snapshotBefore: before,
      snapshotAfter: { ...before, status: "active", archivedAt: undefined },
    });
    return null;
  },
});
