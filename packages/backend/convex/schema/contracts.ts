import { defineTable } from "convex/server";
import { v } from "convex/values";

// Clientes, empreiteiros, contratos e medições.

// Como o valor da medição foi determinado (flexível para bases futuras).
export const medicaoBasis = v.union(
  v.literal("percentual"),
  v.literal("valor_fixo"),
  v.literal("progresso_equipamentos")
);

// Fluxo: rascunho → aprovada → paga.
export const medicaoStatus = v.union(
  v.literal("rascunho"),
  v.literal("aprovada"),
  v.literal("paga")
);

/** Direção do contrato: venda de serviço ao cliente ou contratação de empreiteiro. */

export const contractDirection = v.union(
  v.literal("client_sale"),
  v.literal("contractor_hire")
);

/** Classificação do contrato: base (principal) ou aditivo. */

export const contractKind = v.union(
  v.literal("base"),
  v.literal("addendum")
);

export const contractsTables = {
  customers: defineTable({
    name: v.string(),
    nameNormalized: v.string(),
    personType: v.optional(
      v.union(v.literal("pf"), v.literal("pj"))
    ),
    legalName: v.optional(v.string()),
    taxId: v.optional(v.string()),
    taxIdNormalized: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
    active: v.boolean(),
    archivedAt: v.optional(v.number()),
    archivedByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    createdByUserId: v.optional(v.id("users")),
    updatedByUserId: v.optional(v.id("users")),
  })
    .index("by_name_normalized", ["nameNormalized"])
    .index("by_tax_id_normalized", ["taxIdNormalized"])
    .index("by_active", ["active"]),
  customerContacts: defineTable({
    customerId: v.id("customers"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    role: v.optional(v.string()),
    // Optional during the legacy backfill; missing values are treated as active.
    active: v.optional(v.boolean()),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_customer", ["customerId"])
    .index("by_customer_and_active", ["customerId", "active"]),
  contractors: defineTable({
    name: v.string(),
    nameNormalized: v.string(),
    personType: v.optional(v.union(v.literal("pf"), v.literal("pj"))),
    legalName: v.optional(v.string()),
    taxId: v.optional(v.string()),
    taxIdNormalized: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
    active: v.boolean(),
    archivedAt: v.optional(v.number()),
    archivedByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    createdByUserId: v.optional(v.id("users")),
    updatedByUserId: v.optional(v.id("users")),
  })
    .index("by_name_normalized", ["nameNormalized"])
    .index("by_tax_id_normalized", ["taxIdNormalized"])
    .index("by_active", ["active"]),
  contractorContacts: defineTable({
    contractorId: v.id("contractors"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    role: v.optional(v.string()),
    active: v.optional(v.boolean()),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_contractor", ["contractorId"])
    .index("by_contractor_and_active", ["contractorId", "active"]),

  // --- Engenharia: Contratos e Medições ---
  // Registro unificado: venda ao cliente ou contratação de empreiteiro.
  // Pode ou não estar vinculado a uma obra. Valor total é a soma dos itens
  // de serviço (valueCents denormalizado).
  // Campos novos são opcionais durante o backfill; documentos legados sem
  // `direction` são tratados como client_sale.
  // Nota: futuramente o saldo do contrato também será abatido por compras de
  // material atribuídas à obra (ainda não rastreado).
  contracts: defineTable({
    projectId: v.optional(v.id("projects")),
    direction: v.optional(contractDirection),
    kind: v.optional(contractKind),
    parentContractId: v.optional(v.id("contracts")),
    customerId: v.optional(v.id("customers")),
    contractorId: v.optional(v.id("contractors")),
    title: v.string(),
    valueCents: v.number(),
    notes: v.optional(v.string()),
    signedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    createdByUserId: v.optional(v.id("users")),
    updatedByUserId: v.optional(v.id("users")),
  })
    .index("by_project", ["projectId"])
    .index("by_customer", ["customerId"])
    .index("by_contractor", ["contractorId"])
    .index("by_direction", ["direction"])
    .index("by_parent", ["parentContractId"]),
  contractServiceItems: defineTable({
    contractId: v.id("contracts"),
    description: v.string(),
    valueCents: v.number(),
    order: v.number(),
    createdAt: v.number(),
  }).index("by_contract", ["contractId"]),
  // Medição: cobrança por serviços realizados, vinculada a um contrato
  // de venda ao cliente com obra (client_sale + projectId).
  medicoes: defineTable({
    projectId: v.id("projects"),
    contractId: v.id("contracts"),
    // Nº sequencial da medição dentro do contrato (Medição nº 1, 2, ...).
    sequence: v.number(),
    description: v.optional(v.string()),
    basis: medicaoBasis,
    // Percentual usado quando basis = percentual / progresso_equipamentos.
    percent: v.optional(v.number()),
    // Valor cobrado — sempre a fonte de verdade, independente da base.
    amountCents: v.number(),
    status: medicaoStatus,
    // Data de referência da medição (período/competência).
    referenceDate: v.number(),
    approvedAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_contract", ["contractId"]),
};
