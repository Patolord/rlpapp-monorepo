import { v } from "convex/values";
import { cadastrosLookupQuery, cadastrosMutation } from "./lib/rbac";
import {
  addContractorContact,
  archiveContractorContact,
  restoreContractorContact,
  updateContractorContact,
} from "./model/contracts/contractorContacts";
import {
  archiveContractor,
  contractorContactValidator,
  contractorValidator,
  createContractor,
  getContractorWithContacts,
  listContractors,
  restoreContractor,
  updateContractor,
} from "./model/contracts/contractors";

export const list = cadastrosLookupQuery({
  args: {
    search: v.optional(v.string()),
    activeOnly: v.optional(v.boolean()),
    includeArchived: v.optional(v.boolean()),
  },
  returns: v.array(contractorValidator),
  handler: async (ctx, args) => {
    return await listContractors(ctx, args);
  },
});

export const get = cadastrosLookupQuery({
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
    return await getContractorWithContacts(ctx, args);
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
  returns: v.id("contractors"),
  handler: async (ctx, args) => {
    return await createContractor(ctx, ctx.user, args);
  },
});

export const update = cadastrosMutation({
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
    await updateContractor(ctx, ctx.user, args);
    return null;
  },
});

export const archive = cadastrosMutation({
  args: { contractorId: v.id("contractors") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await archiveContractor(ctx, ctx.user, args.contractorId);
    return null;
  },
});

export const restore = cadastrosMutation({
  args: { contractorId: v.id("contractors") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await restoreContractor(ctx, ctx.user, args.contractorId);
    return null;
  },
});

export const addContact = cadastrosMutation({
  args: {
    contractorId: v.id("contractors"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    role: v.optional(v.string()),
  },
  returns: v.id("contractorContacts"),
  handler: async (ctx, args) => {
    return await addContractorContact(ctx, ctx.user, args);
  },
});

export const updateContact = cadastrosMutation({
  args: {
    contactId: v.id("contractorContacts"),
    name: v.optional(v.string()),
    email: v.optional(v.union(v.string(), v.null())),
    phone: v.optional(v.union(v.string(), v.null())),
    role: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updateContractorContact(ctx, ctx.user, args);
    return null;
  },
});

export const removeContact = cadastrosMutation({
  args: { contactId: v.id("contractorContacts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await archiveContractorContact(ctx, ctx.user, args.contactId);
    return null;
  },
});

export const restoreContact = cadastrosMutation({
  args: { contactId: v.id("contractorContacts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await restoreContractorContact(ctx, ctx.user, args.contactId);
    return null;
  },
});
