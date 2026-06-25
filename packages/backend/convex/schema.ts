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
  v.literal("qr_operator")
);

// Department types
export const departments = v.union(
  v.literal("rh"),
  v.literal("engenharia")
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
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_batchId", ["batchId"])
    .index("by_batchName", ["batchName"])
    .index("by_equipment", ["equipmentId"]),

  // --- Obras / Relatórios (substitui a planilha "Tabela Global de Equipamentos") ---
  //
  // Hierarquia: Obra → Andar → Apartamento (projectUnits) → Sistema → Equipamento
  // planejado (projectEquipment). Cada item planejado pode ser vinculado a um
  // equipamento real (QR) → verde/instalado quando vinculado, vermelho/pendente
  // quando não.

  // Obra (prédio): nome + lista de andares (apenas número e rótulo).
  projects: defineTable({
    name: v.string(),
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
  }).index("by_name", ["name"]),

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
    unitId: v.id("projectUnits"),
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
  })
    .index("by_project", ["projectId"])
    .index("by_unit", ["unitId"])
    .index("by_project_modelo", ["projectId", "modelo"])
    .index("by_linkedEquipment", ["linkedEquipmentId"]),

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
