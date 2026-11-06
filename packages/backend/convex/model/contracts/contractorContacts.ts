import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { diffFields, logAudit } from "../../lib/audit";

/** Contatos de um empreiteiro: inclusão, edição, arquivamento e restauração. */

export type AddContractorContactInput = {
  contractorId: Id<"contractors">;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
};

export type UpdateContractorContactInput = {
  contactId: Id<"contractorContacts">;
  name?: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
};

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

export async function addContractorContact(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: AddContractorContactInput
): Promise<Id<"contractorContacts">> {
  const contractor = await ctx.db.get("contractors", input.contractorId);
  if (!contractor) throw new Error("Empreiteiro não encontrado");
  if (contractor.archivedAt) {
    throw new Error("Empreiteiro arquivado — restaure antes de editar");
  }
  const name = input.name.trim();
  if (!name) throw new Error("Informe o nome do contato");

  const now = Date.now();
  const contactId = await ctx.db.insert("contractorContacts", {
    contractorId: input.contractorId,
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
    tableName: "contractorContacts",
    recordId: contactId,
    entityLabel: name,
    details: `Contato adicionado ao empreiteiro ${contractor.name}`,
  });

  return contactId;
}

export async function updateContractorContact(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: UpdateContractorContactInput
): Promise<void> {
  const contact = await ctx.db.get("contractorContacts", input.contactId);
  if (!contact) throw new Error("Contato não encontrado");
  if (contact.active === false) {
    throw new Error("Contato arquivado — restaure antes de editar");
  }

  const before = contactSnapshot(contact);
  const patch: Partial<Doc<"contractorContacts">> = {
    updatedAt: Date.now(),
  };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Informe o nome do contato");
    patch.name = name;
  }
  if (input.email !== undefined) {
    patch.email =
      input.email === null ? undefined : input.email.trim() || undefined;
  }
  if (input.phone !== undefined) {
    patch.phone =
      input.phone === null ? undefined : input.phone.trim() || undefined;
  }
  if (input.role !== undefined) {
    patch.role =
      input.role === null ? undefined : input.role.trim() || undefined;
  }

  await ctx.db.patch("contractorContacts", input.contactId, patch);

  const after = await ctx.db.get("contractorContacts", input.contactId);
  await logAudit(ctx, user, {
    action: "update",
    tableName: "contractorContacts",
    recordId: input.contactId,
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
}

export async function archiveContractorContact(
  ctx: MutationCtx,
  user: Doc<"users">,
  contactId: Id<"contractorContacts">
): Promise<void> {
  const contact = await ctx.db.get("contractorContacts", contactId);
  if (!contact) throw new Error("Contato não encontrado");
  if (contact.active === false) return;

  const now = Date.now();
  const before = contactSnapshot(contact);
  await ctx.db.patch("contractorContacts", contactId, {
    active: false,
    archivedAt: now,
    updatedAt: now,
  });

  await logAudit(ctx, user, {
    action: "archive",
    tableName: "contractorContacts",
    recordId: contactId,
    entityLabel: contact.name,
    snapshotBefore: before,
    snapshotAfter: { ...before, active: false, archivedAt: now },
  });
}

export async function restoreContractorContact(
  ctx: MutationCtx,
  user: Doc<"users">,
  contactId: Id<"contractorContacts">
): Promise<void> {
  const contact = await ctx.db.get("contractorContacts", contactId);
  if (!contact) throw new Error("Contato não encontrado");
  if (contact.active !== false) return;

  const before = contactSnapshot(contact);
  await ctx.db.patch("contractorContacts", contactId, {
    active: true,
    archivedAt: undefined,
    updatedAt: Date.now(),
  });

  await logAudit(ctx, user, {
    action: "restore",
    tableName: "contractorContacts",
    recordId: contactId,
    entityLabel: contact.name,
    snapshotBefore: before,
    snapshotAfter: { ...before, active: true, archivedAt: undefined },
  });
}
