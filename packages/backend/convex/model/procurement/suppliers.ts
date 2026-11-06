import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { diffFields, logAudit } from "../../lib/audit";
import {
  optionalTaxIdDigits,
  normalizeTaxId,
  validateTaxIdForPersonType,
} from "../contracts/customers";
import { normalizeText } from "./pricing";

/** Cadastro de fornecedores e seus contatos. */

type PersonType = "pf" | "pj";

function toSupplierRow(s: Doc<"suppliers">) {
  return {
    _id: s._id,
    _creationTime: s._creationTime,
    name: s.name,
    personType: s.personType ?? null,
    legalName: s.legalName ?? null,
    taxId: s.taxId ?? null,
    stateRegistration: s.stateRegistration ?? null,
    email: s.email ?? null,
    phone: s.phone ?? null,
    website: s.website ?? null,
    address: s.address ?? null,
    paymentTerms: s.paymentTerms ?? null,
    defaultLeadTimeDays: s.defaultLeadTimeDays ?? null,
    categories: s.categories ?? null,
    notes: s.notes ?? null,
    active: s.active,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt ?? null,
  };
}

function supplierSnapshot(s: Doc<"suppliers">) {
  return {
    name: s.name,
    personType: s.personType,
    legalName: s.legalName,
    taxId: s.taxId,
    stateRegistration: s.stateRegistration,
    email: s.email,
    phone: s.phone,
    website: s.website,
    address: s.address,
    paymentTerms: s.paymentTerms,
    defaultLeadTimeDays: s.defaultLeadTimeDays,
    categories: s.categories,
    notes: s.notes,
    active: s.active,
  };
}

const SUPPLIER_AUDIT_FIELDS = [
  "name",
  "personType",
  "legalName",
  "taxId",
  "stateRegistration",
  "email",
  "phone",
  "website",
  "address",
  "paymentTerms",
  "defaultLeadTimeDays",
  "categories",
  "notes",
  "active",
] as const;

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function cleanCategories(values: string[] | undefined): string[] | undefined {
  if (values === undefined) return undefined;
  return values.map((c) => c.trim()).filter(Boolean);
}

function cleanWebsite(value: string | undefined): string | undefined {
  const trimmed = cleanOptional(value);
  if (!trimmed) return undefined;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function validateLeadTimeDays(value: number | undefined): void {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("Prazo padrão deve ser um número inteiro não negativo");
  }
}

function validateEmail(value: string | undefined): void {
  if (!value) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error("E-mail inválido");
  }
}

/**
 * Sem tipo de pessoa informado, deduz PF/PJ pelo tamanho do documento para
 * que o CNPJ/CPF seja sempre validado (tamanho + dígitos verificadores).
 */
function resolvePersonType(
  taxId: string | undefined,
  personType: PersonType | undefined
): PersonType | undefined {
  if (personType || !taxId) return personType;
  const length = normalizeTaxId(taxId).length;
  if (length === 11) return "pf";
  if (length === 14) return "pj";
  throw new Error("CNPJ/CPF deve conter 11 (CPF) ou 14 (CNPJ) dígitos");
}

async function assertUniqueSupplierTaxId(
  ctx: MutationCtx,
  taxId: string | undefined,
  excludeId?: Id<"suppliers">
): Promise<void> {
  if (!taxId) return;
  const taxIdNormalized = normalizeTaxId(taxId);
  if (!taxIdNormalized) return;
  const existing = await ctx.db
    .query("suppliers")
    .withIndex("by_tax_id_normalized", (q) =>
      q.eq("taxIdNormalized", taxIdNormalized)
    )
    .collect();
  const conflict = existing.find((s) => s._id !== excludeId);
  if (conflict) {
    throw new Error(
      `Já existe um fornecedor com este CNPJ/CPF (${conflict.name})`
    );
  }
}

export type SupplierFieldsInput = {
  personType?: PersonType;
  legalName?: string;
  taxId?: string;
  stateRegistration?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  paymentTerms?: string;
  defaultLeadTimeDays?: number;
  categories?: string[];
  notes?: string;
};

