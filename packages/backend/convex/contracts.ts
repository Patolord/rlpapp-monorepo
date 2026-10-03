import { v } from "convex/values";
import { engineeringMutation, engineeringQuery } from "./lib/rbac";
import { contractDirection, contractKind } from "./schema";
import {
  createContract,
  deleteContractById,
  updateContract,
} from "./model/contracts/mutations";
import {
  getContractBillingOverview,
  getContractById,
  listBaseContractOptions,
  listContracts,
  listContractsForMeasurements,
  listUnassignedContractOptions,
} from "./model/contracts/queries";
import {
  baseContractOptionValidator,
  contractBillingOverviewValidator,
  contractDetailValidator,
  contractListItemValidator,
  contractMeasurementSummaryValidator,
  contractServiceItemInputValidator,
  unassignedContractOptionValidator,
} from "./model/contracts/validators";

export const list = engineeringQuery({
  args: {
    projectId: v.optional(v.id("projects")),
    direction: v.optional(contractDirection),
    search: v.optional(v.string()),
  },
  returns: v.array(contractListItemValidator),
  handler: async (ctx, args) => {
    return await listContracts(ctx, args);
  },
});

export const get = engineeringQuery({
  args: { contractId: v.id("contracts") },
  returns: v.union(contractDetailValidator, v.null()),
  handler: async (ctx, args) => {
    return await getContractById(ctx, args.contractId);
  },
});

export const listBaseOptions = engineeringQuery({
  args: {
    direction: contractDirection,
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    excludeContractId: v.optional(v.id("contracts")),
  },
  returns: v.array(baseContractOptionValidator),
  handler: async (ctx, args) => {
    return await listBaseContractOptions(ctx, args);
  },
});

export const listUnassignedOptions = engineeringQuery({
  args: {},
  returns: v.array(unassignedContractOptionValidator),
  handler: async (ctx) => {
    return await listUnassignedContractOptions(ctx);
  },
});

export const listForMedicoes = engineeringQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(contractMeasurementSummaryValidator),
  handler: async (ctx, args) => {
    return await listContractsForMeasurements(ctx, args.projectId);
  },
});

export const create = engineeringMutation({
  args: {
    title: v.string(),
    direction: contractDirection,
    kind: contractKind,
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    parentContractId: v.optional(v.union(v.id("contracts"), v.null())),
    customerId: v.optional(v.union(v.id("customers"), v.null())),
    contractorId: v.optional(v.union(v.id("contractors"), v.null())),
    notes: v.optional(v.string()),
    signedAt: v.optional(v.number()),
    serviceItems: v.array(contractServiceItemInputValidator),
  },
  returns: v.id("contracts"),
  handler: async (ctx, args) => {
    return await createContract(ctx, ctx.user, args);
  },
});

export const update = engineeringMutation({
  args: {
    contractId: v.id("contracts"),
    title: v.optional(v.string()),
    direction: v.optional(contractDirection),
    kind: v.optional(contractKind),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    parentContractId: v.optional(v.union(v.id("contracts"), v.null())),
    customerId: v.optional(v.union(v.id("customers"), v.null())),
    contractorId: v.optional(v.union(v.id("contractors"), v.null())),
    notes: v.optional(v.string()),
    signedAt: v.optional(v.union(v.number(), v.null())),
    serviceItems: v.optional(v.array(contractServiceItemInputValidator)),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updateContract(ctx, ctx.user, args);
    return null;
  },
});

export const remove = engineeringMutation({
  args: { contractId: v.id("contracts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deleteContractById(ctx, ctx.user, args.contractId);
    return null;
  },
});

export const getBillingOverview = engineeringQuery({
  args: {},
  returns: v.array(contractBillingOverviewValidator),
  handler: async (ctx) => {
    return await getContractBillingOverview(ctx);
  },
});
