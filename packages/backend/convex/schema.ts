import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// User roles
export const userRoles = v.union(
  v.literal("director"),
  v.literal("admin"),
  v.literal("manager"),
  v.literal("operator"),
  // Acesso restrito à área de engenharia (equipamentos, QR codes, manutenções)
  v.literal("engenheiro"),
  // Acesso restrito: só interage com equipamentos via página pública /q/$token
  v.literal("qr_operator"),
  // Acesso somente-leitura ao portal do cliente (obras atribuídas).
  v.literal("client")
);

// Status da obra (ciclo de vida do projeto).
export const projectStatus = v.union(
  v.literal("planning"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("paused")
);

// Department types
export const departments = v.union(
  v.literal("rh"),
  v.literal("engenharia"),
  v.literal("compras")
);

// --- Compras / Materiais / Preços ---

export const materialStatus = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("duplicate"),
  v.literal("archived")
);

export const takeoffStatus = v.union(
  v.literal("draft"),
  v.literal("pricing"),
  v.literal("quoted"),
  v.literal("approved"),
  v.literal("archived")
);

export const takeoffItemStatus = v.union(
  v.literal("draft"),
  v.literal("needs_review"),
  v.literal("matched"),
  v.literal("sent_to_supplier"),
  v.literal("quoted"),
  v.literal("selected"),
  v.literal("purchased")
);

export const priceEventSource = v.union(
  v.literal("manual"),
  v.literal("quote"),
  v.literal("purchase"),
  v.literal("invoice"),
  v.literal("whatsapp"),
  v.literal("supplier_form"),
  v.literal("excel_import")
);

export const priceEventReviewStatus = v.union(
  v.literal("unreviewed"),
  v.literal("reviewed"),
  v.literal("ignored"),
  v.literal("duplicate")
);

