import { v } from "convex/values";
import { engineeringOrPurchasingQuery, purchasingMutation } from "./lib/rbac";
import { logAudit, diffFields } from "./lib/audit";
import { normalizeText } from "./lib/compras/procurement";
import {
  formatTaxId,
  normalizeTaxId,
  validateTaxIdForPersonType,
} from "./lib/customers/helpers";
import {
  bulkImportResultValidator,
  emptyBulkImportResult,
  requireTrimmedName,
} from "./lib/compras/bulkImport";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const personTypeValidator = v.union(v.literal("pf"), v.literal("pj"));

export const supplierValidator = v.object({
  _id: v.id("suppliers"),
  _creationTime: v.number(),
  name: v.string(),
  personType: v.union(personTypeValidator, v.null()),
  legalName: v.union(v.string(), v.null()),
  taxId: v.union(v.string(), v.null()),
  stateRegistration: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  phone: v.union(v.string(), v.null()),
  website: v.union(v.string(), v.null()),
  address: v.union(v.string(), v.null()),
  paymentTerms: v.union(v.string(), v.null()),
  defaultLeadTimeDays: v.union(v.number(), v.null()),
  categories: v.union(v.array(v.string()), v.null()),
  notes: v.union(v.string(), v.null()),
  active: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
});

export const contactValidator = v.object({
  _id: v.id("supplierContacts"),
  supplierId: v.id("suppliers"),
  name: v.string(),
  email: v.union(v.string(), v.null()),
  whatsapp: v.union(v.string(), v.null()),
  role: v.union(v.string(), v.null()),
  createdAt: v.number(),
});

export const supplierMaterialValidator = v.object({
  _id: v.id("supplierMaterials"),
  supplierId: v.id("suppliers"),
  materialId: v.id("materials"),
  materialName: v.string(),
  materialVariantLabel: v.union(v.string(), v.null()),
  supplierCode: v.union(v.string(), v.null()),
  supplierDescription: v.union(v.string(), v.null()),
  purchaseUnit: v.union(v.string(), v.null()),
  unitsPerPurchaseUnit: v.union(v.number(), v.null()),
  leadTimeDays: v.union(v.number(), v.null()),
  preferred: v.boolean(),
  active: v.boolean(),
});

