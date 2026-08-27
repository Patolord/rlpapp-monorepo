import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { resolveCustomerLabel } from "../../lib/projects/helpers";
import {
  assertContractEligibleForMeasurement,
  resolveContractDirection,
  resolveContractKind,
  type ContractDirection,
} from "./rules";
import { listContractServiceItems } from "./serviceItems";

type ContractRowCaches = {
  projects: Map<Id<"projects">, Doc<"projects"> | null>;
  customers: Map<Id<"customers">, string | null>;
  contractors: Map<Id<"contractors">, string | null>;
  parents: Map<Id<"contracts">, string | null>;
};

function createContractRowCaches(): ContractRowCaches {
  return {
    projects: new Map(),
    customers: new Map(),
    contractors: new Map(),
    parents: new Map(),
  };
}

async function resolveContractRow(
  ctx: QueryCtx,
  contract: Doc<"contracts">,
  caches: ContractRowCaches
) {
  let projectName: string | null = null;
  let projectSlug: string | null = null;
  if (contract.projectId) {
    let project = caches.projects.get(contract.projectId);
    if (project === undefined) {
      project = await ctx.db.get("projects", contract.projectId);
      caches.projects.set(contract.projectId, project);
    }
    projectName = project?.name ?? null;
    projectSlug = project?.slug ?? project?._id ?? null;
  }

  let customerName: string | null = null;
  if (contract.customerId) {
    if (!caches.customers.has(contract.customerId)) {
      const customer = await ctx.db.get("customers", contract.customerId);
      caches.customers.set(contract.customerId, customer?.name ?? null);
    }
    customerName = caches.customers.get(contract.customerId) ?? null;
  }

  let contractorName: string | null = null;
  if (contract.contractorId) {
    if (!caches.contractors.has(contract.contractorId)) {
      const contractor = await ctx.db.get("contractors", contract.contractorId);
      caches.contractors.set(contract.contractorId, contractor?.name ?? null);
    }
    contractorName = caches.contractors.get(contract.contractorId) ?? null;
  }

  let parentTitle: string | null = null;
  if (contract.parentContractId) {
    if (!caches.parents.has(contract.parentContractId)) {
      const parent = await ctx.db.get("contracts", contract.parentContractId);
      caches.parents.set(contract.parentContractId, parent?.title ?? null);
    }
    parentTitle = caches.parents.get(contract.parentContractId) ?? null;
  }

  const serviceItems = await listContractServiceItems(ctx, contract._id);
  return {
    _id: contract._id,
    projectId: contract.projectId ?? null,
    projectName,
    projectSlug,
    direction: resolveContractDirection(contract),
    kind: resolveContractKind(contract),
    parentContractId: contract.parentContractId ?? null,
    parentTitle,
    customerId: contract.customerId ?? null,
    customerName,
    contractorId: contract.contractorId ?? null,
    contractorName,
    title: contract.title,
    valueCents: contract.valueCents,
    notes: contract.notes ?? null,
    signedAt: contract.signedAt ?? null,
    serviceItemCount: serviceItems.length,
    serviceItems,
    createdAt: contract.createdAt,
    updatedAt: contract.updatedAt ?? null,
  };
}

