import { v } from "convex/values";
import { engineeringMutation, engineeringQuery } from "./lib/rbac";
import { contractDirection, contractKind } from "./schema";
import { logAudit } from "./lib/audit";
import { resolveCustomerLabel } from "./lib/projects/helpers";
import {
  assertEligibleForMedicao,
  assertParentContract,
  assertValidCounterparty,
  deleteContractServiceItems,
  listServiceItems,
  replaceContractServiceItems,
  resolveContractDirection,
  resolveContractKind,
  serviceItemInputValidator,
  serviceItemValidator,
  type ContractDirection,
  type ContractKind,
} from "./lib/contracts/helpers";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

const contractListItemValidator = v.object({
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

const contractDetailValidator = v.object({
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
  serviceItems: v.array(serviceItemValidator),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
});

async function resolveContractRow(
  ctx: QueryCtx,
  contract: Doc<"contracts">,
  caches: {
    projects: Map<Id<"projects">, Doc<"projects"> | null>;
    customers: Map<Id<"customers">, string | null>;
    contractors: Map<Id<"contractors">, string | null>;
    parents: Map<Id<"contracts">, string | null>;
  }
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

  const serviceItems = await listServiceItems(ctx, contract._id);

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

function emptyCaches() {
  return {
    projects: new Map<Id<"projects">, Doc<"projects"> | null>(),
    customers: new Map<Id<"customers">, string | null>(),
    contractors: new Map<Id<"contractors">, string | null>(),
    parents: new Map<Id<"contracts">, string | null>(),
  };
}

export const list = engineeringQuery({
  args: {
    projectId: v.optional(v.id("projects")),
    direction: v.optional(contractDirection),
    search: v.optional(v.string()),
  },
  returns: v.array(contractListItemValidator),
  handler: async (ctx, args) => {
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
      // Include legacy rows without direction when filtering client_sale.
      if (args.direction === "client_sale") {
        const all = await ctx.db.query("contracts").collect();
        const legacy = all.filter((c) => c.direction === undefined);
        const ids = new Set(contracts.map((c) => c._id));
        for (const c of legacy) {
          if (!ids.has(c._id)) contracts.push(c);
        }
      }
    } else {
      contracts = await ctx.db.query("contracts").order("desc").collect();
    }

    if (args.direction && args.projectId) {
      contracts = contracts.filter(
        (c) => resolveContractDirection(c) === args.direction
      );
    }

    const caches = emptyCaches();
    const rows = await Promise.all(
      contracts.map(async (contract) => {
        const row = await resolveContractRow(ctx, contract, caches);
        const { serviceItems: _items, ...listRow } = row;
        return listRow;
      })
    );

    const term = args.search?.trim().toLowerCase();
    const filtered = term
      ? rows.filter((row) => {
          const haystack = [
            row.title,
            row.customerName,
            row.contractorName,
            row.projectName,
            row.parentTitle,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(term);
        })
      : rows;

    filtered.sort((a, b) => b.createdAt - a.createdAt);
    return filtered;
  },
});

export const get = engineeringQuery({
  args: { contractId: v.id("contracts") },
  returns: v.union(contractDetailValidator, v.null()),
  handler: async (ctx, args) => {
    const contract = await ctx.db.get("contracts", args.contractId);
    if (!contract) return null;
    return await resolveContractRow(ctx, contract, emptyCaches());
  },
});

export const listBaseOptions = engineeringQuery({
  args: {
    direction: contractDirection,
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    excludeContractId: v.optional(v.id("contracts")),
  },
  returns: v.array(
    v.object({
      _id: v.id("contracts"),
      title: v.string(),
      valueCents: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    let contracts: Doc<"contracts">[];
    if (args.projectId) {
      contracts = await ctx.db
        .query("contracts")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
        .collect();
    } else {
      contracts = await ctx.db.query("contracts").collect();
      contracts = contracts.filter((c) => !c.projectId);
    }

    return contracts
      .filter((c) => {
        if (args.excludeContractId && c._id === args.excludeContractId) {
          return false;
        }
        if (resolveContractDirection(c) !== args.direction) return false;
        return resolveContractKind(c) === "base";
      })
      .map((c) => ({
        _id: c._id,
        title: c.title,
        valueCents: c.valueCents,
      }))
      .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  },
});

/** Contratos elegíveis para medições (venda ao cliente + obra). */
export const listForMedicoes = engineeringQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
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
    })
  ),
  handler: async (ctx, args) => {
    const contracts = await ctx.db
      .query("contracts")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const eligible = contracts.filter((c) => {
      try {
        assertEligibleForMedicao(c);
        return true;
      } catch {
        return false;
      }
    });

    return await Promise.all(
      eligible.map(async (contract) => {
        const medicoes = await ctx.db
          .query("medicoes")
          .withIndex("by_contract", (q) => q.eq("contractId", contract._id))
          .collect();
        let medidoCents = 0;
        let aprovadoCents = 0;
        let pagoCents = 0;
        for (const m of medicoes) {
          medidoCents += m.amountCents;
          if (m.status === "aprovada") aprovadoCents += m.amountCents;
          if (m.status === "paga") pagoCents += m.amountCents;
        }
        return {
          _id: contract._id,
          projectId: args.projectId,
          title: contract.title,
          valueCents: contract.valueCents,
          notes: contract.notes ?? null,
          signedAt: contract.signedAt ?? null,
          createdAt: contract.createdAt,
          medicaoCount: medicoes.length,
          medidoCents,
          aprovadoCents,
          pagoCents,
          saldoCents: contract.valueCents - medidoCents,
        };
      })
    );
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
    serviceItems: v.array(serviceItemInputValidator),
  },
  returns: v.id("contracts"),
  handler: async (ctx, args) => {
    const title = args.title.trim();
    if (!title) throw new Error("Informe o título do contrato");

    const direction = args.direction as ContractDirection;
    const kind = args.kind as ContractKind;
    const projectId = args.projectId ?? undefined;
    const customerId = args.customerId ?? undefined;
    const contractorId = args.contractorId ?? undefined;
    const parentContractId = args.parentContractId ?? undefined;

    assertValidCounterparty({ direction, customerId, contractorId });
    await assertParentContract(ctx, {
      kind,
      parentContractId,
      projectId,
      direction,
    });

    if (projectId) {
      const project = await ctx.db.get("projects", projectId);
      if (!project) throw new Error("Obra não encontrada");
    }
    if (customerId) {
      const customer = await ctx.db.get("customers", customerId);
      if (!customer || customer.archivedAt) {
        throw new Error("Cliente não encontrado ou arquivado");
      }
    }
    if (contractorId) {
      const contractor = await ctx.db.get("contractors", contractorId);
      if (!contractor || contractor.archivedAt) {
        throw new Error("Empreiteiro não encontrado ou arquivado");
      }
    }

    const now = Date.now();
    const contractId = await ctx.db.insert("contracts", {
      projectId,
      direction,
      kind,
      parentContractId,
      customerId,
      contractorId,
      title,
      valueCents: 0,
      notes: args.notes?.trim() || undefined,
      signedAt: args.signedAt,
      createdAt: now,
      updatedAt: now,
      createdByUserId: ctx.user._id,
      updatedByUserId: ctx.user._id,
    });

    const valueCents = await replaceContractServiceItems(
      ctx,
      contractId,
      args.serviceItems
    );
    await ctx.db.patch("contracts", contractId, { valueCents });

    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "contracts",
      recordId: contractId,
      details: `Contrato "${title}" (${direction}, ${kind}) criado`,
    });

    return contractId;
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
    serviceItems: v.optional(v.array(serviceItemInputValidator)),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const contract = await ctx.db.get("contracts", args.contractId);
    if (!contract) throw new Error("Contrato não encontrado");

    const direction =
      (args.direction as ContractDirection | undefined) ??
      resolveContractDirection(contract);
    const kind =
      (args.kind as ContractKind | undefined) ?? resolveContractKind(contract);
    const projectId =
      args.projectId !== undefined
        ? (args.projectId ?? undefined)
        : contract.projectId;
    const customerId =
      args.customerId !== undefined
        ? (args.customerId ?? undefined)
        : contract.customerId;
    const contractorId =
      args.contractorId !== undefined
        ? (args.contractorId ?? undefined)
        : contract.contractorId;
    const parentContractId =
      args.parentContractId !== undefined
        ? (args.parentContractId ?? undefined)
        : contract.parentContractId;

    assertValidCounterparty({ direction, customerId, contractorId });
    await assertParentContract(ctx, {
      kind,
      parentContractId,
      projectId,
      direction,
      excludeId: args.contractId,
    });

    if (projectId) {
      const project = await ctx.db.get("projects", projectId);
      if (!project) throw new Error("Obra não encontrada");
    }
    if (customerId) {
      const customer = await ctx.db.get("customers", customerId);
      if (!customer || customer.archivedAt) {
        throw new Error("Cliente não encontrado ou arquivado");
      }
    }
    if (contractorId) {
      const contractor = await ctx.db.get("contractors", contractorId);
      if (!contractor || contractor.archivedAt) {
        throw new Error("Empreiteiro não encontrado ou arquivado");
      }
    }

    // Se deixar de ser elegível para medições, bloquear se já houver medições.
    const wouldBeEligible =
      direction === "client_sale" && projectId !== undefined;
    if (!wouldBeEligible) {
      const medicao = await ctx.db
        .query("medicoes")
        .withIndex("by_contract", (q) => q.eq("contractId", args.contractId))
        .first();
      if (medicao) {
        throw new Error(
          "Contrato possui medições — mantenha-o como venda ao cliente vinculado à obra"
        );
      }
    }

    const patch: Partial<Doc<"contracts">> = {
      direction,
      kind,
      projectId,
      parentContractId,
      customerId,
      contractorId,
      updatedAt: Date.now(),
      updatedByUserId: ctx.user._id,
    };

    if (args.title !== undefined) {
      const title = args.title.trim();
      if (!title) throw new Error("Informe o título do contrato");
      patch.title = title;
    }
    if (args.notes !== undefined) patch.notes = args.notes.trim() || undefined;
    if (args.signedAt !== undefined) patch.signedAt = args.signedAt ?? undefined;

    if (args.serviceItems !== undefined) {
      patch.valueCents = await replaceContractServiceItems(
        ctx,
        args.contractId,
        args.serviceItems
      );
    }

    await ctx.db.patch("contracts", args.contractId, patch);

    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "contracts",
      recordId: args.contractId,
    });

    return null;
  },
});