/** Campos editáveis do fornecedor, compartilhados por create/bulkCreate/update. */
const supplierFieldsValidator = v.object({
  personType: v.optional(personTypeValidator),
  legalName: v.optional(v.string()),
  taxId: v.optional(v.string()),
  stateRegistration: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  website: v.optional(v.string()),
  address: v.optional(v.string()),
  paymentTerms: v.optional(v.string()),
  defaultLeadTimeDays: v.optional(v.number()),
  categories: v.optional(v.array(v.string())),
  notes: v.optional(v.string()),
});

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
  personType: "pf" | "pj" | undefined
): "pf" | "pj" | undefined {
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

export const list = engineeringOrPurchasingQuery({
  args: {
    search: v.optional(v.string()),
    activeOnly: v.optional(v.boolean()),
  },
  returns: v.array(supplierValidator),
  handler: async (ctx, args) => {
    let suppliers = await ctx.db.query("suppliers").order("desc").collect();
    if (args.activeOnly) {
      suppliers = suppliers.filter((s) => s.active);
    }
    if (args.search?.trim()) {
      const term = normalizeText(args.search);
      const digits = args.search.replace(/\D/g, "");
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
  },
});

export const get = engineeringOrPurchasingQuery({
  args: { supplierId: v.id("suppliers") },
  returns: v.union(
    v.object({
      supplier: supplierValidator,
      contacts: v.array(contactValidator),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const supplier = await ctx.db.get("suppliers", args.supplierId);
    if (!supplier) return null;
    const contacts = await ctx.db
      .query("supplierContacts")
      .withIndex("by_supplier", (q) => q.eq("supplierId", args.supplierId))
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
  },
});

type SupplierFieldsInput = {
  personType?: "pf" | "pj";
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
function prepareSupplierFields(input: SupplierFieldsInput) {
  const taxId = input.taxId ? formatTaxId(input.taxId) : undefined;
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

export const create = purchasingMutation({
  args: {
    name: v.string(),
    ...supplierFieldsValidator.fields,
  },
  returns: v.id("suppliers"),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("Informe o nome do fornecedor");
    const fields = prepareSupplierFields(args);
    await assertUniqueSupplierTaxId(ctx, fields.taxId);
    const now = Date.now();
    const supplierId = await ctx.db.insert("suppliers", {
      name,
      ...fields,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await logAudit(ctx, ctx.user, {
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
  },
});

const bulkSupplierContactValidator = v.object({
  name: v.string(),
  email: v.optional(v.string()),
  whatsapp: v.optional(v.string()),
  role: v.optional(v.string()),
});

const bulkSupplierItemValidator = v.object({
  name: v.string(),
  ...supplierFieldsValidator.fields,
  contact: v.optional(bulkSupplierContactValidator),
});

export const bulkCreate = purchasingMutation({
  args: {
    items: v.array(bulkSupplierItemValidator),
  },
  returns: bulkImportResultValidator,
  handler: async (ctx, args) => {
    if (args.items.length > 200) {
      throw new Error("Máximo de 200 fornecedores por importação");
    }

    const result = emptyBulkImportResult();
    const now = Date.now();
    const existing = await ctx.db.query("suppliers").collect();
    const existingNames = new Set(existing.map((s) => normalizeText(s.name)));
    const existingTaxIds = new Set(
      existing.flatMap((s) => (s.taxIdNormalized ? [s.taxIdNormalized] : []))
    );

    let firstCreatedId: string | null = null;

    for (let i = 0; i < args.items.length; i++) {
      const row = i + 1;
      const item = args.items[i]!;
      const nameCheck = requireTrimmedName(item.name, row, "Nome");
      if (!nameCheck.ok) {
        result.errors.push(nameCheck.error);
        continue;
      }

      const normalizedName = normalizeText(nameCheck.name);
      if (existingNames.has(normalizedName)) {
        result.skipped++;
        continue;
      }

      let fields: ReturnType<typeof prepareSupplierFields>;
      try {
        fields = prepareSupplierFields(item);
      } catch (error) {
        result.errors.push({
          row,
          message: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (fields.taxIdNormalized && existingTaxIds.has(fields.taxIdNormalized)) {
        result.skipped++;
        continue;
      }

      const supplierId = await ctx.db.insert("suppliers", {
        name: nameCheck.name,
        ...fields,
        active: true,
        createdAt: now,
        updatedAt: now,
      });

      if (item.contact?.name?.trim()) {
        await ctx.db.insert("supplierContacts", {
          supplierId,
          name: item.contact.name.trim(),
          email: item.contact.email?.trim() || undefined,
          whatsapp: item.contact.whatsapp?.trim() || undefined,
          role: item.contact.role?.trim() || undefined,
          createdAt: now,
        });
      }

      existingNames.add(normalizedName);
      if (fields.taxIdNormalized) existingTaxIds.add(fields.taxIdNormalized);
      if (!firstCreatedId) firstCreatedId = supplierId;
      result.created++;
    }

    if (result.created > 0 && firstCreatedId) {
      await logAudit(ctx, ctx.user, {
        action: "create",
        tableName: "suppliers",
        recordId: firstCreatedId,
        details: `Importação CSV: ${result.created} criados, ${result.skipped} ignorados`,
      });
    }

    return result;
  },
});

export const update = purchasingMutation({
  args: {
    supplierId: v.id("suppliers"),
    name: v.optional(v.string()),
    // `null` limpa o campo; omitir mantém o valor atual.
    personType: v.optional(v.union(personTypeValidator, v.null())),
    legalName: v.optional(v.string()),
    taxId: v.optional(v.union(v.string(), v.null())),
    stateRegistration: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    address: v.optional(v.string()),
    paymentTerms: v.optional(v.string()),
    defaultLeadTimeDays: v.optional(v.union(v.number(), v.null())),
    categories: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const supplier = await ctx.db.get("suppliers", args.supplierId);
    if (!supplier) throw new Error("Fornecedor não encontrado");

    const before = supplierSnapshot(supplier);
    const updates: Partial<Doc<"suppliers">> = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Informe o nome do fornecedor");
      updates.name = name;
    }
    if (args.personType !== undefined) {
      updates.personType = args.personType ?? undefined;
    }
    if (args.legalName !== undefined) {
      updates.legalName = cleanOptional(args.legalName);
    }
    if (args.taxId !== undefined) {
      const taxId = args.taxId === null ? undefined : formatTaxId(args.taxId);
      updates.taxId = taxId;
      updates.taxIdNormalized = taxId ? normalizeTaxId(taxId) : undefined;
    }
    if (args.stateRegistration !== undefined) {
      updates.stateRegistration = cleanOptional(args.stateRegistration);
    }
    if (args.email !== undefined) {
      updates.email = cleanOptional(args.email);
      validateEmail(updates.email);
    }
    if (args.phone !== undefined) updates.phone = cleanOptional(args.phone);
    if (args.website !== undefined) updates.website = cleanWebsite(args.website);
    if (args.address !== undefined) updates.address = cleanOptional(args.address);
    if (args.paymentTerms !== undefined) {
      updates.paymentTerms = cleanOptional(args.paymentTerms);
    }
    if (args.defaultLeadTimeDays !== undefined) {
      validateLeadTimeDays(args.defaultLeadTimeDays ?? undefined);
      updates.defaultLeadTimeDays = args.defaultLeadTimeDays ?? undefined;
    }
    if (args.categories !== undefined) {
      updates.categories = cleanCategories(args.categories);
    }
    if (args.notes !== undefined) updates.notes = cleanOptional(args.notes);
    if (args.active !== undefined) updates.active = args.active;

    const nextTaxId = args.taxId === undefined ? supplier.taxId : updates.taxId;
    const nextPersonType =
      args.personType === undefined ? supplier.personType : updates.personType;
    validateTaxIdForPersonType(
      nextTaxId,
      resolvePersonType(nextTaxId, nextPersonType)
    );
    await assertUniqueSupplierTaxId(ctx, nextTaxId, args.supplierId);

    await ctx.db.patch("suppliers", args.supplierId, updates);
    const afterDoc = await ctx.db.get("suppliers", args.supplierId);
    const after = afterDoc ? supplierSnapshot(afterDoc) : before;
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "suppliers",
      recordId: args.supplierId,
      entityLabel: after.name,
      changes: diffFields(before, after, [...SUPPLIER_AUDIT_FIELDS]),
      snapshotBefore: before,
      snapshotAfter: after,
    });
    return null;
  },
});

export const addContact = purchasingMutation({
  args: {
    supplierId: v.id("suppliers"),
    name: v.string(),
    email: v.optional(v.string()),
    whatsapp: v.optional(v.string()),
    role: v.optional(v.string()),
  },
  returns: v.id("supplierContacts"),
  handler: async (ctx, args) => {
    const supplier = await ctx.db.get("suppliers", args.supplierId);
    if (!supplier) throw new Error("Fornecedor não encontrado");
    const name = args.name.trim();
    if (!name) throw new Error("Informe o nome do contato");

    return await ctx.db.insert("supplierContacts", {
      supplierId: args.supplierId,
      name,
      email: args.email?.trim() || undefined,
      whatsapp: args.whatsapp?.trim() || undefined,
      role: args.role?.trim() || undefined,
      createdAt: Date.now(),
    });
  },
});

export const removeContact = purchasingMutation({
  args: { contactId: v.id("supplierContacts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const contact = await ctx.db.get("supplierContacts", args.contactId);
    if (!contact) throw new Error("Contato não encontrado");

    await logAudit(ctx, ctx.user, {
      action: "delete",
      tableName: "supplierContacts",
      recordId: args.contactId,
      entityLabel: contact.name,
      snapshotBefore: {
        name: contact.name,
        supplierId: contact.supplierId,
      },
    });

    await ctx.db.delete("supplierContacts", args.contactId);
    return null;
  },
});

export const listMaterialOfferings = engineeringOrPurchasingQuery({
  args: {
    materialId: v.optional(v.id("materials")),
    supplierId: v.optional(v.id("suppliers")),
  },
  returns: v.array(supplierMaterialValidator),
  handler: async (ctx, args) => {
    const materialId = args.materialId;
    const supplierId = args.supplierId;
    const offerings = materialId
      ? await ctx.db
          .query("supplierMaterials")
          .withIndex("by_material", (q) => q.eq("materialId", materialId))
          .collect()
      : supplierId
        ? await ctx.db
            .query("supplierMaterials")
            .withIndex("by_supplier", (q) => q.eq("supplierId", supplierId))
            .collect()
        : [];
    return await Promise.all(
      offerings.map(async (offering) => {
        const material = await ctx.db.get("materials", offering.materialId);
        return {
          _id: offering._id,
          supplierId: offering.supplierId,
          materialId: offering.materialId,
          materialName: material?.name ?? "Material removido",
          materialVariantLabel: material?.variantLabel ?? null,
          supplierCode: offering.supplierCode ?? null,
          supplierDescription: offering.supplierDescription ?? null,
          purchaseUnit: offering.purchaseUnit ?? null,
          unitsPerPurchaseUnit: offering.unitsPerPurchaseUnit ?? null,
          leadTimeDays: offering.leadTimeDays ?? null,
          preferred: offering.preferred,
          active: offering.active,
        };
      })
    );
  },
});

export const upsertMaterialOffering = purchasingMutation({
  args: {
    supplierId: v.id("suppliers"),
    materialId: v.id("materials"),
    supplierCode: v.optional(v.string()),
    supplierDescription: v.optional(v.string()),
    purchaseUnit: v.optional(v.string()),
    unitsPerPurchaseUnit: v.optional(v.number()),
    leadTimeDays: v.optional(v.number()),
    preferred: v.optional(v.boolean()),
    active: v.optional(v.boolean()),
  },
  returns: v.id("supplierMaterials"),
  handler: async (ctx, args) => {
    const [supplier, material] = await Promise.all([
      ctx.db.get("suppliers", args.supplierId),
      ctx.db.get("materials", args.materialId),
    ]);
    if (!supplier) throw new Error("Fornecedor não encontrado");
    if (!material) throw new Error("Material não encontrado");
    if (
      args.unitsPerPurchaseUnit !== undefined &&
      (!Number.isFinite(args.unitsPerPurchaseUnit) ||
        args.unitsPerPurchaseUnit <= 0)
    ) {
      throw new Error("Unidades por embalagem deve ser maior que zero");
    }
    if (
      args.leadTimeDays !== undefined &&
      (!Number.isInteger(args.leadTimeDays) || args.leadTimeDays < 0)
    ) {
      throw new Error("Prazo deve ser um número inteiro não negativo");
    }
    const supplierCode = args.supplierCode?.trim() || undefined;
    if (supplierCode) {
      const codeOwner = await ctx.db
        .query("supplierMaterials")
        .withIndex("by_supplier_code", (q) =>
          q.eq("supplierId", args.supplierId).eq("supplierCode", supplierCode)
        )
        .first();
      if (codeOwner && codeOwner.materialId !== args.materialId) {
        throw new Error(
          `Código ${supplierCode} já está vinculado a outro material deste fornecedor`
        );
      }
    }

    const existing = await ctx.db
      .query("supplierMaterials")
      .withIndex("by_supplier_material", (q) =>
        q
          .eq("supplierId", args.supplierId)
          .eq("materialId", args.materialId)
      )
      .unique();
    const now = Date.now();
    const values = {
      supplierCode,
      supplierDescription: args.supplierDescription?.trim() || undefined,
      purchaseUnit: args.purchaseUnit?.trim() || undefined,
      unitsPerPurchaseUnit: args.unitsPerPurchaseUnit,
      leadTimeDays: args.leadTimeDays,
      preferred: args.preferred ?? existing?.preferred ?? false,
      active: args.active ?? existing?.active ?? true,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch("supplierMaterials", existing._id, values);
      return existing._id;
    }
    return await ctx.db.insert("supplierMaterials", {
      supplierId: args.supplierId,
      materialId: args.materialId,
      ...values,
      createdAt: now,
    });
  },
});

export const removeMaterialOffering = purchasingMutation({
  args: { offeringId: v.id("supplierMaterials") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const offering = await ctx.db.get("supplierMaterials", args.offeringId);
    if (!offering) throw new Error("Oferta do fornecedor não encontrada");
    await ctx.db.delete("supplierMaterials", args.offeringId);
    return null;
  },
});
