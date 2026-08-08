import { v } from "convex/values";
import { engineeringMutation, engineeringQuery } from "./lib/rbac";
import { logAudit, diffFields } from "./lib/audit";
import {
  formatTaxId,
  normalizeCustomerName,
  normalizeTaxId,
} from "./lib/customers/helpers";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export const customerValidator = v.object({
  _id: v.id("customers"),
  _creationTime: v.number(),
  name: v.string(),
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
  createdAt: v.number(),
});

function toCustomerRow(c: Doc<"customers">) {
  return {
    _id: c._id,
    _creationTime: c._creationTime,
    name: c.name,
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
  args: { customerId: v.id("customers") },
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
    return {
      customer: toCustomerRow(customer),
      contacts: contacts.map((c) => ({
        _id: c._id,
        customerId: c.customerId,
        name: c.name,
        email: c.email ?? null,
        phone: c.phone ?? null,
        role: c.role ?? null,
        createdAt: c.createdAt,
      })),
    };
  },
});

export const create = engineeringMutation({
  args: {
    name: v.string(),
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
    await assertUniqueCustomerIdentity(ctx, { name, taxId });

    const now = Date.now();
    const customerId = await ctx.db.insert("customers", {
      name,
      nameNormalized: normalizeCustomerName(name),
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
      snapshotAfter: { name, taxId },
    });

    return customerId;
  },
});

export const update = engineeringMutation({
  args: {
    customerId: v.id("customers"),
    name: v.optional(v.string()),
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
    const nextTaxId = updates.taxId ?? customer.taxId;
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
    const name = args.name.trim();
    if (!name) throw new Error("Informe o nome do contato");

    const now = Date.now();
    const contactId = await ctx.db.insert("customerContacts", {
      customerId: args.customerId,
      name,
      email: args.email?.trim() || undefined,
      phone: args.phone?.trim() || undefined,
      role: args.role?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });

    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "customerContacts",
      recordId: contactId,
      entityLabel: `${name} (${customer.name})`,
      snapshotAfter: { name, customerId: args.customerId },
    });

    return contactId;
  },
});

export const removeContact = engineeringMutation({
  args: { contactId: v.id("customerContacts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const contact = await ctx.db.get("customerContacts", args.contactId);
    if (!contact) throw new Error("Contato não encontrado");

    await logAudit(ctx, ctx.user, {
      action: "delete",
      tableName: "customerContacts",
      recordId: args.contactId,
      entityLabel: contact.name,
      snapshotBefore: {
        name: contact.name,
        customerId: contact.customerId,
      },
    });

    await ctx.db.delete("customerContacts", args.contactId);
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
