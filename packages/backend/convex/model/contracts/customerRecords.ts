import type { Infer } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { diffFields, logAudit } from "../../lib/audit";
import {
  formatTaxId,
  normalizeCustomerName,
  normalizeTaxId,
  validateTaxIdForPersonType,
  type CustomerPersonType,
} from "./customers";
import type {
  customerContactValidator,
  customerValidator,
} from "./customerValidators";

/**
 * Cadastro de clientes (`convex/customers.ts`): listagem, detalhe com
 * contatos, criação, edição, arquivamento e restauração. Os contatos ficam em
 * `customerContacts.ts`; a importação em lote, em `customerImport.ts`.
 */

export type CustomerRow = Infer<typeof customerValidator>;
export type CustomerContactRow = Infer<typeof customerContactValidator>;

export type ListCustomersInput = {
  search?: string;
  activeOnly?: boolean;
  includeArchived?: boolean;
};

export type GetCustomerInput = {
  customerId: Id<"customers">;
  includeInactiveContacts?: boolean;
};

export type CreateCustomerInput = {
  name: string;
  personType?: CustomerPersonType;
  legalName?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
};

export type UpdateCustomerInput = {
  customerId: Id<"customers">;
  name?: string;
  personType?: CustomerPersonType | null;
  legalName?: string;
  taxId?: string | null;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  active?: boolean;
};

function toCustomerRow(c: Doc<"customers">): CustomerRow {
  return {
    _id: c._id,
    _creationTime: c._creationTime,
    name: c.name,
    personType: c.personType ?? null,
    legalName: c.legalName ?? null,
    taxId: c.taxId ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    address: c.address ?? null,
    notes: c.notes ?? null,
    active: c.active,
    archivedAt: c.archivedAt ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt ?? null,
  };
}

function customerSnapshot(c: Doc<"customers">) {
  return {
    name: c.name,
    personType: c.personType,
    legalName: c.legalName,
    taxId: c.taxId,
    email: c.email,
    phone: c.phone,
    address: c.address,
    notes: c.notes,
    active: c.active,
    archivedAt: c.archivedAt,
  };
}

async function assertUniqueCustomerIdentity(
  ctx: MutationCtx,
  params: {
    name: string;
    taxId?: string;
    excludeId?: Id<"customers">;
  }
) {
  const nameNormalized = normalizeCustomerName(params.name);
  const existingByName = await ctx.db
    .query("customers")
    .withIndex("by_name_normalized", (q) =>
      q.eq("nameNormalized", nameNormalized)
    )
    .collect();
  const nameConflict = existingByName.find((c) => c._id !== params.excludeId);
  if (nameConflict) {
    throw new Error("Já existe um cliente com este nome");
  }

  if (params.taxId) {
    const taxIdNormalized = normalizeTaxId(params.taxId);
    if (taxIdNormalized) {
      const existingByTax = await ctx.db
        .query("customers")
        .withIndex("by_tax_id_normalized", (q) =>
          q.eq("taxIdNormalized", taxIdNormalized)
        )
        .collect();
      const taxConflict = existingByTax.find(
        (c) => c._id !== params.excludeId
      );
      if (taxConflict) {
        throw new Error("Já existe um cliente com este CNPJ/CPF");
      }
    }
  }
}

export async function listCustomers(
  ctx: QueryCtx,
  input: ListCustomersInput
): Promise<CustomerRow[]> {
  let customers = await ctx.db.query("customers").order("desc").collect();
  if (!input.includeArchived) {
    customers = customers.filter((c) => !c.archivedAt);
  }
  if (input.activeOnly) {
    customers = customers.filter((c) => c.active);
  }
  if (input.search?.trim()) {
    const term = normalizeCustomerName(input.search);
    customers = customers.filter(
      (c) =>
        c.nameNormalized.includes(term) ||
        (c.legalName && normalizeCustomerName(c.legalName).includes(term)) ||
        (c.taxIdNormalized && c.taxIdNormalized.includes(term.replace(/\D/g, "")))
    );
  }
  return customers.map(toCustomerRow);
}

export async function getCustomerWithContacts(
  ctx: QueryCtx,
  input: GetCustomerInput
): Promise<{ customer: CustomerRow; contacts: CustomerContactRow[] } | null> {
  const customer = await ctx.db.get("customers", input.customerId);
  if (!customer) return null;
  const contacts = await ctx.db
    .query("customerContacts")
    .withIndex("by_customer", (q) => q.eq("customerId", input.customerId))
    .collect();
  const visibleContacts = input.includeInactiveContacts
    ? contacts
    : contacts.filter((contact) => contact.active !== false);
  return {
    customer: toCustomerRow(customer),
    contacts: visibleContacts.map((c) => ({
      _id: c._id,
      customerId: c.customerId,
      name: c.name,
      email: c.email ?? null,
      phone: c.phone ?? null,
      role: c.role ?? null,
      active: c.active ?? true,
      archivedAt: c.archivedAt ?? null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt ?? null,
    })),
  };
}

