import { v } from "convex/values";
import { contractDirection, contractKind } from "../../schema";

export const contractServiceItemInputValidator = v.object({
  description: v.string(),
  valueCents: v.number(),
});

export const contractServiceItemValidator = v.object({
  _id: v.id("contractServiceItems"),
  description: v.string(),
  valueCents: v.number(),
  order: v.number(),
});

export const contractListItemValidator = v.object({
  _id: v.id("contracts"),
  projectId: v.union(v.id("projects"), v.null()),
  projectName: v.union(v.string(), v.null()),
  projectSlug: v.union(v.string(), v.null()),
  direction: contractDirection,
  kind: contractKind,
  parentContractId: v.union(v.id("contracts"), v.null()),
  parentTitle: v.union(v.string(), v.null()),
  customerId: v.union(v.id("customers"), v.null()),
  customerName: v.union(v.string(), v.null()),
  contractorId: v.union(v.id("contractors"), v.null()),
  contractorName: v.union(v.string(), v.null()),
  title: v.string(),
  valueCents: v.number(),
  notes: v.union(v.string(), v.null()),
  signedAt: v.union(v.number(), v.null()),
  serviceItemCount: v.number(),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
});

export const contractDetailValidator = v.object({
  _id: v.id("contracts"),
  projectId: v.union(v.id("projects"), v.null()),
  projectName: v.union(v.string(), v.null()),
  projectSlug: v.union(v.string(), v.null()),
  direction: contractDirection,
  kind: contractKind,
  parentContractId: v.union(v.id("contracts"), v.null()),
  parentTitle: v.union(v.string(), v.null()),
  customerId: v.union(v.id("customers"), v.null()),
  customerName: v.union(v.string(), v.null()),
  contractorId: v.union(v.id("contractors"), v.null()),
  contractorName: v.union(v.string(), v.null()),
  title: v.string(),
  valueCents: v.number(),
  notes: v.union(v.string(), v.null()),
  signedAt: v.union(v.number(), v.null()),
  serviceItems: v.array(contractServiceItemValidator),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
});

export const baseContractOptionValidator = v.object({
  _id: v.id("contracts"),
  title: v.string(),
  valueCents: v.number(),
});

export const unassignedContractOptionValidator = v.object({
  _id: v.id("contracts"),
  title: v.string(),
  direction: contractDirection,
  valueCents: v.number(),
  customerName: v.union(v.string(), v.null()),
  contractorName: v.union(v.string(), v.null()),
});

export const contractMeasurementSummaryValidator = v.object({
  _id: v.id("contracts"),
  projectId: v.id("projects"),
  title: v.string(),
  valueCents: v.number(),
  notes: v.union(v.string(), v.null()),
  signedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  medicaoCount: v.number(),
  medidoCents: v.number(),
  aprovadoCents: v.number(),
  pagoCents: v.number(),
  saldoCents: v.number(),
});

export const contractBillingOverviewValidator = v.object({
  projectId: v.id("projects"),
  projectName: v.string(),
  projectSlug: v.string(),
  legacyNumber: v.union(v.number(), v.null()),
  client: v.union(v.string(), v.null()),
  contractCount: v.number(),
  contractTotalCents: v.number(),
  medidoCents: v.number(),
  aprovadoCents: v.number(),
  pagoCents: v.number(),
  saldoCents: v.number(),
});
