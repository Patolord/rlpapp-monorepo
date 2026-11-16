import { defineTable } from "convex/server";
import { v } from "convex/values";

// Obras, hierarquia (torre, andar, ambiente), equipamentos e QR codes.

// Status da obra (ciclo de vida do projeto).
export const projectStatus = v.union(
  v.literal("planning"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("paused"),
  v.literal("archived")
);

// Quem, em campo, pode ver/baixar um documento da obra.
// - none: apenas escritório (engenharia)
// - all: todos os técnicos atribuídos à obra (projects.technicianIds)
// - selected: somente os técnicos listados em allowedTechnicianIds
export const projectDocumentTechnicianAccess = v.union(
  v.literal("none"),
  v.literal("all"),
  v.literal("selected")
);

// Cerca do ponto de uma obra: centro e raio em metros.
export const projectGeofence = v.object({
  latitude: v.number(),
  longitude: v.number(),
  radiusMeters: v.number(),
});

// Status de um equipamento instalado (igual a EquipmentStatus de @rlpapp/shared).
export const equipmentStatusValidator = v.union(
  v.literal("installing"),
  v.literal("operational"),
  v.literal("warning"),
  v.literal("error")
);

// Tipo de unidade do equipamento planejado.
export const equipKindValidator = v.union(
  v.literal("condensadora"),
  v.literal("evaporadora")
);

export const engineeringTables = {
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
    .index("by_project", ["projectId"])
    .index("by_project_and_status", ["projectId", "status"]),
  // Lote de QR codes enviado à gráfica. Opcionalmente pré-associado a uma obra
  // de destino: o cadastro do técnico herda a obra automaticamente e a bipagem
  // na obra valida o destino. Lotes legados não têm registro aqui (o batchId
  // em qrCodes continua sendo a chave de ligação).
  qrBatches: defineTable({
    batchId: v.string(),
    name: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    createdAt: v.number(),
  })
    .index("by_batchId", ["batchId"])
    .index("by_project", ["projectId"]),

  // --- Obras (substitui a planilha "Tabela Global de Equipamentos") ---
  //
  // Hierarquia legada: Obra → Andar → Apartamento (projectUnits) → Sistema →
  // Equipamento planejado (projectEquipment). Cada item planejado pode ser
  // vinculado a um equipamento instalado (QR) → verde/instalado quando
  // vinculado, vermelho/pendente quando não.
  //
  // Obra (prédio): nome + metadados + lista de andares (legado) + torres.
  //
  // Hierarquia nova: Obra → Torre → Andar → Ambiente → Equipamento.
  // O array `floors` é mantido por compatibilidade com obras antigas que usam
  // o caminho projectUnits; obras novas usam as tabelas towers/floors/environments.
  projects: defineTable({
    name: v.string(),
    // Identificador amigável para URLs (estável após criação).
    slug: v.optional(v.string()),
    // Metadados da obra (todos opcionais para compatibilidade com dados antigos).
    // Legado: rótulo livre do cliente. Preferir `customerId`.
    client: v.optional(v.string()),
    customerId: v.optional(v.id("customers")),
    // Número da obra no sistema legado. Obrigatório nas novas obras.
    legacyNumber: v.optional(v.number()),
    address: v.optional(v.string()),
    status: v.optional(projectStatus),
    responsibleId: v.optional(v.id("users")),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    // Legado: usuários role "client" com acesso ao portal. Preferir `portalUserIds`.
    clientIds: v.optional(v.array(v.id("users"))),
    portalUserIds: v.optional(v.array(v.id("users"))),
    archivedAt: v.optional(v.number()),
    archivedByUserId: v.optional(v.id("users")),
    // Técnicos (qr_operator ou staff) atribuídos à obra para listar QRs/equipamentos.
    technicianIds: v.optional(v.array(v.id("users"))),
    // Cerca do ponto: marcações dentro dela contam para esta obra.
    geofence: v.optional(projectGeofence),
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
    .index("by_slug", ["slug"])
    .index("by_status", ["status"])
    .index("by_responsible", ["responsibleId"])
    .index("by_customer", ["customerId"])
    .index("by_legacy_number", ["legacyNumber"]),
  // Documentos (PDF) anexados à obra pela engenharia, com acesso opcional
  // para os técnicos de campo visualizarem/baixarem.
  projectDocuments: defineTable({
    projectId: v.id("projects"),
    storageId: v.id("_storage"),
    // Nome exibido (sem depender do nome original do arquivo).
    name: v.string(),
    description: v.optional(v.string()),
    contentType: v.string(),
    sizeBytes: v.number(),
    technicianAccess: projectDocumentTechnicianAccess,
    // Só usado quando technicianAccess === "selected".
    allowedTechnicianIds: v.optional(v.array(v.id("users"))),
    uploadedByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_storage", ["storageId"]),

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
    // --- Posição esquemática na matriz do prédio (todos opcionais) ---
    // Coluna explícita (1-based) na grade da torre; ausente = auto-empacota
    // pela ordem (comportamento legado).
    col: v.optional(v.number()),
    // Largura em colunas (ex: hall largo de aeroporto). Padrão 1.
    colSpan: v.optional(v.number()),
    // Altura em andares a partir do andar-base, para cima (duplex = 2,
    // triplex = 3). O ambiente permanece vinculado ao andar mais baixo.
    rowSpan: v.optional(v.number()),
    // Retângulos extras que compõem regiões não-retangulares (ex: forma em
    // "L"). Posições relativas ao retângulo principal: `colOffset` em colunas
    // (0 = mesma coluna, pode ser negativo) e `rowOffset` em andares acima do
    // andar-base (0 = mesmo andar). A forma inteira se move junta quando o
    // auto-posicionamento precisa deslocá-la.
    segments: v.optional(
      v.array(
        v.object({
          colOffset: v.number(),
          colSpan: v.optional(v.number()),
          rowOffset: v.optional(v.number()),
          rowSpan: v.optional(v.number()),
        })
      )
    ),
    createdAt: v.number(),
  })
    .index("by_floor", ["floorId"])
    .index("by_tower", ["towerId"])
    .index("by_project", ["projectId"]),
  // Sistema de climatização, escopado a UMA obra (ex: "VRF 1", "Split").
  // Agrupa equipamentos que podem estar em ambientes diferentes da mesma obra
  // (ex: condensadora na cobertura + evaporadoras espalhadas pelos aptos).
  systems: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    // Tipo do sistema, ex: "VRF", "Split".
    type: v.optional(v.string()),
    obs: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),
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
    // Nome do sistema (denormalizado de `systems.name` quando `systemId` está
    // presente; texto livre no caminho legado de apartamentos).
    system: v.string(),
    // Sistema da obra ao qual este equipamento pertence (hierarquia nova).
    systemId: v.optional(v.id("systems")),
    // Ambiente onde fica, ex: "Sala de Estar", "Suíte 1", "Área Técnica".
    ambiente: v.string(),
    kind: equipKindValidator,
    modelo: v.string(),
    capacidade: v.string(),
    status: equipmentStatusValidator,
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
    .index("by_system", ["systemId"])
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
    .index("by_user", ["userId"])
    .index("by_user_and_created", ["userId", "createdAt"]),
  equipment: defineTable({
    // Cadastro simplificado em campo: descrição geral + foto da etiqueta.
    description: v.optional(v.string()),
    labelPhotoIds: v.optional(v.array(v.id("_storage"))),
    status: equipmentStatusValidator,
    createdAt: v.number(),
    // Técnico que cadastrou o equipamento em campo (aparece em Meus Registros).
    createdByUserId: v.optional(v.id("users")),
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
    .index("by_projectEquipment", ["projectEquipmentId"])
    .index("by_createdByUser", ["createdByUserId", "createdAt"]),

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
    status: equipmentStatusValidator,
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
};