/** Normaliza e valida os campos opcionais de um fornecedor novo. */
export function prepareSupplierFields(input: SupplierFieldsInput) {
  const taxId = input.taxId ? optionalTaxIdDigits(input.taxId) : undefined;
  validateTaxIdForPersonType(taxId, resolvePersonType(taxId, input.personType));
  validateLeadTimeDays(input.defaultLeadTimeDays);
  const email = cleanOptional(input.email);
  validateEmail(email);
  return {
    personType: input.personType,
    legalName: cleanOptional(input.legalName),
    taxId,
    taxIdNormalized: taxId ? normalizeTaxId(taxId) : undefined,
    stateRegistration: cleanOptional(input.stateRegistration),
    email,
    phone: cleanOptional(input.phone),
    website: cleanWebsite(input.website),
    address: cleanOptional(input.address),
    paymentTerms: cleanOptional(input.paymentTerms),
    defaultLeadTimeDays: input.defaultLeadTimeDays,
    categories: cleanCategories(input.categories),
    notes: cleanOptional(input.notes),
  };
}

export async function listSuppliers(
  ctx: QueryCtx,
  input: { search?: string; activeOnly?: boolean }
) {
  let suppliers = await ctx.db.query("suppliers").order("desc").collect();
  if (input.activeOnly) {
    suppliers = suppliers.filter((s) => s.active);
  }
  if (input.search?.trim()) {
    const term = normalizeText(input.search);
    const digits = input.search.replace(/\D/g, "");
    suppliers = suppliers.filter(
      (s) =>
        normalizeText(s.name).includes(term) ||
        (s.legalName && normalizeText(s.legalName).includes(term)) ||
        (s.categories ?? []).some((c) => normalizeText(c).includes(term)) ||
        (digits.length >= 3 &&
          s.taxIdNormalized !== undefined &&
          s.taxIdNormalized.includes(digits))
    );
  }
  return suppliers.map(toSupplierRow);
}

export async function getSupplierWithContacts(
  ctx: QueryCtx,
  supplierId: Id<"suppliers">
) {
  const supplier = await ctx.db.get("suppliers", supplierId);
  if (!supplier) return null;
  const contacts = await ctx.db
    .query("supplierContacts")
    .withIndex("by_supplier", (q) => q.eq("supplierId", supplierId))
    .collect();
  return {
    supplier: toSupplierRow(supplier),
    contacts: contacts.map((c) => ({
      _id: c._id,
      supplierId: c.supplierId,
      name: c.name,
      email: c.email ?? null,
      whatsapp: c.whatsapp ?? null,
      role: c.role ?? null,
      createdAt: c.createdAt,
    })),
  };
}

