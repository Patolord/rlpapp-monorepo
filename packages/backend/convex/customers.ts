import { v } from "convex/values";
import { engineeringMutation, engineeringQuery } from "./lib/rbac";
import { logAudit, diffFields } from "./lib/audit";
import {
  formatTaxId,
  normalizeCustomerName,
  normalizeTaxId,
  validateTaxIdForPersonType,
} from "./lib/customers/helpers";
import {
  bulkImportResultValidator,
  emptyBulkImportResult,
  requireTrimmedName,
} from "./lib/compras/bulkImport";
import type { BulkImportResult } from "./lib/compras/bulkImport";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export const customerValidator = v.object({
  _id: v.id("customers"),
  _creationTime: v.number(),
  name: v.string(),
  personType: v.union(v.literal("pf"), v.literal("pj"), v.null()),
  legalName: v.union(v.string(), v.null()),
  taxId: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  phone: v.union(v.string(), v.null()),
  address: v.union(v.string(), v.null()),
  notes: v.union(v.string(), v.null()),
  active: v.boolean(),
  archivedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
});

export const contactValidator = v.object({
  _id: v.id("customerContacts"),
  customerId: v.id("customers"),
  name: v.string(),
  email: v.union(v.string(), v.null()),
  phone: v.union(v.string(), v.null()),
  role: v.union(v.string(), v.null()),
  active: v.boolean(),
  archivedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
});