export async function listContracts(
  ctx: QueryCtx,
  args: {
    projectId?: Id<"projects">;
    direction?: ContractDirection;
    search?: string;
  }
) {
  let contracts: Doc<"contracts">[];
  if (args.projectId) {
    contracts = await ctx.db
      .query("contracts")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  } else if (args.direction) {
    contracts = await ctx.db
      .query("contracts")
      .withIndex("by_direction", (q) => q.eq("direction", args.direction))
      .collect();
    if (args.direction === "client_sale") {
      const allContracts = await ctx.db.query("contracts").collect();
      const resultIds = new Set(contracts.map((contract) => contract._id));
      for (const contract of allContracts) {
        if (contract.direction === undefined && !resultIds.has(contract._id)) {
          contracts.push(contract);
        }
      }
    }
  } else {
    contracts = await ctx.db.query("contracts").order("desc").collect();
  }

  if (args.direction && args.projectId) {
    contracts = contracts.filter(
      (contract) => resolveContractDirection(contract) === args.direction
    );
  }

  const caches = createContractRowCaches();
  const rows = await Promise.all(
    contracts.map(async (contract) => {
      const row = await resolveContractRow(ctx, contract, caches);
      const { serviceItems: _serviceItems, ...listRow } = row;
      return listRow;
    })
  );

  const searchTerm = args.search?.trim().toLowerCase();
  const filteredRows = searchTerm
    ? rows.filter((row) =>
        [
          row.title,
          row.customerName,
          row.contractorName,
          row.projectName,
          row.parentTitle,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(searchTerm)
      )
    : rows;

  filteredRows.sort((a, b) => b.createdAt - a.createdAt);
  return filteredRows;
}

export async function getContractById(
  ctx: QueryCtx,
  contractId: Id<"contracts">
) {
  const contract = await ctx.db.get("contracts", contractId);
  if (!contract) return null;
  return await resolveContractRow(ctx, contract, createContractRowCaches());
}

export async function listBaseContractOptions(
  ctx: QueryCtx,
  args: {
    direction: ContractDirection;
    projectId?: Id<"projects"> | null;
    excludeContractId?: Id<"contracts">;
  }
) {
  let contracts: Doc<"contracts">[];
  if (args.projectId) {
    contracts = await ctx.db
      .query("contracts")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
      .collect();
  } else {
    contracts = await ctx.db.query("contracts").collect();
    contracts = contracts.filter((contract) => !contract.projectId);
  }

  return contracts
    .filter((contract) => {
      if (
        args.excludeContractId &&
        contract._id === args.excludeContractId
      ) {
        return false;
      }
      return (
        resolveContractDirection(contract) === args.direction &&
        resolveContractKind(contract) === "base"
      );
    })
    .map((contract) => ({
      _id: contract._id,
      title: contract.title,
      valueCents: contract.valueCents,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
}

export async function listUnassignedContractOptions(ctx: QueryCtx) {
  const contracts = await ctx.db
    .query("contracts")
    .withIndex("by_project", (q) => q.eq("projectId", undefined))
    .take(100);

  const customerNames = new Map<Id<"customers">, string | null>();
  const contractorNames = new Map<Id<"contractors">, string | null>();
  for (const contract of contracts) {
    if (contract.customerId && !customerNames.has(contract.customerId)) {
      const customer = await ctx.db.get("customers", contract.customerId);
      customerNames.set(contract.customerId, customer?.name ?? null);
    }
    if (contract.contractorId && !contractorNames.has(contract.contractorId)) {
      const contractor = await ctx.db.get("contractors", contract.contractorId);
      contractorNames.set(contract.contractorId, contractor?.name ?? null);
    }
  }

  return contracts
    .map((contract) => ({
      _id: contract._id,
      title: contract.title,
      direction: resolveContractDirection(contract),
      valueCents: contract.valueCents,
      customerName: contract.customerId
        ? (customerNames.get(contract.customerId) ?? null)
        : null,
      contractorName: contract.contractorId
        ? (contractorNames.get(contract.contractorId) ?? null)
        : null,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
}

function summarizeMeasurements(measurements: Doc<"medicoes">[]) {
  let measuredCents = 0;
  let approvedCents = 0;
  let paidCents = 0;
  for (const measurement of measurements) {
    measuredCents += measurement.amountCents;
    if (measurement.status === "aprovada") {
      approvedCents += measurement.amountCents;
    }
    if (measurement.status === "paga") paidCents += measurement.amountCents;
  }
  return { measuredCents, approvedCents, paidCents };
}

export async function listContractsForMeasurements(
  ctx: QueryCtx,
  projectId: Id<"projects">
) {
  const contracts = await ctx.db
    .query("contracts")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  const eligibleContracts = contracts.filter((contract) => {
    try {
      assertContractEligibleForMeasurement(contract);
      return true;
    } catch {
      return false;
    }
  });

  return await Promise.all(
    eligibleContracts.map(async (contract) => {
      const measurements = await ctx.db
        .query("medicoes")
        .withIndex("by_contract", (q) => q.eq("contractId", contract._id))
        .collect();
      const { measuredCents, approvedCents, paidCents } =
        summarizeMeasurements(measurements);
      return {
        _id: contract._id,
        projectId,
        title: contract.title,
        valueCents: contract.valueCents,
        notes: contract.notes ?? null,
        signedAt: contract.signedAt ?? null,
        createdAt: contract.createdAt,
        medicaoCount: measurements.length,
        medidoCents: measuredCents,
        aprovadoCents: approvedCents,
        pagoCents: paidCents,
        saldoCents: contract.valueCents - measuredCents,
      };
    })
  );
}

export async function getContractBillingOverview(ctx: QueryCtx) {
  const projects = await ctx.db.query("projects").order("desc").collect();
  const customerLabelCache = new Map<string, string | null>();

  return await Promise.all(
    projects.map(async (project) => {
      const contracts = await ctx.db
        .query("contracts")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect();
      const eligibleContracts = contracts.filter((contract) => {
        try {
          assertContractEligibleForMeasurement(contract);
          return true;
        } catch {
          return false;
        }
      });
      const measurements = await ctx.db
        .query("medicoes")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect();

      const contractTotalCents = eligibleContracts.reduce(
        (sum, contract) => sum + contract.valueCents,
        0
      );
      const { measuredCents, approvedCents, paidCents } =
        summarizeMeasurements(measurements);

      return {
        projectId: project._id,
        projectName: project.name,
        projectSlug: project.slug ?? project._id,
        legacyNumber: project.legacyNumber ?? null,
        client: await resolveCustomerLabel(ctx, project, customerLabelCache),
        contractCount: eligibleContracts.length,
        contractTotalCents,
        medidoCents: measuredCents,
        aprovadoCents: approvedCents,
        pagoCents: paidCents,
        saldoCents: contractTotalCents - measuredCents,
      };
    })
  );
}
