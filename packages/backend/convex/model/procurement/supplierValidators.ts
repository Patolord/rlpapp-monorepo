import { v } from "convex/values";

/** Validadores de `suppliers.ts`: fornecedores, contatos e ofertas. */

export const personTypeValidator = v.union(v.literal("pf"), v.literal("pj"));

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
  // Dados do fornecedor denormalizados para a UI não precisar cruzar listas.
  supplierName: v.string(),
  supplierActive: v.boolean(),
  supplierPaymentTerms: v.union(v.string(), v.null()),
  supplierDefaultLeadTimeDays: v.union(v.number(), v.null()),
  // Prazo da oferta ou, na falta dele, o prazo padrão do fornecedor.
  effectiveLeadTimeDays: v.union(v.number(), v.null()),
});

/** Campos editáveis do fornecedor, compartilhados por create/bulkCreate/update. */
export const supplierFieldsValidator = v.object({
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

const bulkSupplierContactValidator = v.object({
  name: v.string(),
  email: v.optional(v.string()),
  whatsapp: v.optional(v.string()),
  role: v.optional(v.string()),
});

export const bulkSupplierItemValidator = v.object({
  name: v.string(),
  ...supplierFieldsValidator.fields,
  contact: v.optional(bulkSupplierContactValidator),
});
