import { v, type Infer } from "convex/values";
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

/**
 * Cadastro de empreiteiros (`convex/contractors.ts`): listagem, detalhe com
 * contatos, criação, edição, arquivamento e restauração. Mesmas regras de
 * nome/CNPJ/CPF dos clientes (`customers.ts`). Os contatos ficam em
 * `contractorContacts.ts`.
 */

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

export type ContractorRow = Infer<typeof contractorValidator>;
export type ContractorContactRow = Infer<typeof contractorContactValidator>;

export type ListContractorsInput = {
  search?: string;
  activeOnly?: boolean;
  includeArchived?: boolean;
};

export type GetContractorInput = {
  contractorId: Id<"contractors">;
  includeInactiveContacts?: boolean;
};

export type CreateContractorInput = {
  name: string;
  personType?: CustomerPersonType;
  legalName?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
};

export type UpdateContractorInput = {
  contractorId: Id<"contractors">;
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

function toContractorRow(c: Doc<"contractors">): ContractorRow {
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

export async function listContractors(
  ctx: QueryCtx,
  input: ListContractorsInput
): Promise<ContractorRow[]> {
  let contractors = await ctx.db.query("contractors").order("desc").collect();
  if (!input.includeArchived) {
    contractors = contractors.filter((c) => !c.archivedAt);
  }
  if (input.activeOnly) {
    contractors = contractors.filter((c) => c.active);
  }
  if (input.search?.trim()) {
    const term = normalizeCustomerName(input.search);
    contractors = contractors.filter(
      (c) =>
        c.nameNormalized.includes(term) ||
        (c.legalName && normalizeCustomerName(c.legalName).includes(term)) ||
        (c.taxIdNormalized &&
          c.taxIdNormalized.includes(term.replace(/\D/g, "")))
    );
  }
  return contractors.map(toContractorRow);
}

export async function getContractorWithContacts(
  ctx: QueryCtx,
  input: GetContractorInput
): Promise<{
  contractor: ContractorRow;
  contacts: ContractorContactRow[];
} | null> {
  const contractor = await ctx.db.get("contractors", input.contractorId);
  if (!contractor) return null;
  const contacts = await ctx.db
    .query("contractorContacts")
    .withIndex("by_contractor", (q) =>
      q.eq("contractorId", input.contractorId)
    )
    .collect();
  const visibleContacts = input.includeInactiveContacts
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
}

export async function createContractor(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: CreateContractorInput
): Promise<Id<"contractors">> {
  const name = input.name.trim();
  if (!name) throw new Error("Informe o nome do empreiteiro");

  const taxId = input.taxId ? formatTaxId(input.taxId) : undefined;
  validateTaxIdForPersonType(taxId, input.personType);
  await assertUniqueContractorIdentity(ctx, { name, taxId });

  const now = Date.now();
  const contractorId = await ctx.db.insert("contractors", {
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
    tableName: "contractors",
    recordId: contractorId,
    entityLabel: name,
    snapshotAfter: { name, personType: input.personType, taxId },
  });

  return contractorId;
}

export async function updateContractor(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: UpdateContractorInput
): Promise<void> {
  const contractor = await ctx.db.get("contractors", input.contractorId);
  if (!contractor) throw new Error("Empreiteiro não encontrado");
  if (contractor.archivedAt) {
    throw new Error("Empreiteiro arquivado — restaure antes de editar");
  }

  const before = contractorSnapshot(contractor);
  const updates: Partial<Doc<"contractors">> = {
    updatedAt: Date.now(),
    updatedByUserId: user._id,
  };

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Informe o nome do empreiteiro");
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

  const nextName = updates.name ?? contractor.name;
  const nextTaxId =
    input.taxId === undefined ? contractor.taxId : updates.taxId;
  const nextPersonType =
    input.personType === undefined
      ? contractor.personType
      : updates.personType;
  validateTaxIdForPersonType(nextTaxId, nextPersonType);
  await assertUniqueContractorIdentity(ctx, {
    name: nextName,
    taxId: nextTaxId,
    excludeId: input.contractorId,
  });

  await ctx.db.patch("contractors", input.contractorId, updates);

  const afterDoc = await ctx.db.get("contractors", input.contractorId);
  await logAudit(ctx, user, {
    action: "update",
    tableName: "contractors",
    recordId: input.contractorId,
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
}

export async function archiveContractor(
  ctx: MutationCtx,
  user: Doc<"users">,
  contractorId: Id<"contractors">
): Promise<void> {
  const contractor = await ctx.db.get("contractors", contractorId);
  if (!contractor) throw new Error("Empreiteiro não encontrado");
  if (contractor.archivedAt) return;

  const now = Date.now();
  const before = contractorSnapshot(contractor);
  await ctx.db.patch("contractors", contractorId, {
    active: false,
    archivedAt: now,
    archivedByUserId: user._id,
    updatedAt: now,
    updatedByUserId: user._id,
  });

  await logAudit(ctx, user, {
    action: "archive",
    tableName: "contractors",
    recordId: contractorId,
    entityLabel: contractor.name,
    snapshotBefore: before,
    snapshotAfter: { ...before, active: false, archivedAt: now },
  });
}

export async function restoreContractor(
  ctx: MutationCtx,
  user: Doc<"users">,
  contractorId: Id<"contractors">
): Promise<void> {
  const contractor = await ctx.db.get("contractors", contractorId);
  if (!contractor) throw new Error("Empreiteiro não encontrado");
  if (!contractor.archivedAt) return;

  const now = Date.now();
  const before = contractorSnapshot(contractor);
  await ctx.db.patch("contractors", contractorId, {
    active: true,
    archivedAt: undefined,
    archivedByUserId: undefined,
    updatedAt: now,
    updatedByUserId: user._id,
  });

  await logAudit(ctx, user, {
    action: "restore",
    tableName: "contractors",
    recordId: contractorId,
    entityLabel: contractor.name,
    snapshotBefore: before,
    snapshotAfter: { ...before, active: true, archivedAt: undefined },
  });
}