export async function createCustomer(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: CreateCustomerInput
): Promise<Id<"customers">> {
  const name = input.name.trim();
  if (!name) throw new Error("Informe o nome do cliente");

  const taxId = input.taxId ? formatTaxId(input.taxId) : undefined;
  validateTaxIdForPersonType(taxId, input.personType);
  await assertUniqueCustomerIdentity(ctx, { name, taxId });

  const now = Date.now();
  const customerId = await ctx.db.insert("customers", {
    name,
    nameNormalized: normalizeCustomerName(name),
    personType: input.personType,
    legalName: input.legalName?.trim() || undefined,
    taxId,
    taxIdNormalized: taxId ? normalizeTaxId(taxId) : undefined,
    email: input.email?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    address: input.address?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    active: true,
    createdAt: now,
    updatedAt: now,
    createdByUserId: user._id,
    updatedByUserId: user._id,
  });

  await logAudit(ctx, user, {
    action: "create",
    tableName: "customers",
    recordId: customerId,
    entityLabel: name,
    snapshotAfter: { name, personType: input.personType, taxId },
  });

  return customerId;
}

export async function updateCustomer(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: UpdateCustomerInput
): Promise<void> {
  const customer = await ctx.db.get("customers", input.customerId);
  if (!customer) throw new Error("Cliente não encontrado");
  if (customer.archivedAt) {
    throw new Error("Cliente arquivado — restaure antes de editar");
  }

  const before = customerSnapshot(customer);
  const updates: Partial<Doc<"customers">> = {
    updatedAt: Date.now(),
    updatedByUserId: user._id,
  };

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Informe o nome do cliente");
    updates.name = name;
    updates.nameNormalized = normalizeCustomerName(name);
  }
  if (input.personType !== undefined) {
    updates.personType =
      input.personType === null ? undefined : input.personType;
  }
  if (input.legalName !== undefined) {
    updates.legalName = input.legalName.trim() || undefined;
  }
  if (input.taxId !== undefined) {
    const taxId =
      input.taxId === null ? undefined : formatTaxId(input.taxId);
    updates.taxId = taxId;
    updates.taxIdNormalized = taxId ? normalizeTaxId(taxId) : undefined;
  }
  if (input.email !== undefined) updates.email = input.email.trim() || undefined;
  if (input.phone !== undefined) updates.phone = input.phone.trim() || undefined;
  if (input.address !== undefined) {
    updates.address = input.address.trim() || undefined;
  }
  if (input.notes !== undefined) updates.notes = input.notes.trim() || undefined;
  if (input.active !== undefined) updates.active = input.active;

  const nextName = updates.name ?? customer.name;
  const nextTaxId =
    input.taxId === undefined ? customer.taxId : updates.taxId;
  const nextPersonType =
    input.personType === undefined ? customer.personType : updates.personType;
  validateTaxIdForPersonType(nextTaxId, nextPersonType);
  await assertUniqueCustomerIdentity(ctx, {
    name: nextName,
    taxId: nextTaxId,
    excludeId: input.customerId,
  });

  await ctx.db.patch("customers", input.customerId, updates);

  const afterDoc = await ctx.db.get("customers", input.customerId);
  await logAudit(ctx, user, {
    action: "update",
    tableName: "customers",
    recordId: input.customerId,
    entityLabel: nextName,
    changes: diffFields(before, customerSnapshot(afterDoc!), [
      "name",
      "personType",
      "legalName",
      "taxId",
      "email",
      "phone",
      "address",
      "notes",
      "active",
      "archivedAt",
    ]),
    snapshotBefore: before,
    snapshotAfter: afterDoc ? customerSnapshot(afterDoc) : undefined,
  });
}

export async function archiveCustomer(
  ctx: MutationCtx,
  user: Doc<"users">,
  customerId: Id<"customers">
): Promise<void> {
  const customer = await ctx.db.get("customers", customerId);
  if (!customer) throw new Error("Cliente não encontrado");
  if (customer.archivedAt) return;

  const now = Date.now();
  const before = customerSnapshot(customer);
  await ctx.db.patch("customers", customerId, {
    active: false,
    archivedAt: now,
    archivedByUserId: user._id,
    updatedAt: now,
    updatedByUserId: user._id,
  });

  await logAudit(ctx, user, {
    action: "archive",
    tableName: "customers",
    recordId: customerId,
    entityLabel: customer.name,
    snapshotBefore: before,
    snapshotAfter: { ...before, active: false, archivedAt: now },
  });
}

export async function restoreCustomer(
  ctx: MutationCtx,
  user: Doc<"users">,
  customerId: Id<"customers">
): Promise<void> {
  const customer = await ctx.db.get("customers", customerId);
  if (!customer) throw new Error("Cliente não encontrado");
  if (!customer.archivedAt) return;

  const now = Date.now();
  const before = customerSnapshot(customer);
  await ctx.db.patch("customers", customerId, {
    active: true,
    archivedAt: undefined,
    archivedByUserId: undefined,
    updatedAt: now,
    updatedByUserId: user._id,
  });

  await logAudit(ctx, user, {
    action: "restore",
    tableName: "customers",
    recordId: customerId,
    entityLabel: customer.name,
    snapshotBefore: before,
    snapshotAfter: { ...before, active: true, archivedAt: undefined },
  });
}