export default defineSchema({
  users: defineTable({
    name: v.string(),
    // Email é opcional: usuários podem ser criados apenas com username no Clerk.
    email: v.optional(v.string()),
    username: v.optional(v.string()),
    // Clerk user ID (subject do JWT). Optional para usuários criados antes do webhook.
    clerkId: v.optional(v.string()),
    role: userRoles,
    department: v.optional(departments),
    phone: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    lastLoginAt: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_clerkId", ["clerkId"])
    .index("by_role", ["role"])
    .index("by_active", ["isActive"]),

  // --- QR Code / Equipment tracking ---

  qrCodes: defineTable({
    token: v.string(),
    equipmentId: v.optional(v.id("equipment")),
    status: v.union(v.literal("active"), v.literal("inactive")),
    batchId: v.optional(v.string()),
    batchName: v.optional(v.string()),
    // Denormalizado: obra do item planejado vinculado (via equipment →
    // projectEquipment). Mantido em sincronia pelas mutations de vínculo.
    projectId: v.optional(v.id("projects")),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_batchId", ["batchId"])
    .index("by_batchName", ["batchName"])
    .index("by_equipment", ["equipmentId"])
    .index("by_project", ["projectId"]),

  // --- Obras / Relatórios (substitui a planilha "Tabela Global de Equipamentos") ---
  //
  // Hierarquia: Obra → Andar → Apartamento (projectUnits) → Sistema → Equipamento
  // planejado (projectEquipment). Cada item planejado pode ser vinculado a um
  // equipamento real (QR) → verde/instalado quando vinculado, vermelho/pendente
  // quando não.

  // Obra (prédio): nome + metadados + lista de andares (legado) + torres.
  //
  // Hierarquia nova: Obra → Torre → Andar → Ambiente → Equipamento.
  // O array `floors` é mantido por compatibilidade com obras antigas que usam
  // o caminho projectUnits; obras novas usam as tabelas towers/floors/environments.
  projects: defineTable({
    name: v.string(),
    // Metadados da obra (todos opcionais para compatibilidade com dados antigos).
    client: v.optional(v.string()),
    address: v.optional(v.string()),
    status: v.optional(projectStatus),
    responsibleId: v.optional(v.id("users")),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    // Clientes (role "client") que podem visualizar esta obra no portal.
    clientIds: v.optional(v.array(v.id("users"))),
    floors: v.array(
      v.object({
        // 0 = térreo, 1 = 1º andar, etc.
        number: v.number(),
        label: v.string(),
        // Campo legado (modelo antigo): ignorado pela aplicação atual.
        unitCount: v.optional(v.number()),
      })
    ),
    createdAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_status", ["status"])
    .index("by_responsible", ["responsibleId"]),

  // --- Hierarquia nova: Torre → Andar → Ambiente ---

  // Torre / Bloco de uma obra.
  towers: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    order: v.number(),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),

  // Andar de uma torre (extraído do array legado projects.floors[]).
  floors: defineTable({
    towerId: v.id("towers"),
    // Denormalizado para consultas eficientes por obra.
    projectId: v.id("projects"),
    number: v.number(),
    label: v.string(),
    createdAt: v.number(),
  })
    .index("by_tower", ["towerId"])
    .index("by_project", ["projectId"]),

  // Ambiente / cômodo de um andar (ex: "Sala de Estar", "Suíte 1", "Apto 201").
  environments: defineTable({
    floorId: v.id("floors"),
    // Denormalizados para consultas eficientes.
    towerId: v.id("towers"),
    projectId: v.id("projects"),
    name: v.string(),
    type: v.optional(v.string()),
    order: v.number(),
    createdAt: v.number(),
  })
    .index("by_floor", ["floorId"])
    .index("by_tower", ["towerId"])
    .index("by_project", ["projectId"]),

  // Apartamento / "Final" dentro de um andar.
  projectUnits: defineTable({
    projectId: v.id("projects"),
    // Andar onde o apartamento começa (para duplex/triplex, o andar de base).
    floor: v.number(),
    // Posição na linha do andar (1 = Final 1, 2 = Final 2, ...). Também usada
    // para ordenar as colunas da grade.
    final: v.number(),
    // Rótulo do apartamento, ex: "201".
    label: v.string(),
    type: v.union(v.literal("vrf"), v.literal("split")),
    // 1 = normal, 2 = duplex, 3 = triplex (quantos andares a unidade ocupa).
    floorSpan: v.number(),
    deadline: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_project_floor", ["projectId", "floor"]),

  // Item planejado (linha da BOM / aba Global): cada condensadora/evaporadora.
  projectEquipment: defineTable({
    projectId: v.id("projects"),
    // Opcional: obras antigas usam projectUnits; obras novas usam environments.
    unitId: v.optional(v.id("projectUnits")),
    // Sistema dentro do apartamento, ex: "VRF 1", "VRF 2", "Split".
    system: v.string(),
    // Ambiente onde fica, ex: "Sala de Estar", "Suíte 1", "Área Técnica".
    ambiente: v.string(),
    kind: v.union(v.literal("condensadora"), v.literal("evaporadora")),
    modelo: v.string(),
    capacidade: v.string(),
    status: v.union(
      v.literal("installing"),
      v.literal("operational"),
      v.literal("warning"),
      v.literal("error")
    ),
    obs: v.optional(v.string()),
    deadline: v.optional(v.number()),
    // Vínculo com o equipamento real (QR) instalado em campo.
    linkedEquipmentId: v.optional(v.id("equipment")),
    installedAt: v.optional(v.number()),
    // --- Hierarquia nova (opcionais; obras antigas usam apenas unitId) ---
    environmentId: v.optional(v.id("environments")),
    towerId: v.optional(v.id("towers")),
    floorId: v.optional(v.id("floors")),
    // --- Dados ricos do equipamento ---
    serialNumber: v.optional(v.string()),
    responsibleId: v.optional(v.id("users")),
    photoIds: v.optional(v.array(v.id("_storage"))),
    videoIds: v.optional(v.array(v.id("_storage"))),
    scheduledDate: v.optional(v.number()),
    installationDate: v.optional(v.number()),
    testDate: v.optional(v.number()),
    checklistTemplateId: v.optional(v.id("checklistTemplates")),
  })
    .index("by_project", ["projectId"])
    .index("by_unit", ["unitId"])
    .index("by_environment", ["environmentId"])
    .index("by_project_modelo", ["projectId", "modelo"])
    .index("by_linkedEquipment", ["linkedEquipmentId"]),

  // --- Checklists ---

  // Modelo de checklist reutilizável (por obra ou global).
  checklistTemplates: defineTable({
    projectId: v.optional(v.id("projects")),
    name: v.string(),
    items: v.array(
      v.object({
        label: v.string(),
        required: v.boolean(),
      })
    ),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),

  // Item de checklist instanciado para um equipamento planejado.
  checklistItems: defineTable({
    equipmentId: v.id("projectEquipment"),
    label: v.string(),
    required: v.boolean(),
    completed: v.boolean(),
    completedBy: v.optional(v.id("users")),
    completedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    order: v.number(),
  }).index("by_equipment", ["equipmentId"]),

  // --- Histórico / Auditoria ---

  // Histórico de ações por equipamento planejado (instalação, teste, status...).
  equipmentHistory: defineTable({
    equipmentId: v.id("projectEquipment"),
    action: v.string(),
    userId: v.id("users"),
    previousValue: v.optional(v.string()),
    newValue: v.optional(v.string()),
    notes: v.optional(v.string()),
    // Estrutura preparada para GPS (preenchida pelo app de campo).
    location: v.optional(
      v.object({
        latitude: v.number(),
        longitude: v.number(),
      })
    ),
    createdAt: v.number(),
  })
    .index("by_equipment", ["equipmentId"])
    .index("by_user", ["userId"]),

  // Log de auditoria do sistema (todas as escritas relevantes).
  auditLogs: defineTable({
    userId: v.id("users"),
    action: v.string(),
    tableName: v.string(),
    recordId: v.string(),
    details: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_table", ["tableName", "createdAt"]),

  // Entregas de material por modelo (aba Entregas): controle de logística.
  materialDeliveries: defineTable({
    projectId: v.id("projects"),
    modelo: v.string(),
    capacidade: v.optional(v.string()),
    qty: v.number(),
    date: v.number(),
    note: v.optional(v.string()),
  })
    .index("by_project", ["projectId"])
    .index("by_project_modelo", ["projectId", "modelo"]),

  equipment: defineTable({
    // Cadastro simplificado em campo: descrição geral + foto da etiqueta.
    description: v.optional(v.string()),
    labelPhotoIds: v.optional(v.array(v.id("_storage"))),
    status: v.union(
      v.literal("installing"),
      v.literal("operational"),
      v.literal("warning"),
      v.literal("error")
    ),
    createdAt: v.number(),
    // Vínculo reverso: item planejado da obra que este equipamento ocupa.
    projectEquipmentId: v.optional(v.id("projectEquipment")),
    // Campos legados (dados antigos em produção antes da simplificação do schema).
    projectId: v.optional(v.id("projects")),
    floor: v.optional(v.number()),
    position: v.optional(v.number()),
    location: v.optional(v.string()),
    tag: v.optional(v.string()),
    type: v.optional(v.string()),
    notes: v.optional(v.string()),
  })
    .index("by_tag", ["tag"])
    .index("by_projectEquipment", ["projectEquipmentId"]),

  // --- Histórico de conversas com a IA ---

  aiChatSessions: defineTable({
    projectId: v.id("projects"),
    userId: v.id("users"),
    title: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_user", ["userId"])
    .index("by_project_user", ["projectId", "userId"]),

  aiChatMessages: defineTable({
    sessionId: v.id("aiChatSessions"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    text: v.string(),
    intents: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_session", ["sessionId"]),

  // --- Compras: catálogo, fornecedores, takeoffs e histórico de preços ---

  materials: defineTable({
    name: v.string(),
    category: v.optional(v.string()),
    unit: v.optional(v.string()),
    spec: v.optional(v.string()),
    brandPreference: v.optional(v.string()),
    active: v.boolean(),
    status: v.optional(materialStatus),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .index("by_active", ["active"])
    .index("by_status", ["status"])
    .index("by_category", ["category"]),

  suppliers: defineTable({
    name: v.string(),
    categories: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .index("by_active", ["active"]),

  supplierContacts: defineTable({
    supplierId: v.id("suppliers"),
    name: v.string(),
    email: v.optional(v.string()),
    whatsapp: v.optional(v.string()),
    role: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_supplier", ["supplierId"]),

  takeoffs: defineTable({
    projectId: v.optional(v.id("projects")),
    name: v.string(),
    status: v.optional(takeoffStatus),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    createdByUserId: v.optional(v.id("users")),
  })
    .index("by_project", ["projectId"])
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"]),

  takeoffItems: defineTable({
    takeoffId: v.id("takeoffs"),
    projectId: v.optional(v.id("projects")),
    rawDescription: v.string(),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    materialId: v.optional(v.id("materials")),
    estimatedUnitPriceCents: v.optional(v.number()),
    notes: v.optional(v.string()),
    status: v.optional(takeoffItemStatus),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_takeoff", ["takeoffId"])
    .index("by_project", ["projectId"])
    .index("by_material", ["materialId"])
    .index("by_status", ["status"]),

  priceEvents: defineTable({
    rawDescription: v.optional(v.string()),
    materialId: v.optional(v.id("materials")),
    supplierId: v.optional(v.id("suppliers")),
    supplierNameRaw: v.optional(v.string()),
    unitPriceCents: v.number(),
    unit: v.optional(v.string()),
    quantity: v.optional(v.number()),
    source: priceEventSource,
    occurredAt: v.number(),
    validUntil: v.optional(v.number()),
    projectId: v.optional(v.id("projects")),
    takeoffId: v.optional(v.id("takeoffs")),
    notes: v.optional(v.string()),
    reviewStatus: v.optional(priceEventReviewStatus),
    needsReview: v.boolean(),
    createdAt: v.number(),
    createdByUserId: v.optional(v.id("users")),
  })
    .index("by_material", ["materialId"])
    .index("by_supplier", ["supplierId"])
    .index("by_material_supplier", ["materialId", "supplierId"])
    .index("by_project", ["projectId"])
    .index("by_takeoff", ["takeoffId"])
    .index("by_occurred_at", ["occurredAt"])
    .index("by_needs_review", ["needsReview"])
    .index("by_review_status", ["reviewStatus"]),

  materialAliases: defineTable({
    alias: v.string(),
    aliasNormalized: v.string(),
    materialId: v.id("materials"),
    createdAt: v.number(),
  })
    .index("by_alias_normalized", ["aliasNormalized"])
    .index("by_material", ["materialId"]),

  maintenanceLogs: defineTable({
    equipmentId: v.id("equipment"),
    // Registros antigos não têm o campo; tratar ausência como "maintenance".
    type: v.optional(
      v.union(v.literal("installation"), v.literal("maintenance"))
    ),
    technicianName: v.string(),
    // Vínculo com o usuário que criou o registro (registros antigos não têm).
    createdByUserId: v.optional(v.id("users")),
    notes: v.optional(v.string()),
    // Palavras prontas selecionadas (ex: Posicionada, Instalada, Travado...)
    tags: v.optional(v.array(v.string())),
    status: v.union(
      v.literal("installing"),
      v.literal("operational"),
      v.literal("warning"),
      v.literal("error")
    ),
    tests: v.optional(
      v.object({
        vacuum: v.boolean(),
        pressure: v.boolean(),
        communication: v.boolean(),
        gas: v.optional(v.boolean()),
      })
    ),
    photoIds: v.array(v.id("_storage")),
    createdAt: v.number(),
  })
    .index("by_equipment", ["equipmentId"])
    .index("by_createdByUser", ["createdByUserId", "createdAt"]),
});