export async function createSupplier(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: SupplierFieldsInput & { name: string }
): Promise<Id<"suppliers">> {
  const name = input.name.trim();
  if (!name) throw new Error("Informe o nome do fornecedor");
  const fields = prepareSupplierFields(input);
  await assertUniqueSupplierTaxId(ctx, fields.taxId);
  const now = Date.now();
  const supplierId = await ctx.db.insert("suppliers", {
    name,
    ...fields,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  await logAudit(ctx, user, {
    action: "create",
    tableName: "suppliers",
    recordId: supplierId,
    entityLabel: name,
    details: name,
    snapshotAfter: {
      name,
      personType: fields.personType,
      taxId: fields.taxId,
    },
  });
  return supplierId;
}

export type UpdateSupplierInput = {
  supplierId: Id<"suppliers">;
  name?: string;
  /** `null` limpa o campo; omitir mantém o valor atual. */
  personType?: PersonType | null;
  legalName?: string;
  taxId?: string | null;
  stateRegistration?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  paymentTerms?: string;
  defaultLeadTimeDays?: number | null;
  categories?: string[];
  notes?: string;
  active?: boolean;
};

export async function updateSupplier(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: UpdateSupplierInput
): Promise<void> {
  const supplier = await ctx.db.get("suppliers", input.supplierId);
  if (!supplier) throw new Error("Fornecedor não encontrado");

  const before = supplierSnapshot(supplier);
  const updates: Partial<Doc<"suppliers">> = { updatedAt: Date.now() };

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Informe o nome do fornecedor");
    updates.name = name;
  }
  if (input.personType !== undefined) {
    updates.personType = input.personType ?? undefined;
  }
  if (input.legalName !== undefined) {
    updates.legalName = cleanOptional(input.legalName);
  }
  if (input.taxId !== undefined) {
    const taxId = input.taxId === null ? undefined : optionalTaxIdDigits(input.taxId);
    updates.taxId = taxId;
    updates.taxIdNormalized = taxId ? normalizeTaxId(taxId) : undefined;
  }
  if (input.stateRegistration !== undefined) {
    updates.stateRegistration = cleanOptional(input.stateRegistration);
  }
  if (input.email !== undefined) {
    updates.email = cleanOptional(input.email);
    validateEmail(updates.email);
  }
  if (input.phone !== undefined) updates.phone = cleanOptional(input.phone);
  if (input.website !== undefined) updates.website = cleanWebsite(input.website);
  if (input.address !== undefined) updates.address = cleanOptional(input.address);
  if (input.paymentTerms !== undefined) {
    updates.paymentTerms = cleanOptional(input.paymentTerms);
  }
  if (input.defaultLeadTimeDays !== undefined) {
    validateLeadTimeDays(input.defaultLeadTimeDays ?? undefined);
    updates.defaultLeadTimeDays = input.defaultLeadTimeDays ?? undefined;
  }
  if (input.categories !== undefined) {
    updates.categories = cleanCategories(input.categories);
  }
  if (input.notes !== undefined) updates.notes = cleanOptional(input.notes);
  if (input.active !== undefined) updates.active = input.active;

  const nextTaxId = input.taxId === undefined ? supplier.taxId : updates.taxId;
  const nextPersonType =
    input.personType === undefined ? supplier.personType : updates.personType;
  validateTaxIdForPersonType(
    nextTaxId,
    resolvePersonType(nextTaxId, nextPersonType)
  );
  await assertUniqueSupplierTaxId(ctx, nextTaxId, input.supplierId);

  await ctx.db.patch("suppliers", input.supplierId, updates);
  const afterDoc = await ctx.db.get("suppliers", input.supplierId);
  const after = afterDoc ? supplierSnapshot(afterDoc) : before;
  await logAudit(ctx, user, {
    action: "update",
    tableName: "suppliers",
    recordId: input.supplierId,
    entityLabel: after.name,
    changes: diffFields(before, after, [...SUPPLIER_AUDIT_FIELDS]),
    snapshotBefore: before,
    snapshotAfter: after,
  });
}

export type AddSupplierContactInput = {
  supplierId: Id<"suppliers">;
  name: string;
  email?: string;
  whatsapp?: string;
  role?: string;
};

export async function addSupplierContact(
  ctx: MutationCtx,
  input: AddSupplierContactInput
): Promise<Id<"supplierContacts">> {
  const supplier = await ctx.db.get("suppliers", input.supplierId);
  if (!supplier) throw new Error("Fornecedor não encontrado");
  const name = input.name.trim();
  if (!name) throw new Error("Informe o nome do contato");

  return await ctx.db.insert("supplierContacts", {
    supplierId: input.supplierId,
    name,
    email: input.email?.trim() || undefined,
    whatsapp: input.whatsapp?.trim() || undefined,
    role: input.role?.trim() || undefined,
    createdAt: Date.now(),
  });
}

export async function removeSupplierContact(
  ctx: MutationCtx,
  user: Doc<"users">,
  contactId: Id<"supplierContacts">
): Promise<void> {
  const contact = await ctx.db.get("supplierContacts", contactId);
  if (!contact) throw new Error("Contato não encontrado");

  await logAudit(ctx, user, {
    action: "delete",
    tableName: "supplierContacts",
    recordId: contactId,
    entityLabel: contact.name,
    snapshotBefore: {
      name: contact.name,
      supplierId: contact.supplierId,
    },
  });

  await ctx.db.delete("supplierContacts", contactId);
}
