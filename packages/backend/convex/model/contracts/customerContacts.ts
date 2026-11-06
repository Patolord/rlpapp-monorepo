import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { diffFields, logAudit } from "../../lib/audit";

/** Contatos de um cliente: inclusão, edição, arquivamento e restauração. */

export type AddCustomerContactInput = {
  customerId: Id<"customers">;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
};

export type UpdateCustomerContactInput = {
  contactId: Id<"customerContacts">;
  name?: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
};

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

export async function addCustomerContact(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: AddCustomerContactInput
): Promise<Id<"customerContacts">> {
  const customer = await ctx.db.get("customers", input.customerId);
  if (!customer) throw new Error("Cliente não encontrado");
  if (customer.archivedAt) {
    throw new Error("Cliente arquivado — restaure antes de adicionar contatos");
  }
  const name = input.name.trim();
  if (!name) throw new Error("Informe o nome do contato");

  const now = Date.now();
  const contactId = await ctx.db.insert("customerContacts", {
    customerId: input.customerId,
    name,
    email: input.email?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    role: input.role?.trim() || undefined,
    active: true,
    createdAt: now,
    updatedAt: now,
  });

  await logAudit(ctx, user, {
    action: "create",
    tableName: "customerContacts",
    recordId: contactId,
    entityLabel: `${name} (${customer.name})`,
    snapshotAfter: {
      customerId: input.customerId,
      name,
      email: input.email?.trim() || undefined,
      phone: input.phone?.trim() || undefined,
      role: input.role?.trim() || undefined,
      active: true,
    },
  });

  return contactId;
}

export async function updateCustomerContact(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: UpdateCustomerContactInput
): Promise<void> {
  const contact = await ctx.db.get("customerContacts", input.contactId);
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
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Informe o nome do contato");
    updates.name = name;
  }
  if (input.email !== undefined) {
    updates.email = input.email === null ? undefined : input.email.trim() || undefined;
  }
  if (input.phone !== undefined) {
    updates.phone = input.phone === null ? undefined : input.phone.trim() || undefined;
  }
  if (input.role !== undefined) {
    updates.role = input.role === null ? undefined : input.role.trim() || undefined;
  }

  await ctx.db.patch("customerContacts", input.contactId, updates);
  const after = await ctx.db.get("customerContacts", input.contactId);
  await logAudit(ctx, user, {
    action: "update",
    tableName: "customerContacts",
    recordId: input.contactId,
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
}

export async function archiveCustomerContact(
  ctx: MutationCtx,
  user: Doc<"users">,
  contactId: Id<"customerContacts">
): Promise<void> {
  const contact = await ctx.db.get("customerContacts", contactId);
  if (!contact) throw new Error("Contato não encontrado");
  if (contact.active === false) return;

  const before = contactSnapshot(contact);
  const now = Date.now();
  await ctx.db.patch("customerContacts", contactId, {
    active: false,
    archivedAt: now,
    updatedAt: now,
  });
  await logAudit(ctx, user, {
    action: "archive",
    tableName: "customerContacts",
    recordId: contactId,
    entityLabel: contact.name,
    snapshotBefore: before,
    snapshotAfter: { ...before, active: false, archivedAt: now },
  });
}

export async function restoreCustomerContact(
  ctx: MutationCtx,
  user: Doc<"users">,
  contactId: Id<"customerContacts">
): Promise<void> {
  const contact = await ctx.db.get("customerContacts", contactId);
  if (!contact) throw new Error("Contato não encontrado");
  if (contact.active !== false) return;
  const customer = await ctx.db.get("customers", contact.customerId);
  if (!customer) throw new Error("Cliente não encontrado");
  if (customer.archivedAt) {
    throw new Error("Cliente arquivado — restaure antes de reativar contatos");
  }

  const before = contactSnapshot(contact);
  const now = Date.now();
  await ctx.db.patch("customerContacts", contactId, {
    active: true,
    archivedAt: undefined,
    updatedAt: now,
  });
  await logAudit(ctx, user, {
    action: "restore",
    tableName: "customerContacts",
    recordId: contactId,
    entityLabel: contact.name,
    snapshotBefore: before,
    snapshotAfter: { ...before, active: true, archivedAt: undefined },
  });
}
