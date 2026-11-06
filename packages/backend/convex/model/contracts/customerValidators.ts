import { v } from "convex/values";

/**
 * Validadores do cadastro de clientes (`convex/customers.ts`): a linha
 * devolvida ao cliente, os contatos e o item da importação em lote.
 */

export const customerValidator = v.object({
  _id: v.id("customers"),
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

export const customerContactValidator = v.object({
  _id: v.id("customerContacts"),
  customerId: v.id("customers"),
  name: v.string(),
  email: v.union(v.string(), v.null()),
  phone: v.union(v.string(), v.null()),
  role: v.union(v.string(), v.null()),
  active: v.boolean(),
  archivedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
});

const bulkCustomerContactValidator = v.object({
  name: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  role: v.optional(v.string()),
});

export const bulkCustomerItemValidator = v.object({
  name: v.string(),
  personType: v.optional(v.union(v.literal("pf"), v.literal("pj"))),
  legalName: v.optional(v.string()),
  taxId: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  address: v.optional(v.string()),
  notes: v.optional(v.string()),
  contact: v.optional(bulkCustomerContactValidator),
});
