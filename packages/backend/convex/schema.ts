import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Receipt states (RFC §4.1)
export const receiptStatus = v.union(
  v.literal("PendingReceipt"),
  v.literal("Accepted"),
  v.literal("Returned"),
  v.literal("Discarded")
);

// Shipment states (RFC §4.2)
export const shipmentStatus = v.union(
  v.literal("RegisteredOut"),
  v.literal("PendingShipment"),
  v.literal("DeliveredConfirmed"),
  v.literal("CanceledBeforeLeave"),
  v.literal("ReversalApplied")
);

// Inventory event types (RFC §4.3)
export const inventoryEventType = v.union(
  v.literal("RegisteredIn"),
  v.literal("RegisteredOut"),
  v.literal("Reversal"),
  v.literal("InventoryAdjust")
);

// Reference type for inventory events
export const refType = v.union(
  v.literal("receipt"),
  v.literal("shipment"),
  v.literal("adjustment")
);

// Cost source for receipt lines and cost events
export const costSource = v.union(
  v.literal("supplier_last"),
  v.literal("material_avg"),
  v.literal("manual"),
  v.literal("unknown")
);

// --- Financeiro validators ---

export const contaPagarStatus = v.union(
  v.literal("Pendente"),
  v.literal("Aprovado"),
  v.literal("Pago"),
  v.literal("Vencido"),
  v.literal("Cancelado")
);

export const formaPagamento = v.union(
  v.literal("pix"),
  v.literal("ted"),
  v.literal("boleto"),
  v.literal("dinheiro"),
  v.literal("cartao")
);

export const categoriaTipo = v.union(
  v.literal("despesa"),
  v.literal("receita"),
  v.literal("ambos")
);

export const tipoConta = v.union(
  v.literal("corrente"),
  v.literal("poupanca")
);

export const aprovacaoStatus = v.union(
  v.literal("aprovado"),
  v.literal("rejeitado")
);

export const contaReceberStatus = v.union(
  v.literal("Emitido"),
  v.literal("Parcial"),
  v.literal("Recebido"),
  v.literal("Vencido"),
  v.literal("Cancelado")
);

export const transacaoTipo = v.union(
  v.literal("credito"),
  v.literal("debito")
);

export const conciliacaoStatus = v.union(
  v.literal("pendente"),
  v.literal("conciliado"),
  v.literal("ignorado")
);

// --- Material request validators ---

export const materialRequestStatus = v.union(
  v.literal("Pendente"),
  v.literal("Aprovado"),
  v.literal("Rejeitado"),
  v.literal("Convertido")
);

export const materialRequestUrgency = v.union(
  v.literal("normal"),
  v.literal("urgente"),
  v.literal("critico")
);

// User roles
export const userRoles = v.union(
  v.literal("director"),
  v.literal("admin"),
  v.literal("manager"),
  v.literal("operator")
);