export const remove = engineeringMutation({
  args: { contractId: v.id("contracts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const contract = await ctx.db.get("contracts", args.contractId);
    if (!contract) throw new Error("Contrato não encontrado");

    const medicao = await ctx.db
      .query("medicoes")
      .withIndex("by_contract", (q) => q.eq("contractId", args.contractId))
      .first();
    if (medicao) {
      throw new Error(
        "Não é possível excluir: o contrato possui medições. Exclua as medições primeiro."
      );
    }

    const child = await ctx.db
      .query("contracts")
      .withIndex("by_parent", (q) => q.eq("parentContractId", args.contractId))
      .first();
    if (child) {
      throw new Error(
        "Não é possível excluir: existem aditivos vinculados a este contrato"
      );
    }

    await deleteContractServiceItems(ctx, args.contractId);
    await ctx.db.delete("contracts", args.contractId);

    await logAudit(ctx, ctx.user, {
      action: "delete",
      tableName: "contracts",
      recordId: args.contractId,
      details: `Contrato "${contract.title}" excluído`,
    });

    return null;
  },
});

/** Visão financeira por obra (apenas contratos elegíveis para medição). */
export const getBillingOverview = engineeringQuery({
  args: {},
  returns: v.array(
    v.object({
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
    })
  ),
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").order("desc").collect();
    const customerLabelCache = new Map<string, string | null>();

    return await Promise.all(
      projects.map(async (project) => {
        const contracts = await ctx.db
          .query("contracts")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect();
        const eligible = contracts.filter((c) => {
          try {
            assertEligibleForMedicao(c);
            return true;
          } catch {
            return false;
          }
        });
        const medicoes = await ctx.db
          .query("medicoes")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect();

        const contractTotalCents = eligible.reduce(
          (sum, c) => sum + c.valueCents,
          0
        );
        let medidoCents = 0;
        let aprovadoCents = 0;
        let pagoCents = 0;
        for (const m of medicoes) {
          medidoCents += m.amountCents;
          if (m.status === "aprovada") aprovadoCents += m.amountCents;
          if (m.status === "paga") pagoCents += m.amountCents;
        }

        return {
          projectId: project._id,
          projectName: project.name,
          projectSlug: project.slug ?? project._id,
          legacyNumber: project.legacyNumber ?? null,
          client: await resolveCustomerLabel(ctx, project, customerLabelCache),
          contractCount: eligible.length,
          contractTotalCents,
          medidoCents,
          aprovadoCents,
          pagoCents,
          saldoCents: contractTotalCents - medidoCents,
        };
      })
    );
  },
});
