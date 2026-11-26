import { v } from "convex/values";
import {
  engineeringOrPurchasingQuery,
  fornecedoresMutation,
} from "./lib/rbac";
import { bulkImportResultValidator } from "./model/kernel/bulkImport";
import { bulkCreateSuppliers } from "./model/procurement/supplierImport";
import {
  listSupplierMaterialOfferings,
  removeSupplierMaterialOffering,
  upsertSupplierMaterialOffering,
} from "./model/procurement/supplierMaterials";
import {
  addSupplierContact,
  createSupplier,
  getSupplierWithContacts,
  listSuppliers,
  removeSupplierContact,
  updateSupplier,
} from "./model/procurement/suppliers";
import {
  bulkSupplierItemValidator,
  contactValidator,
  personTypeValidator,
  supplierFieldsValidator,
  supplierMaterialValidator,
  supplierValidator,
} from "./model/procurement/supplierValidators";

export const list = engineeringOrPurchasingQuery({
  args: {
    search: v.optional(v.string()),
    activeOnly: v.optional(v.boolean()),
  },
  returns: v.array(supplierValidator),
  handler: async (ctx, args) => {
    return await listSuppliers(ctx, args);
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
    return await getSupplierWithContacts(ctx, args.supplierId);
  },
});

export const create = fornecedoresMutation({
  args: {
    name: v.string(),
    ...supplierFieldsValidator.fields,
  },
  returns: v.id("suppliers"),
  handler: async (ctx, args) => {
    return await createSupplier(ctx, ctx.user, args);
  },
});

export const bulkCreate = fornecedoresMutation({
  args: {
    items: v.array(bulkSupplierItemValidator),
  },
  returns: bulkImportResultValidator,
  handler: async (ctx, args) => {
    return await bulkCreateSuppliers(ctx, ctx.user, args);
  },
});

export const update = fornecedoresMutation({
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
    await updateSupplier(ctx, ctx.user, args);
    return null;
  },
});

export const addContact = fornecedoresMutation({
  args: {
    supplierId: v.id("suppliers"),
    name: v.string(),
    email: v.optional(v.string()),
    whatsapp: v.optional(v.string()),
    role: v.optional(v.string()),
  },
  returns: v.id("supplierContacts"),
  handler: async (ctx, args) => {
    return await addSupplierContact(ctx, args);
  },
});

export const removeContact = fornecedoresMutation({
  args: { contactId: v.id("supplierContacts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await removeSupplierContact(ctx, ctx.user, args.contactId);
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
    return await listSupplierMaterialOfferings(ctx, args);
  },
});

export const upsertMaterialOffering = fornecedoresMutation({
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
    return await upsertSupplierMaterialOffering(ctx, args);
  },
});

export const removeMaterialOffering = fornecedoresMutation({
  args: { offeringId: v.id("supplierMaterials") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await removeSupplierMaterialOffering(ctx, args.offeringId);
    return null;
  },
});