// Department types
export const departments = v.union(
  v.literal("estoque"),
  v.literal("financeiro"),
  v.literal("rh"),
  v.literal("engenharia")
);

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    role: userRoles,
    department: v.optional(departments),
    phone: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    lastLoginAt: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_role", ["role"])
    .index("by_active", ["isActive"]),

  products: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    unit: v.string(),
    minQuantity: v.number(),
    isActive: v.boolean(),
  })
    .index("by_name", ["name"])
    .index("by_active", ["isActive"]),

  suppliers: defineTable({
    name: v.string(),
    contactName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    isActive: v.boolean(),
  })
    .index("by_name", ["name"])
    .index("by_active", ["isActive"]),

  sites: defineTable({
    name: v.string(),
    address: v.optional(v.string()),
    responsibleName: v.optional(v.string()),
    responsiblePhone: v.optional(v.string()),
    isActive: v.boolean(),
  })
    .index("by_name", ["name"])
    .index("by_active", ["isActive"]),

  // --- RFC-0001 tables ---

  receipts: defineTable({
    status: receiptStatus,
    supplierId: v.optional(v.id("suppliers")),
    sourceType: v.optional(v.string()),
    notes: v.optional(v.string()),
    userId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"]),

  receiptLines: defineTable({
    receiptId: v.id("receipts"),
    productId: v.id("products"),
    qty: v.number(),
    countedQty: v.optional(v.number()),
    unitCost: v.optional(v.number()),
    costSource: v.optional(costSource),
    isEstimated: v.optional(v.boolean()),
  })
    .index("by_receipt", ["receiptId"]),

  shipments: defineTable({
    status: shipmentStatus,
    toSiteId: v.id("sites"),
    notes: v.optional(v.string()),
    qrCodeData: v.optional(v.string()),
    userId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"])
    .index("by_site", ["toSiteId"]),

  shipmentLines: defineTable({
    shipmentId: v.id("shipments"),
    productId: v.id("products"),
    qty: v.number(),
    countedQty: v.optional(v.number()),
  })
    .index("by_shipment", ["shipmentId"]),

  inventoryEvents: defineTable({
    type: inventoryEventType,
    productId: v.id("products"),
    qtyDelta: v.number(),
    refType: refType,
    refId: v.string(),
    userId: v.string(),
    createdAt: v.number(),
  })
    .index("by_product", ["productId"])
    .index("by_type", ["type"])
    .index("by_created", ["createdAt"])
    .index("by_ref", ["refType", "refId"]),

  costEvents: defineTable({
    productId: v.id("products"),
    unitCost: v.number(),
    qty: v.number(),
    costSource: costSource,
    isEstimated: v.boolean(),
    inventoryEventId: v.optional(v.id("inventoryEvents")),
    createdAt: v.number(),
  })
    .index("by_product", ["productId"])
    .index("by_event", ["inventoryEventId"]),

  inventorySnapshot: defineTable({
    productId: v.id("products"),
    qtyOnHand: v.number(),
    avgCost: v.number(),
    totalValue: v.number(),
    updatedAt: v.number(),
  })
    .index("by_product", ["productId"]),

  // --- Delivery confirmations ---

  deliveryConfirmations: defineTable({
    shipmentId: v.id("shipments"),
    receiverName: v.string(),
    receivedAtSiteId: v.id("sites"),
    confirmedByUserId: v.string(),
    confirmedAt: v.number(),
    notes: v.optional(v.string()),
  })
    .index("by_shipment", ["shipmentId"])
    .index("by_site", ["receivedAtSiteId"])
    .index("by_confirmed", ["confirmedAt"])
    .index("by_user", ["confirmedByUserId"]),

  // --- Material requests ---

  materialRequests: defineTable({
    status: materialRequestStatus,
    siteId: v.id("sites"),
    reason: v.string(),
    urgency: materialRequestUrgency,
    dateNeeded: v.number(),
    requestedByUserId: v.string(),
    reviewedByUserId: v.optional(v.string()),
    reviewNotes: v.optional(v.string()),
    resultingShipmentId: v.optional(v.id("shipments")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_site", ["siteId"])
    .index("by_urgency", ["urgency"])
    .index("by_requested", ["requestedByUserId"])
    .index("by_created", ["createdAt"]),

  materialRequestLines: defineTable({
    requestId: v.id("materialRequests"),
    productId: v.id("products"),
    qty: v.number(),
    approvedQty: v.optional(v.number()),
  })
    .index("by_request", ["requestId"]),

  // --- Financeiro tables ---

  contasBancarias: defineTable({
    nome: v.string(),
    banco: v.string(),
    agencia: v.string(),
    conta: v.string(),
    tipo: tipoConta,
    saldoInicial: v.number(),
    isActive: v.boolean(),
  })
    .index("by_active", ["isActive"]),

  categoriasFinanceiras: defineTable({
    nome: v.string(),
    tipo: categoriaTipo,
    cor: v.optional(v.string()),
    icone: v.optional(v.string()),
    isActive: v.boolean(),
  })
    .index("by_tipo", ["tipo"])
    .index("by_active", ["isActive"]),

  contasPagar: defineTable({
    descricao: v.string(),
    valor: v.number(),
    dataVencimento: v.number(),
    dataPagamento: v.optional(v.number()),
    dataCompetencia: v.number(),
    status: contaPagarStatus,
    categoriaId: v.optional(v.id("categoriasFinanceiras")),
    fornecedorId: v.optional(v.id("suppliers")),
    contaBancariaId: v.optional(v.id("contasBancarias")),
    formaPagamento: v.optional(formaPagamento),
    recorrente: v.optional(v.boolean()),
    observacoes: v.optional(v.string()),
    userId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_vencimento", ["dataVencimento"])
    .index("by_categoria", ["categoriaId"])
    .index("by_fornecedor", ["fornecedorId"])
    .index("by_created", ["createdAt"]),

  aprovacoes: defineTable({
    contaPagarId: v.id("contasPagar"),
    aprovadorId: v.string(),
    status: aprovacaoStatus,
    observacao: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_conta", ["contaPagarId"]),

  clientes: defineTable({
    nome: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    documento: v.optional(v.string()),
    endereco: v.optional(v.string()),
    isActive: v.boolean(),
  })
    .index("by_name", ["nome"])
    .index("by_active", ["isActive"]),

  contasReceber: defineTable({
    descricao: v.string(),
    valor: v.number(),
    valorRecebido: v.number(),
    dataVencimento: v.number(),
    dataRecebimento: v.optional(v.number()),
    dataCompetencia: v.number(),
    dataEmissao: v.number(),
    status: contaReceberStatus,
    categoriaId: v.optional(v.id("categoriasFinanceiras")),
    clienteId: v.optional(v.id("clientes")),
    contaBancariaId: v.optional(v.id("contasBancarias")),
    formaPagamento: v.optional(formaPagamento),
    notaFiscal: v.optional(v.string()),
    observacoes: v.optional(v.string()),
    userId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_vencimento", ["dataVencimento"])
    .index("by_cliente", ["clienteId"])
    .index("by_categoria", ["categoriaId"])
    .index("by_created", ["createdAt"]),

  transacoesBancarias: defineTable({
    contaBancariaId: v.id("contasBancarias"),
    data: v.number(),
    descricao: v.string(),
    valor: v.number(),
    tipo: transacaoTipo,
    conciliacaoStatus: conciliacaoStatus,
    observacoes: v.optional(v.string()),
    userId: v.string(),
    createdAt: v.number(),
  })
    .index("by_conta", ["contaBancariaId"])
    .index("by_data", ["data"])
    .index("by_status", ["conciliacaoStatus"])
    .index("by_created", ["createdAt"]),

  conciliacoes: defineTable({
    transacaoBancariaId: v.id("transacoesBancarias"),
    contaPagarId: v.optional(v.id("contasPagar")),
    contaReceberId: v.optional(v.id("contasReceber")),
    userId: v.string(),
    createdAt: v.number(),
  })
    .index("by_transacao", ["transacaoBancariaId"])
    .index("by_contaPagar", ["contaPagarId"])
    .index("by_contaReceber", ["contaReceberId"]),

  // --- QR Code / Equipment tracking ---

  qrCodes: defineTable({
    token: v.string(),
    equipmentId: v.optional(v.id("equipment")),
    status: v.union(v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
  }).index("by_token", ["token"]),

  equipment: defineTable({
    tag: v.string(),
    type: v.string(),
    location: v.string(),
    status: v.union(
      v.literal("operational"),
      v.literal("warning"),
      v.literal("error")
    ),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_tag", ["tag"]),

  maintenanceLogs: defineTable({
    equipmentId: v.id("equipment"),
    technicianName: v.string(),
    notes: v.string(),
    status: v.union(
      v.literal("operational"),
      v.literal("warning"),
      v.literal("error")
    ),
    tests: v.optional(
      v.object({
        vacuum: v.boolean(),
        pressure: v.boolean(),
        communication: v.boolean(),
      })
    ),
    photoIds: v.array(v.id("_storage")),
    createdAt: v.number(),
  }).index("by_equipment", ["equipmentId"]),
});