function toCustomerRow(c: Doc<"customers">) {
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

function contactSnapshot(c: Doc<"customerContacts">) {
  return {
    customerId: c.customerId,
    name: c.name,
    email: c.email,
    phone: c.phone,
    role: c.role,
    active: c.active ?? true,
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

export const list = engineeringQuery({
  args: {
    search: v.optional(v.string()),
    activeOnly: v.optional(v.boolean()),
    includeArchived: v.optional(v.boolean()),
  },
  returns: v.array(customerValidator),
  handler: async (ctx, args) => {
    let customers = await ctx.db.query("customers").order("desc").collect();
    if (!args.includeArchived) {
      customers = customers.filter((c) => !c.archivedAt);
    }
    if (args.activeOnly) {
      customers = customers.filter((c) => c.active);
    }
    if (args.search?.trim()) {
      const term = normalizeCustomerName(args.search);
      customers = customers.filter(
        (c) =>
          c.nameNormalized.includes(term) ||
          (c.legalName && normalizeCustomerName(c.legalName).includes(term)) ||
          (c.taxIdNormalized && c.taxIdNormalized.includes(term.replace(/\D/g, "")))
      );
    }
    return customers.map(toCustomerRow);
  },
});

export const get = engineeringQuery({
  args: {
    customerId: v.id("customers"),
    includeInactiveContacts: v.optional(v.boolean()),
  },
  returns: v.union(
    v.object({
      customer: customerValidator,
      contacts: v.array(contactValidator),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const customer = await ctx.db.get("customers", args.customerId);
    if (!customer) return null;
    const contacts = await ctx.db
      .query("customerContacts")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect();
    const visibleContacts = args.includeInactiveContacts
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
  },
});

export const create = engineeringMutation({
  args: {
    name: v.string(),
    personType: v.optional(v.union(v.literal("pf"), v.literal("pj"))),
    legalName: v.optional(v.string()),
    taxId: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.id("customers"),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("Informe o nome do cliente");

    const taxId = args.taxId ? formatTaxId(args.taxId) : undefined;
    validateTaxIdForPersonType(taxId, args.personType);
    await assertUniqueCustomerIdentity(ctx, { name, taxId });

    const now = Date.now();
    const customerId = await ctx.db.insert("customers", {
      name,
      nameNormalized: normalizeCustomerName(name),
      personType: args.personType,
      legalName: args.legalName?.trim() || undefined,
      taxId,
      taxIdNormalized: taxId ? normalizeTaxId(taxId) : undefined,
      email: args.email?.trim() || undefined,
      phone: args.phone?.trim() || undefined,
      address: args.address?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      active: true,
      createdAt: now,
      updatedAt: now,
      createdByUserId: ctx.user._id,
      updatedByUserId: ctx.user._id,
    });

    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "customers",
      recordId: customerId,
      entityLabel: name,
      snapshotAfter: { name, personType: args.personType, taxId },
    });

    return customerId;
  },
});

const bulkCustomerContactValidator = v.object({
  name: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  role: v.optional(v.string()),
});

const bulkCustomerItemValidator = v.object({
  name: v.string(),
  personType: v.optional(v.union(v.literal("pf"), v.literal("pj"))),
  legalName: v.optional(v.string()),
  taxId: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  address: v.optional(v.string()),
  notes: v.optional(v.string()),
  contact: v.optional(bulkCustomerContactValidator),
});

type BulkCustomerItem = {
  name: string;
  personType?: "pf" | "pj";
  legalName?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  contact?: {
    name: string;
    email?: string;
    phone?: string;
    role?: string;
  };
};

async function bulkCreateCustomers(
  ctx: MutationCtx,
  user: Doc<"users">,
  items: BulkCustomerItem[]
): Promise<BulkImportResult> {
  const result = emptyBulkImportResult();
  const now = Date.now();
  const importedNames = new Set<string>();
  const importedTaxIds = new Set<string>();
  let firstCreatedId: Id<"customers"> | null = null;

  for (let i = 0; i < items.length; i++) {
    const row = i + 1;
    const item = items[i]!;
    const nameCheck = requireTrimmedName(item.name, row, "Nome");
    if (!nameCheck.ok) {
      result.errors.push(nameCheck.error);
      continue;
    }

    const nameNormalized = normalizeCustomerName(nameCheck.name);
    const taxId = item.taxId ? formatTaxId(item.taxId) : undefined;
    try {
      validateTaxIdForPersonType(taxId, item.personType);
    } catch (error) {
      result.errors.push({
        row,
        message: error instanceof Error ? error.message : "CPF/CNPJ inválido",
      });
      continue;
    }
    const taxIdNormalized = taxId ? normalizeTaxId(taxId) : undefined;
    const existingByName = importedNames.has(nameNormalized)
      ? true
      : Boolean(
          await ctx.db
            .query("customers")
            .withIndex("by_name_normalized", (q) =>
              q.eq("nameNormalized", nameNormalized)
            )
            .first()
        );
    const existingByTaxId =
      taxIdNormalized &&
      (importedTaxIds.has(taxIdNormalized) ||
        Boolean(
          await ctx.db
            .query("customers")
            .withIndex("by_tax_id_normalized", (q) =>
              q.eq("taxIdNormalized", taxIdNormalized)
            )
            .first()
        ));

    if (existingByName || existingByTaxId) {
      result.skipped++;
      continue;
    }

    const customerId = await ctx.db.insert("customers", {
      name: nameCheck.name,
      nameNormalized,
      personType: item.personType,
      legalName: item.legalName?.trim() || undefined,
      taxId,
      taxIdNormalized,
      email: item.email?.trim() || undefined,
      phone: item.phone?.trim() || undefined,
      address: item.address?.trim() || undefined,
      notes: item.notes?.trim() || undefined,
      active: true,
      createdAt: now,
      updatedAt: now,
      createdByUserId: user._id,
      updatedByUserId: user._id,
    });

    if (item.contact?.name.trim()) {
      await ctx.db.insert("customerContacts", {
        customerId,
        name: item.contact.name.trim(),
        email: item.contact.email?.trim() || undefined,
        phone: item.contact.phone?.trim() || undefined,
        role: item.contact.role?.trim() || undefined,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    importedNames.add(nameNormalized);
    if (taxIdNormalized) importedTaxIds.add(taxIdNormalized);
    firstCreatedId ??= customerId;
    result.created++;
  }

  if (firstCreatedId) {
    await logAudit(ctx, user, {
      action: "create",
      tableName: "customers",
      recordId: firstCreatedId,
      details: `Importação CSV: ${result.created} criados, ${result.skipped} ignorados`,
    });
  }

  return result;
}

export const bulkCreate = engineeringMutation({
  args: {
    items: v.array(bulkCustomerItemValidator),
  },
  returns: bulkImportResultValidator,
  handler: async (ctx, args) => {
    if (args.items.length > 200) {
      throw new Error("Máximo de 200 clientes por importação");
    }
    return await bulkCreateCustomers(ctx, ctx.user, args.items);
  },
});

export const update = engineeringMutation({
  args: {
    customerId: v.id("customers"),
    name: v.optional(v.string()),
    personType: v.optional(
      v.union(v.literal("pf"), v.literal("pj"), v.null())
    ),
    legalName: v.optional(v.string()),
    taxId: v.optional(v.union(v.string(), v.null())),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const customer = await ctx.db.get("customers", args.customerId);
    if (!customer) throw new Error("Cliente não encontrado");
    if (customer.archivedAt) {
      throw new Error("Cliente arquivado — restaure antes de editar");
    }

    const before = customerSnapshot(customer);
    const updates: Partial<Doc<"customers">> = {
      updatedAt: Date.now(),
      updatedByUserId: ctx.user._id,
    };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Informe o nome do cliente");
      updates.name = name;
      updates.nameNormalized = normalizeCustomerName(name);
    }
    if (args.personType !== undefined) {
      updates.personType =
        args.personType === null ? undefined : args.personType;
    }
    if (args.legalName !== undefined) {
      updates.legalName = args.legalName.trim() || undefined;
    }
    if (args.taxId !== undefined) {
      const taxId =
        args.taxId === null ? undefined : formatTaxId(args.taxId);
      updates.taxId = taxId;
      updates.taxIdNormalized = taxId ? normalizeTaxId(taxId) : undefined;
    }
    if (args.email !== undefined) updates.email = args.email.trim() || undefined;
    if (args.phone !== undefined) updates.phone = args.phone.trim() || undefined;
    if (args.address !== undefined) {
      updates.address = args.address.trim() || undefined;
    }
    if (args.notes !== undefined) updates.notes = args.notes.trim() || undefined;
    if (args.active !== undefined) updates.active = args.active;

    const nextName = updates.name ?? customer.name;
    const nextTaxId =
      args.taxId === undefined ? customer.taxId : updates.taxId;
    const nextPersonType =
      args.personType === undefined ? customer.personType : updates.personType;
    validateTaxIdForPersonType(nextTaxId, nextPersonType);
    await assertUniqueCustomerIdentity(ctx, {
      name: nextName,
      taxId: nextTaxId,
      excludeId: args.customerId,
    });

    await ctx.db.patch("customers", args.customerId, updates);

    const afterDoc = await ctx.db.get("customers", args.customerId);
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "customers",
      recordId: args.customerId,
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

    return null;
  },
});

export const archive = engineeringMutation({
  args: { customerId: v.id("customers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const customer = await ctx.db.get("customers", args.customerId);
    if (!customer) throw new Error("Cliente não encontrado");
    if (customer.archivedAt) return null;

    const now = Date.now();
    const before = customerSnapshot(customer);
    await ctx.db.patch("customers", args.customerId, {
      active: false,
      archivedAt: now,
      archivedByUserId: ctx.user._id,
      updatedAt: now,
      updatedByUserId: ctx.user._id,
    });

    await logAudit(ctx, ctx.user, {
      action: "archive",
      tableName: "customers",
      recordId: args.customerId,
      entityLabel: customer.name,
      snapshotBefore: before,
      snapshotAfter: { ...before, active: false, archivedAt: now },
    });

    return null;
  },
});

export const restore = engineeringMutation({
  args: { customerId: v.id("customers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const customer = await ctx.db.get("customers", args.customerId);
    if (!customer) throw new Error("Cliente não encontrado");
    if (!customer.archivedAt) return null;

    const now = Date.now();
    const before = customerSnapshot(customer);
    await ctx.db.patch("customers", args.customerId, {
      active: true,
      archivedAt: undefined,
      archivedByUserId: undefined,
      updatedAt: now,
      updatedByUserId: ctx.user._id,
    });

    await logAudit(ctx, ctx.user, {
      action: "restore",
      tableName: "customers",
      recordId: args.customerId,
      entityLabel: customer.name,
      snapshotBefore: before,
      snapshotAfter: { ...before, active: true, archivedAt: undefined },
    });

    return null;
  },
});

export const addContact = engineeringMutation({
  args: {
    customerId: v.id("customers"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    role: v.optional(v.string()),
  },
  returns: v.id("customerContacts"),
  handler: async (ctx, args) => {
    const customer = await ctx.db.get("customers", args.customerId);
    if (!customer) throw new Error("Cliente não encontrado");
    if (customer.archivedAt) {
      throw new Error("Cliente arquivado — restaure antes de adicionar contatos");
    }
    const name = args.name.trim();
    if (!name) throw new Error("Informe o nome do contato");

    const now = Date.now();
    const contactId = await ctx.db.insert("customerContacts", {
      customerId: args.customerId,
      name,
      email: args.email?.trim() || undefined,
      phone: args.phone?.trim() || undefined,
      role: args.role?.trim() || undefined,
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "customerContacts",
      recordId: contactId,
      entityLabel: `${name} (${customer.name})`,
      snapshotAfter: {
        customerId: args.customerId,
        name,
        email: args.email?.trim() || undefined,
        phone: args.phone?.trim() || undefined,
        role: args.role?.trim() || undefined,
        active: true,
      },
    });

    return contactId;
  },
});

export const updateContact = engineeringMutation({
  args: {
    contactId: v.id("customerContacts"),
    name: v.optional(v.string()),
    email: v.optional(v.union(v.string(), v.null())),
    phone: v.optional(v.union(v.string(), v.null())),
    role: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const contact = await ctx.db.get("customerContacts", args.contactId);
    if (!contact) throw new Error("Contato não encontrado");
    if (contact.active === false) {
      throw new Error("Contato inativo — restaure antes de editar");
    }
    const customer = await ctx.db.get("customers", contact.customerId);
    if (!customer) throw new Error("Cliente não encontrado");
    if (customer.archivedAt) {
      throw new Error("Cliente arquivado — restaure antes de editar contatos");
    }

    const before = contactSnapshot(contact);
    const updates: Partial<Doc<"customerContacts">> = {
      updatedAt: Date.now(),
    };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Informe o nome do contato");
      updates.name = name;
    }
    if (args.email !== undefined) {
      updates.email = args.email === null ? undefined : args.email.trim() || undefined;
    }
    if (args.phone !== undefined) {
      updates.phone = args.phone === null ? undefined : args.phone.trim() || undefined;
    }
    if (args.role !== undefined) {
      updates.role = args.role === null ? undefined : args.role.trim() || undefined;
    }

    await ctx.db.patch("customerContacts", args.contactId, updates);
    const after = await ctx.db.get("customerContacts", args.contactId);
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "customerContacts",
      recordId: args.contactId,
      entityLabel: after?.name ?? contact.name,
      changes: diffFields(before, contactSnapshot(after!), [
        "name",
        "email",
        "phone",
        "role",
      ]),
      snapshotBefore: before,
      snapshotAfter: after ? contactSnapshot(after) : undefined,
    });
    return null;
  },
});

export const removeContact = engineeringMutation({
  args: { contactId: v.id("customerContacts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const contact = await ctx.db.get("customerContacts", args.contactId);
    if (!contact) throw new Error("Contato não encontrado");
    if (contact.active === false) return null;

    const before = contactSnapshot(contact);
    const now = Date.now();
    await ctx.db.patch("customerContacts", args.contactId, {
      active: false,
      archivedAt: now,
      updatedAt: now,
    });
    await logAudit(ctx, ctx.user, {
      action: "archive",
      tableName: "customerContacts",
      recordId: args.contactId,
      entityLabel: contact.name,
      snapshotBefore: before,
      snapshotAfter: { ...before, active: false, archivedAt: now },
    });

    return null;
  },
});

export const restoreContact = engineeringMutation({
  args: { contactId: v.id("customerContacts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const contact = await ctx.db.get("customerContacts", args.contactId);
    if (!contact) throw new Error("Contato não encontrado");
    if (contact.active !== false) return null;
    const customer = await ctx.db.get("customers", contact.customerId);
    if (!customer) throw new Error("Cliente não encontrado");
    if (customer.archivedAt) {
      throw new Error("Cliente arquivado — restaure antes de reativar contatos");
    }

    const before = contactSnapshot(contact);
    const now = Date.now();
    await ctx.db.patch("customerContacts", args.contactId, {
      active: true,
      archivedAt: undefined,
      updatedAt: now,
    });
    await logAudit(ctx, ctx.user, {
      action: "restore",
      tableName: "customerContacts",
      recordId: args.contactId,
      entityLabel: contact.name,
      snapshotBefore: before,
      snapshotAfter: { ...before, active: true, archivedAt: undefined },
    });
    return null;
  },
});

/** Busca ou cria cliente por nome normalizado (usado na migração). */
export async function findOrCreateCustomerByName(
  ctx: MutationCtx,
  params: {
    name: string;
    createdByUserId?: Id<"users">;
  }
): Promise<{ customerId: Id<"customers">; created: boolean }> {
  const name = params.name.trim();
  const nameNormalized = normalizeCustomerName(name);
  const existing = await ctx.db
    .query("customers")
    .withIndex("by_name_normalized", (q) =>
      q.eq("nameNormalized", nameNormalized)
    )
    .first();
  if (existing) return { customerId: existing._id, created: false };

  const now = Date.now();
  const customerId = await ctx.db.insert("customers", {
    name,
    nameNormalized,
    active: true,
    createdAt: now,
    updatedAt: now,
    createdByUserId: params.createdByUserId,
    updatedByUserId: params.createdByUserId,
  });
  return { customerId, created: true };
}
