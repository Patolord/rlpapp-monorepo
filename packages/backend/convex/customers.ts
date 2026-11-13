import { v } from "convex/values";
import { cadastrosLookupQuery, cadastrosMutation } from "./lib/rbac";
import {
  addCustomerContact,
  archiveCustomerContact,
  restoreCustomerContact,
  updateCustomerContact,
} from "./model/contracts/customerContacts";
import { bulkCreateCustomers } from "./model/contracts/customerImport";
import {
  archiveCustomer,
  createCustomer,
  getCustomerWithContacts,
  listCustomers,
  restoreCustomer,
  updateCustomer,
} from "./model/contracts/customerRecords";
import {
  bulkCustomerItemValidator,
  customerContactValidator,
  customerValidator,
} from "./model/contracts/customerValidators";
import { bulkImportResultValidator } from "./model/kernel/bulkImport";

export const list = cadastrosLookupQuery({
  args: {
    search: v.optional(v.string()),
    activeOnly: v.optional(v.boolean()),
    includeArchived: v.optional(v.boolean()),
  },
  returns: v.array(customerValidator),
  handler: async (ctx, args) => {
    return await listCustomers(ctx, args);
  },
});

export const get = cadastrosLookupQuery({
  args: {
    customerId: v.id("customers"),
    includeInactiveContacts: v.optional(v.boolean()),
  },
  returns: v.union(
    v.object({
      customer: customerValidator,
      contacts: v.array(customerContactValidator),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    return await getCustomerWithContacts(ctx, args);
  },
});

export const create = cadastrosMutation({
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
    return await createCustomer(ctx, ctx.user, args);
  },
});

export const bulkCreate = cadastrosMutation({
  args: {
    items: v.array(bulkCustomerItemValidator),
  },
  returns: bulkImportResultValidator,
  handler: async (ctx, args) => {
    return await bulkCreateCustomers(ctx, ctx.user, args.items);
  },
});

export const update = cadastrosMutation({
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
    await updateCustomer(ctx, ctx.user, args);
    return null;
  },
});

export const archive = cadastrosMutation({
  args: { customerId: v.id("customers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await archiveCustomer(ctx, ctx.user, args.customerId);
    return null;
  },
});

export const restore = cadastrosMutation({
  args: { customerId: v.id("customers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await restoreCustomer(ctx, ctx.user, args.customerId);
    return null;
  },
});

export const addContact = cadastrosMutation({
  args: {
    customerId: v.id("customers"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    role: v.optional(v.string()),
  },
  returns: v.id("customerContacts"),
  handler: async (ctx, args) => {
    return await addCustomerContact(ctx, ctx.user, args);
  },
});

export const updateContact = cadastrosMutation({
  args: {
    contactId: v.id("customerContacts"),
    name: v.optional(v.string()),
    email: v.optional(v.union(v.string(), v.null())),
    phone: v.optional(v.union(v.string(), v.null())),
    role: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updateCustomerContact(ctx, ctx.user, args);
    return null;
  },
});

export const removeContact = cadastrosMutation({
  args: { contactId: v.id("customerContacts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await archiveCustomerContact(ctx, ctx.user, args.contactId);
    return null;
  },
});

export const restoreContact = cadastrosMutation({
  args: { contactId: v.id("customerContacts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await restoreCustomerContact(ctx, ctx.user, args.contactId);
    return null;
  },
});
