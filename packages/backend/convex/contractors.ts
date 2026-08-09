import { v } from "convex/values";
import { engineeringMutation, engineeringQuery } from "./lib/rbac";
import { logAudit, diffFields } from "./lib/audit";
import {
  formatTaxId,
  normalizeCustomerName,
  normalizeTaxId,
  validateTaxIdForPersonType,
} from "./lib/customers/helpers";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export const contractorValidator = v.object({
  _id: v.id("contractors"),
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

export const contractorContactValidator = v.object({
  _id: v.id("contractorContacts"),
  contractorId: v.id("contractors"),
  name: v.string(),
  email: v.union(v.string(), v.null()),
  phone: v.union(v.string(), v.null()),
  role: v.union(v.string(), v.null()),
  active: v.boolean(),
  archivedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
});

function toContractorRow(c: Doc<"contractors">) {
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

function contractorSnapshot(c: Doc<"contractors">) {
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

function contactSnapshot(c: Doc<"contractorContacts">) {
  return {
    contractorId: c.contractorId,
    name: c.name,
    email: c.email,
    phone: c.phone,
    role: c.role,
    active: c.active ?? true,
    archivedAt: c.archivedAt,
  };
}

async function assertUniqueContractorIdentity(
  ctx: MutationCtx,
  params: {
    name: string;
    taxId?: string;
    excludeId?: Id<"contractors">;
  }
) {
  const nameNormalized = normalizeCustomerName(params.name);
  const existingByName = await ctx.db
    .query("contractors")
    .withIndex("by_name_normalized", (q) =>
      q.eq("nameNormalized", nameNormalized)
    )
    .collect();
  const nameConflict = existingByName.find((c) => c._id !== params.excludeId);
  if (nameConflict) {
    throw new Error("Já existe um empreiteiro com este nome");
  }

  if (params.taxId) {
    const taxIdNormalized = normalizeTaxId(params.taxId);
    if (taxIdNormalized) {
      const existingByTax = await ctx.db
        .query("contractors")
        .withIndex("by_tax_id_normalized", (q) =>
          q.eq("taxIdNormalized", taxIdNormalized)
        )
        .collect();
      const taxConflict = existingByTax.find(
        (c) => c._id !== params.excludeId
      );
      if (taxConflict) {
        throw new Error("Já existe um empreiteiro com este CNPJ/CPF");
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
  returns: v.array(contractorValidator),
  handler: async (ctx, args) => {
    let contractors = await ctx.db.query("contractors").order("desc").collect();
    if (!args.includeArchived) {
      contractors = contractors.filter((c) => !c.archivedAt);
    }
    if (args.activeOnly) {
      contractors = contractors.filter((c) => c.active);
    }
    if (args.search?.trim()) {
      const term = normalizeCustomerName(args.search);
      contractors = contractors.filter(
        (c) =>
          c.nameNormalized.includes(term) ||
          (c.legalName && normalizeCustomerName(c.legalName).includes(term)) ||
          (c.taxIdNormalized &&
            c.taxIdNormalized.includes(term.replace(/\D/g, "")))
      );
    }
    return contractors.map(toContractorRow);
  },
});

export const get = engineeringQuery({
  args: {
    contractorId: v.id("contractors"),
    includeInactiveContacts: v.optional(v.boolean()),
  },
  returns: v.union(
    v.object({
      contractor: contractorValidator,
      contacts: v.array(contractorContactValidator),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const contractor = await ctx.db.get("contractors", args.contractorId);
    if (!contractor) return null;
    const contacts = await ctx.db
      .query("contractorContacts")
      .withIndex("by_contractor", (q) =>
        q.eq("contractorId", args.contractorId)
      )
      .collect();
    const visibleContacts = args.includeInactiveContacts
      ? contacts
      : contacts.filter((contact) => contact.active !== false);
    return {
      contractor: toContractorRow(contractor),
      contacts: visibleContacts.map((c) => ({
        _id: c._id,
        contractorId: c.contractorId,
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
  returns: v.id("contractors"),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("Informe o nome do empreiteiro");

    const taxId = args.taxId ? formatTaxId(args.taxId) : undefined;
    validateTaxIdForPersonType(taxId, args.personType);
    await assertUniqueContractorIdentity(ctx, { name, taxId });

    const now = Date.now();
    const contractorId = await ctx.db.insert("contractors", {
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
      tableName: "contractors",
      recordId: contractorId,
      entityLabel: name,
      snapshotAfter: { name, personType: args.personType, taxId },
    });

    return contractorId;
  },
});

export const update = engineeringMutation({
  args: {
    contractorId: v.id("contractors"),
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
    const contractor = await ctx.db.get("contractors", args.contractorId);
    if (!contractor) throw new Error("Empreiteiro não encontrado");
    if (contractor.archivedAt) {
      throw new Error("Empreiteiro arquivado — restaure antes de editar");
    }

    const before = contractorSnapshot(contractor);
    const updates: Partial<Doc<"contractors">> = {
      updatedAt: Date.now(),
      updatedByUserId: ctx.user._id,
    };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Informe o nome do empreiteiro");
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

    const nextName = updates.name ?? contractor.name;
    const nextTaxId =
      args.taxId === undefined ? contractor.taxId : updates.taxId;
    const nextPersonType =
      args.personType === undefined
        ? contractor.personType
        : updates.personType;
    validateTaxIdForPersonType(nextTaxId, nextPersonType);
    await assertUniqueContractorIdentity(ctx, {
      name: nextName,
      taxId: nextTaxId,
      excludeId: args.contractorId,
    });

    await ctx.db.patch("contractors", args.contractorId, updates);

    const afterDoc = await ctx.db.get("contractors", args.contractorId);
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "contractors",
      recordId: args.contractorId,
      entityLabel: nextName,
      changes: diffFields(before, contractorSnapshot(afterDoc!), [
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
      snapshotAfter: afterDoc ? contractorSnapshot(afterDoc) : undefined,
    });

    return null;
  },
});

export const archive = engineeringMutation({
  args: { contractorId: v.id("contractors") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const contractor = await ctx.db.get("contractors", args.contractorId);
    if (!contractor) throw new Error("Empreiteiro não encontrado");
    if (contractor.archivedAt) return null;

    const now = Date.now();
    const before = contractorSnapshot(contractor);
    await ctx.db.patch("contractors", args.contractorId, {
      active: false,
      archivedAt: now,
      archivedByUserId: ctx.user._id,
      updatedAt: now,
      updatedByUserId: ctx.user._id,
    });

    await logAudit(ctx, ctx.user, {
      action: "archive",
      tableName: "contractors",
      recordId: args.contractorId,
      entityLabel: contractor.name,
      snapshotBefore: before,
      snapshotAfter: { ...before, active: false, archivedAt: now },
    });

    return null;
  },
});

export const restore = engineeringMutation({
  args: { contractorId: v.id("contractors") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const contractor = await ctx.db.get("contractors", args.contractorId);
    if (!contractor) throw new Error("Empreiteiro não encontrado");
    if (!contractor.archivedAt) return null;

    const now = Date.now();
    const before = contractorSnapshot(contractor);
    await ctx.db.patch("contractors", args.contractorId, {
      active: true,
      archivedAt: undefined,
      archivedByUserId: undefined,
      updatedAt: now,
      updatedByUserId: ctx.user._id,
    });

    await logAudit(ctx, ctx.user, {
      action: "restore",
      tableName: "contractors",
      recordId: args.contractorId,
      entityLabel: contractor.name,
      snapshotBefore: before,
      snapshotAfter: { ...before, active: true, archivedAt: undefined },
    });

    return null;
  },
});

export const addContact = engineeringMutation({
  args: {
    contractorId: v.id("contractors"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    role: v.optional(v.string()),
  },
  returns: v.id("contractorContacts"),
  handler: async (ctx, args) => {
    const contractor = await ctx.db.get("contractors", args.contractorId);
    if (!contractor) throw new Error("Empreiteiro não encontrado");
    if (contractor.archivedAt) {
      throw new Error("Empreiteiro arquivado — restaure antes de editar");
    }
    const name = args.name.trim();
    if (!name) throw new Error("Informe o nome do contato");

    const now = Date.now();
    const contactId = await ctx.db.insert("contractorContacts", {
      contractorId: args.contractorId,
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
      tableName: "contractorContacts",
      recordId: contactId,
      entityLabel: name,
      details: `Contato adicionado ao empreiteiro ${contractor.name}`,
    });

    return contactId;
  },
});

export const updateContact = engineeringMutation({
  args: {
    contactId: v.id("contractorContacts"),
    name: v.optional(v.string()),
    email: v.optional(v.union(v.string(), v.null())),
    phone: v.optional(v.union(v.string(), v.null())),
    role: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const contact = await ctx.db.get("contractorContacts", args.contactId);
    if (!contact) throw new Error("Contato não encontrado");
    if (contact.active === false) {
      throw new Error("Contato arquivado — restaure antes de editar");
    }

    const before = contactSnapshot(contact);
    const patch: Partial<Doc<"contractorContacts">> = {
      updatedAt: Date.now(),
    };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Informe o nome do contato");
      patch.name = name;
    }
    if (args.email !== undefined) {
      patch.email =
        args.email === null ? undefined : args.email.trim() || undefined;
    }
    if (args.phone !== undefined) {
      patch.phone =
        args.phone === null ? undefined : args.phone.trim() || undefined;
    }
    if (args.role !== undefined) {
      patch.role =
        args.role === null ? undefined : args.role.trim() || undefined;
    }

    await ctx.db.patch("contractorContacts", args.contactId, patch);

    const after = await ctx.db.get("contractorContacts", args.contactId);
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "contractorContacts",
      recordId: args.contactId,
      entityLabel: patch.name ?? contact.name,
      changes: diffFields(before, contactSnapshot(after!), [
        "name",
        "email",
        "phone",
        "role",
        "active",
        "archivedAt",
      ]),
      snapshotBefore: before,
      snapshotAfter: after ? contactSnapshot(after) : undefined,
    });

    return null;
  },
});

export const removeContact = engineeringMutation({
  args: { contactId: v.id("contractorContacts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const contact = await ctx.db.get("contractorContacts", args.contactId);
    if (!contact) throw new Error("Contato não encontrado");
    if (contact.active === false) return null;

    const now = Date.now();
    const before = contactSnapshot(contact);
    await ctx.db.patch("contractorContacts", args.contactId, {
      active: false,
      archivedAt: now,
      updatedAt: now,
    });

    await logAudit(ctx, ctx.user, {
      action: "archive",
      tableName: "contractorContacts",
      recordId: args.contactId,
      entityLabel: contact.name,
      snapshotBefore: before,
      snapshotAfter: { ...before, active: false, archivedAt: now },
    });

    return null;
  },
});

export const restoreContact = engineeringMutation({
  args: { contactId: v.id("contractorContacts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const contact = await ctx.db.get("contractorContacts", args.contactId);
    if (!contact) throw new Error("Contato não encontrado");
    if (contact.active !== false) return null;

    const before = contactSnapshot(contact);
    await ctx.db.patch("contractorContacts", args.contactId, {
      active: true,
      archivedAt: undefined,
      updatedAt: Date.now(),
    });

    await logAudit(ctx, ctx.user, {
      action: "restore",
      tableName: "contractorContacts",
      recordId: args.contactId,
      entityLabel: contact.name,
      snapshotBefore: before,
      snapshotAfter: { ...before, active: true, archivedAt: undefined },
    });

    return null;
  },
});
