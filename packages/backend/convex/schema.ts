import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Cargo legado (`users.role`), lido só pela migração `migrations:migrateUserAccess`.
// O acesso vem de `users.roles`. Passo final (depois da migração rodar em
// produção): tornar `roles` obrigatório e remover `role`, `department` e
// este validador.
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

// Acessos combináveis do usuário (ver @rlpapp/shared/auth/permissions).
export const accessRoles = v.union(
  v.literal("director"),
  v.literal("admin"),
  v.literal("engenheiro"),
  v.literal("engenharia"),
  v.literal("compras"),
  v.literal("estoque"),
  v.literal("rh"),
  v.literal("takeoff"),
  v.literal("qr_operator"),
  v.literal("client")
);

// Department types
export const departments = v.union(
  v.literal("rh"),
  v.literal("engenharia"),
  v.literal("compras"),
  v.literal("estoque")
);

export const employeeStatus = v.union(
  v.literal("active"),
  v.literal("on_leave"),
  v.literal("terminated")
);

export const employeePaymentMethod = v.union(
  v.literal("pix"),
  v.literal("tbi"),
  v.literal("other")
);

// Equipe do funcionário (ver @rlpapp/shared/rh/staffGroups). Cada equipe tem
// padrões próprios de benefícios na folha; cadastros antigos sem equipe são obra.
export const employeeStaffGroup = v.union(
  v.literal("obra"),
  v.literal("escritorio"),
  v.literal("diretoria")
);

export const payrollRunStatus = v.union(
  v.literal("draft"),
  v.literal("closed")
);

// Tipo da marcação de ponto, derivado da posição no dia (1ª=entrada, 2ª=saída
// almoço, 3ª=retorno almoço, 4ª em diante=saída).
export const timeClockPunchKind = v.union(
  v.literal("entrada"),
  v.literal("almoco_saida"),
  v.literal("almoco_retorno"),
  v.literal("saida")
);

// Resultado da checagem da posição contra as cercas das obras.
export const timeClockGeofenceStatus = v.union(
  v.literal("not_controlled"),
  v.literal("inside"),
  v.literal("outside")
);

// Cerca do ponto de uma obra: centro e raio em metros.
export const projectGeofence = v.object({
  latitude: v.number(),
  longitude: v.number(),
  radiusMeters: v.number(),
});

// --- Compras / Materiais / Preços ---

export const materialStatus = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("archived")
);

export const replenishmentState = v.union(
  v.literal("unconfigured"),
  v.literal("healthy"),
  v.literal("reorder"),
  v.literal("below_minimum")
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

/** Origem de um takeoff criado fora do app web. */
export const takeoffSource = v.literal("desktop");

// Kits (presets) do RLP Takeoff: um trecho desenhado (ou um clique) mede
// vários materiais de uma vez. Mesma forma de `Kit` em
// @rlpapp/shared/takeoff/kits, que o app desktop consome.
export const takeoffKitMode = v.union(v.literal("linear"), v.literal("count"));
export const takeoffKitComponentKind = v.union(
  v.literal("count"),
  v.literal("linear"),
  v.literal("area")
);
/** Linha da tabela de materiais por peso do RLP Takeoff. */
export const takeoffWeightRow = v.object({
  name: v.string(),
  group: v.string(),
  /** kg por metro ("m") ou por peça ("pç"). */
  unit: v.union(v.literal("m"), v.literal("pç")),
  /** Chave do insumo (BASE_MATERIALS em @rlpapp/shared/takeoff/weights). */
  material: v.string(),
  kgPerUnit: v.number(),
});

/** Linha de uma tabela de bitolas de VRF: a partir de `hp`, este par gás/líquido. */
export const takeoffVrfHpRow = v.object({
  hp: v.number(),
  gas: v.string(),
  liquid: v.string(),
});

/** Regras de uma marca de VRF (mesma forma de VrfBrand em @rlpapp/shared). */
export const takeoffVrfBrand = v.object({
  id: v.string(),
  name: v.string(),
  main: v.array(takeoffVrfHpRow),
  trunk: v.array(takeoffVrfHpRow),
  branch: v.array(takeoffVrfHpRow),
  ykit: v.array(v.object({ hp: v.number(), model: v.string() })),
});

/** Parâmetros de dutos de uma norma (DuctNormaDefaults em @rlpapp/shared/engenharia/ducts). */
export const takeoffDuctNorma = v.object({
  norma: v.union(v.literal(1), v.literal(2), v.literal(3)),
  /** Maior lado (cm) coberto por # 26, # 24, # 22 e # 20; acima, # 18. */
  gaugeLimits: v.array(v.number()),
  insulThickness: v.number(),
  flangeSpacing: v.number(),
  rechapThickness: v.number(),
  /** null = regra da planilha (20 %, 15 % acima de 10 000 kg). */
  sheetSlackPct: v.union(v.number(), v.null()),
  insulSlackPct: v.number(),
  supportsPct: v.number(),
});

export const takeoffKitComponent = v.object({
  /** Nome no catálogo do app (produto da empresa ou material das planilhas). */
  name: v.string(),
  /**
   * Código do material no catálogo de compras (MAT-000123). Com ele o app liga
   * o item ao material (preço, cotação, propostas) qualquer que seja o nome;
   * ausente num item próprio que o catálogo não tem.
   */
  sku: v.optional(v.string()),
  /** Seção do orçamento (Tubulações, Equipamentos, ...). */
  group: v.string(),
  /** Disciplina (Infra AC, Detecção de Incêndio, ...). */
  system: v.optional(v.string()),
  kind: takeoffKitComponentKind,
  /** Multiplicador da medida (kit linear) ou quantidade por clique (kit de contagem). */
  factor: v.number(),
});

/** Resumo de uma aba da planilha orçamentária publicada pelo desktop. */
export const takeoffBudgetSheet = v.object({
  name: v.string(),
  bdi: v.number(),
  extrasPct: v.number(),
  materialCents: v.number(),
  laborCents: v.number(),
  extrasEachCents: v.number(),
  totalCents: v.number(),
  proposalCents: v.number(),
});

/** Cabeçalho do orçamento publicado pelo desktop (ver @rlpapp/shared). */
export const takeoffBudgetMeta = v.object({
  proposalNumber: v.optional(v.string()),
  estimator: v.optional(v.string()),
  client: v.optional(v.string()),
  site: v.optional(v.string()),
  system: v.optional(v.string()),
  currency: v.optional(v.string()),
  sheets: v.array(takeoffBudgetSheet),
});

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

export const materialDimensions = v.object({
  widthMm: v.optional(v.number()),
  heightMm: v.optional(v.number()),
  lengthMm: v.optional(v.number()),
  thicknessMm: v.optional(v.number()),
  diameterMm: v.optional(v.number()),
});

// --- Estoque ---

export const inventoryLocationType = v.union(
  v.literal("central"),
  v.literal("project")
);

export const inventoryMovementType = v.union(
  v.literal("entry"),
  v.literal("transfer"),
  v.literal("consumption"),
  v.literal("return"),
  v.literal("adjustment"),
  v.literal("reversal")
);

export const inventoryDocumentStatus = v.union(
  v.literal("draft"),
  v.literal("pending_approval"),
  v.literal("approved"),
  v.literal("posted"),
  v.literal("rejected"),
  v.literal("reversed")
);

export const inventoryEventType = v.union(
  v.literal("in"),
  v.literal("out"),
  v.literal("adjustment"),
  v.literal("reversal")
);

export const inventoryCompatibilityRuleType = v.union(
  v.literal("forbidden_pair"),
  v.literal("attributes_must_match")
);

export const inventoryRequestStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("cancelled"),
  v.literal("fulfilled")
);

export const inventoryRequestReason = v.union(
  v.literal("replenishment"),
  v.literal("new")
);

// --- Engenharia: Contratos e Medições ---

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

// Permissão de um token de agente (MCP).
export const agentTokenPermission = v.union(
  v.literal("full_access"),
  v.literal("read_only")
);

// Origem de um token de agente: criado à mão em /conta/agentes ("agent") ou
// emitido pelo login de um app desktop, o RLP Takeoff ("device").
export const agentTokenKind = v.union(v.literal("agent"), v.literal("device"));

export default defineSchema({
  users: defineTable({
    name: v.string(),
    // Email é opcional: usuários podem ser criados apenas com username no Clerk.
    email: v.optional(v.string()),
    username: v.optional(v.string()),
    // Clerk user ID (subject do JWT). Optional para usuários criados antes do webhook.
    clerkId: v.optional(v.string()),
    // Acessos do usuário (fonte de verdade da autorização). Opcional só até a
    // migração `migrations:migrateUserAccess` rodar em produção; um documento
    // sem `roles` é lido pela tradução de role + department (rolesFromLegacy).
    roles: v.optional(v.array(accessRoles)),
    // Ajustes individuais por cima dos acessos (Configurações → Usuários):
    // permissões concedidas a mais e permissões do acesso retiradas. Valores
    // de PERMISSIONS no shared; guardados como string para que renomear ou
    // remover uma permissão do catálogo não invalide documentos (valores
    // desconhecidos são ignorados pela política).
    permissionGrants: v.optional(v.array(v.string())),
    permissionDenials: v.optional(v.array(v.string())),
    // Descontinuados: cargo e departamento. Nada grava nem lê estes campos
    // fora da migração, que também os apaga. Remover do schema no passo final.
    role: v.optional(userRoles),
    department: v.optional(departments),
    phone: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    lastLoginAt: v.optional(v.number()),
    // Convite por email (Configurações → Usuários): o cadastro nasce sem
    // clerkId e é vinculado quando a pessoa aceita o convite e cria a conta
    // (webhook user.created ou ensureUser, ambos pelo email). Enquanto não há
    // clerkId, o convite está pendente.
    invitedAt: v.optional(v.number()),
    // Id da invitation no Clerk, para reenviar ou revogar.
    clerkInvitationId: v.optional(v.string()),
  })
    .index("by_email", ["email"])
    .index("by_clerkId", ["clerkId"])
    .index("by_active", ["isActive"]),

  // --- Tokens de agente (MCP / acesso programático) ---

  // Credencial de longa duração que age em nome do usuário dono (mesma role e
  // permissões). Só o SHA-256 do token é guardado; o texto puro aparece uma
  // única vez, na criação. Usado pelo servidor MCP (apps/web /mcp) no lugar do
  // OAuth do Clerk: o token é trocado por um JWT de delegação curto cujo `sub`
  // é o clerkId do dono. Revogação e modo somente-leitura são aplicados
  // centralmente em lib/agentTokens.ts.
  agentTokens: defineTable({
    userId: v.id("users"),
    name: v.string(),
    /** SHA-256 (hex) do token em texto puro; usado na busca a cada pedido. */
    tokenHash: v.string(),
    /** Primeiros caracteres do token (`rlp_` + 8) para identificar na lista. */
    tokenPrefix: v.string(),
    /** `read_only` só executa queries; mutations e actions são rejeitadas. */
    permission: agentTokenPermission,
    createdAt: v.number(),
    /** Atualizado no máximo uma vez por minuto. */
    lastUsedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    /** Ausente = "agent" (tokens anteriores ao login do desktop). */
    kind: v.optional(agentTokenKind),
    /**
     * Só tokens de dispositivo: id aleatório da instalação do RLP Takeoff,
     * gerado uma vez pelo app. Um novo login da mesma instalação revoga o
     * token anterior dela (o nome do computador é só rótulo e pode repetir).
     */
    installationId: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_tokenHash", ["tokenHash"]),

  // Códigos de uso único do login do RLP Takeoff (desktop). A página web
  // /takeoff/conectar cria um código ligado ao usuário logado e ao desafio
  // PKCE do app; o app troca o código (com o verificador) por um token de
  // dispositivo em POST /takeoff/auth/exchange. Só o hash fica gravado.
  takeoffAuthCodes: defineTable({
    userId: v.id("users"),
    /** SHA-256 (hex) do código em texto puro. */
    codeHash: v.string(),
    /** Desafio PKCE S256 (base64url do SHA-256 do verificador). */
    codeChallenge: v.string(),
    /** Nome do computador, mostrado no token criado ("Takeoff · <device>"). */
    device: v.string(),
    /** Id da instalação do app (ver agentTokens.installationId). */
    installationId: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_codeHash", ["codeHash"])
    .index("by_user", ["userId"]),

  // Uma linha por chamada de ferramenta feita via MCP com um token de agente.
  // Alimenta "Atividade recente" na página Agentes. Expurgado pelo cron após
  // AGENT_TOKEN_CALL_RETENTION_DAYS.
  agentTokenCalls: defineTable({
    tokenId: v.id("agentTokens"),
    userId: v.id("users"),
    /** Nome da ferramenta MCP (ex.: `list_projects`, `call_function`). */
    tool: v.string(),
    /** Função Convex chamada, `modulo:funcao`. */
    functionPath: v.optional(v.string()),
    outcome: v.union(v.literal("success"), v.literal("error")),
    errorMessage: v.optional(v.string()),
    durationMs: v.number(),
    createdAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_token", ["tokenId", "createdAt"])
    .index("by_user", ["userId", "createdAt"]),

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

  // --- Obras / Relatórios (substitui a planilha "Tabela Global de Equipamentos") ---
  //
  // Hierarquia: Obra → Andar → Apartamento (projectUnits) → Sistema → Equipamento
  // planejado (projectEquipment). Cada item planejado pode ser vinculado a um
  // equipamento real (QR) → verde/instalado quando vinculado, vermelho/pendente
  // quando não.

  // --- Clientes (cadastro mestre) ---

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

  // Log de auditoria do sistema (todas as escritas relevantes).
  auditLogs: defineTable({
    userId: v.id("users"),
    action: v.string(),
    tableName: v.string(),
    recordId: v.string(),
    details: v.optional(v.string()),
    entityLabel: v.optional(v.string()),
    source: v.optional(v.string()),
    schemaVersion: v.optional(v.number()),
    changes: v.optional(
      v.array(
        v.object({
          field: v.string(),
          previousValue: v.optional(v.string()),
          newValue: v.optional(v.string()),
        })
      )
    ),
    snapshotBefore: v.optional(v.string()),
    snapshotAfter: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_table", ["tableName", "createdAt"])
    .index("by_record", ["tableName", "recordId", "createdAt"]),

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

  materialFamilies: defineTable({
    name: v.string(),
    nameNormalized: v.string(),
    category: v.optional(v.string()),
    baseUnit: v.optional(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name_normalized", ["nameNormalized"])
    .index("by_active", ["active"]),

  materials: defineTable({
    name: v.string(),
    // Optional for legacy/incomplete rows that block schema push.
    // New materials must still set familyId in mutations.
    familyId: v.optional(v.id("materialFamilies")),
    variantLabel: v.optional(v.string()),
    dimensions: v.optional(materialDimensions),
    // Chave canônica da combinação família + atributos que definem o SKU.
    // Optional for the same legacy-row reason as familyId.
    identityKey: v.optional(v.string()),
    // SKU interno (ex.: MAT-000001). Gerado automaticamente, editável.
    sku: v.optional(v.string()),
    barcode: v.optional(v.string()),
    manufacturer: v.optional(v.string()),
    manufacturerPartNumber: v.optional(v.string()),
    category: v.optional(v.string()),
    unit: v.optional(v.string()),
    purchaseUnit: v.optional(v.string()),
    unitsPerPurchaseUnit: v.optional(v.number()),
    trackInventory: v.optional(v.boolean()),
    spec: v.optional(v.string()),
    brandPreference: v.optional(v.string()),
    // Pequeno conjunto de propriedades usado nas regras de compatibilidade.
    technicalAttributes: v.optional(
      v.array(
        v.object({
          key: v.string(),
          value: v.string(),
        })
      )
    ),
    // Texto denormalizado para busca (nome, sku, fabricante, etc.).
    searchText: v.optional(v.string()),
    imageId: v.optional(v.id("_storage")),
    // Mão de obra por unidade (`unit`) usada nos orçamentos do RLP Takeoff,
    // em centavos. Ausente = sem preço de mão de obra cadastrado.
    laborPriceCents: v.optional(v.number()),
    // Quando o preço de mão de obra foi definido pela última vez.
    laborPriceUpdatedAt: v.optional(v.number()),
    active: v.boolean(),
    status: v.optional(materialStatus),
    // Set when this material was merged into another (status "archived");
    // lets external consumers (RLP Takeoff) follow the redirect.
    mergedIntoId: v.optional(v.id("materials")),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .index("by_active", ["active"])
    .index("by_status", ["status"])
    .index("by_category", ["category"])
    .index("by_sku", ["sku"])
    .index("by_barcode", ["barcode"])
    .index("by_searchText", ["searchText"])
    .index("by_family", ["familyId"])
    .index("by_identity_key", ["identityKey"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["active"],
    }),

  materialSkuCounters: defineTable({
    key: v.literal("material"),
    nextNumber: v.number(),
  }).index("by_key", ["key"]),

  materialImportRows: defineTable({
    source: v.string(),
    rowKey: v.string(),
    materialId: v.id("materials"),
    sourceMaterialId: v.optional(v.string()),
    sourceDetailId: v.optional(v.string()),
    sourceRowNumber: v.optional(v.number()),
    quantity: v.optional(v.number()),
    unitCostCents: v.optional(v.number()),
    importedAt: v.number(),
  })
    .index("by_source_row", ["source", "rowKey"])
    .index("by_material", ["materialId"]),

  suppliers: defineTable({
    // Nome fantasia (ou nome da pessoa física).
    name: v.string(),
    personType: v.optional(v.union(v.literal("pf"), v.literal("pj"))),
    // Razão social (PJ).
    legalName: v.optional(v.string()),
    // CNPJ/CPF como informado; `taxIdNormalized` guarda só dígitos.
    taxId: v.optional(v.string()),
    taxIdNormalized: v.optional(v.string()),
    stateRegistration: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    address: v.optional(v.string()),
    // Condições comerciais padrão (ex.: "28 DDL", "à vista").
    paymentTerms: v.optional(v.string()),
    // Prazo de entrega padrão em dias (pode ser sobrescrito por material).
    defaultLeadTimeDays: v.optional(v.number()),
    categories: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .index("by_tax_id_normalized", ["taxIdNormalized"])
    .index("by_active", ["active"]),

  supplierContacts: defineTable({
    supplierId: v.id("suppliers"),
    name: v.string(),
    email: v.optional(v.string()),
    whatsapp: v.optional(v.string()),
    role: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_supplier", ["supplierId"]),

  supplierMaterials: defineTable({
    supplierId: v.id("suppliers"),
    materialId: v.id("materials"),
    supplierCode: v.optional(v.string()),
    supplierDescription: v.optional(v.string()),
    purchaseUnit: v.optional(v.string()),
    unitsPerPurchaseUnit: v.optional(v.number()),
    leadTimeDays: v.optional(v.number()),
    preferred: v.boolean(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_supplier", ["supplierId"])
    .index("by_material", ["materialId"])
    .index("by_supplier_material", ["supplierId", "materialId"])
    .index("by_supplier_code", ["supplierId", "supplierCode"]),

  // Padrões da empresa dos kits do RLP Takeoff, editados em App Takeoff →
  // Kits no dashboard e publicados com o catálogo (`takeoffCatalog`). `key` é
  // o id que o app usa (os trechos salvos num projeto o guardam); os kits de
  // fábrica do app têm chaves fixas (kit-9-000-inverter) para que a cópia
  // local de cada usuário continue pareada com a da empresa. Remover
  // desativa, nunca apaga: a chave fica reservada.
  takeoffKits: defineTable({
    key: v.string(),
    name: v.string(),
    mode: takeoffKitMode,
    /** Prefixo do rótulo no desenho ('1/4" · 3/8"'); ausente = sem rótulo. */
    label: v.optional(v.string()),
    components: v.array(takeoffKitComponent),
    sortOrder: v.number(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    updatedByUserId: v.optional(v.id("users")),
  })
    .index("by_key", ["key"])
    .index("by_active_sortOrder", ["active", "sortOrder"]),

  // Demais configurações do RLP Takeoff editadas em App Takeoff no dashboard e
  // publicadas com o catálogo: um documento por `kind`. Mesmas formas de
  // @rlpapp/shared/takeoff/weights e vrfBrands. O app aplica tudo como padrão
  // sob as alterações locais de cada usuário.
  takeoffSettings: defineTable(
    v.union(
      // Materiais por peso (kg por unidade × preço do insumo) e kg/m² por
      // bitola de chapa dos dutos.
      v.object({
        kind: v.literal("weights"),
        rows: v.array(takeoffWeightRow),
        gaugeWeights: v.record(v.string(), v.number()),
        updatedAt: v.number(),
        updatedByUserId: v.optional(v.id("users")),
      }),
      // Preço por kg dos insumos (cobre, cobre_grosso, chapa).
      v.object({
        kind: v.literal("basePrices"),
        prices: v.record(v.string(), v.number()),
        updatedAt: v.number(),
        updatedByUserId: v.optional(v.id("users")),
      }),
      // Regras das marcas de VRF: tabelas de bitola por HP e modelos de Y-kit.
      v.object({
        kind: v.literal("vrfBrands"),
        brands: v.array(takeoffVrfBrand),
        updatedAt: v.number(),
        updatedByUserId: v.optional(v.id("users")),
      }),
      // Mão de obra global: R$/kg de chapa (dutos) e R$ por evaporadora (VRF).
      // Um takeoff pode fixar o próprio valor; ausente aqui = padrão da planilha.
      v.object({
        kind: v.literal("labor"),
        ductPerKg: v.optional(v.number()),
        vrfPerEvap: v.optional(v.number()),
        updatedAt: v.number(),
        updatedByUserId: v.optional(v.id("users")),
      }),
      // Parâmetros de dutos por norma (bitola pelo lado maior, espessuras e
      // folgas): o takeoff parte deles ao escolher a norma e pode ajustar.
      v.object({
        kind: v.literal("ductNormas"),
        normas: v.array(takeoffDuctNorma),
        updatedAt: v.number(),
        updatedByUserId: v.optional(v.id("users")),
      })
    )
  ).index("by_kind", ["kind"]),

  // Histórico dos preços por kg publicados em `takeoffSettings` (basePrices):
  // um ponto por insumo cada vez que o preço dele muda. `price` nulo = o preço
  // foi apagado e o app voltou ao padrão do fornecedor. Alimenta os gráficos
  // de variação em App Takeoff → Gerais.
  takeoffPriceHistory: defineTable({
    material: v.string(),
    price: v.union(v.number(), v.null()),
    /** Data em que o preço passou a valer (registros manuais: meia-noite de Brasília). */
    recordedAt: v.number(),
    recordedByUserId: v.optional(v.id("users")),
    /** Fonte ou observação do registro (cotação, fornecedor...). */
    note: v.optional(v.string()),
  }).index("by_material_recordedAt", ["material", "recordedAt"]),

  takeoffs: defineTable({
    projectId: v.optional(v.id("projects")),
    name: v.string(),
    status: v.optional(takeoffStatus),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    createdByUserId: v.optional(v.id("users")),
    // Orçamentos publicados pelo app desktop de takeoff: `externalId` é o id
    // do projeto no desktop (único por origem); republicar atualiza o mesmo
    // takeoff.
    source: v.optional(takeoffSource),
    externalId: v.optional(v.string()),
    budget: v.optional(takeoffBudgetMeta),
    publishedAt: v.optional(v.number()),
    publishedByUserId: v.optional(v.id("users")),
  })
    .index("by_project", ["projectId"])
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"])
    .index("by_source_external", ["source", "externalId"]),

  takeoffItems: defineTable({
    takeoffId: v.id("takeoffs"),
    projectId: v.optional(v.id("projects")),
    rawDescription: v.string(),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    materialId: v.optional(v.id("materials")),
    customDimensions: v.optional(materialDimensions),
    customSpecification: v.optional(v.string()),
    estimatedUnitPriceCents: v.optional(v.number()),
    notes: v.optional(v.string()),
    status: v.optional(takeoffItemStatus),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    // Linhas vindas do desktop: id estável (item + aba + seção), aba
    // (disciplina / sistema), seção (local ou grupo), preço de mão de obra e
    // posição na planilha.
    externalLineId: v.optional(v.string()),
    sheet: v.optional(v.string()),
    section: v.optional(v.string()),
    laborUnitPriceCents: v.optional(v.number()),
    sortOrder: v.optional(v.number()),
    // Totais da linha (material / mão de obra) como o desktop calculou, com o
    // preço sem arredondar; valem enquanto quantidade e preço não mudam aqui
    // (updateItem / applySuggestedPrice os apagam).
    materialTotalCents: v.optional(v.number()),
    laborTotalCents: v.optional(v.number()),
    // Linha que saiu do orçamento desktop mas foi mantida porque a Compras
    // já trabalhou nela (cotação ou status avançado).
    externalRemovedAt: v.optional(v.number()),
  })
    .index("by_takeoff", ["takeoffId"])
    .index("by_takeoff_external_line", ["takeoffId", "externalLineId"])
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
    // Item do takeoff que originou a cotação (fabricados sob medida).
    takeoffItemId: v.optional(v.id("takeoffItems")),
    // Medidas do item cotado: fabricados sob medida só são comparáveis por
    // tamanho, então cada cotação guarda as suas para alimentar estimativas.
    dimensions: v.optional(materialDimensions),
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
    .index("by_takeoff_item", ["takeoffItemId"])
    .index("by_occurred_at", ["occurredAt"])
    .index("by_needs_review", ["needsReview"])
    .index("by_review_status", ["reviewStatus"]),

  // Proposals sent by the RLP Takeoff desktop app (`takeoffMaterials.proposeAsUser`).
  // One row per clientId so the app can retry the call safely.
  takeoffMaterialProposals: defineTable({
    clientId: v.string(),
    materialId: v.id("materials"),
    priceEventId: v.optional(v.id("priceEvents")),
    outcome: v.union(v.literal("created"), v.literal("matched")),
    requestedName: v.optional(v.string()),
    requestedUnit: v.optional(v.string()),
    requestedBy: v.optional(v.string()),
    /** Usuário logado no takeoff que enviou a proposta (ausente nas do antigo caminho por token). */
    requestedByUserId: v.optional(v.id("users")),
    takeoffName: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_client_id", ["clientId"])
    .index("by_material", ["materialId"]),

  materialAliases: defineTable({
    alias: v.string(),
    aliasNormalized: v.string(),
    materialId: v.id("materials"),
    createdAt: v.number(),
  })
    .index("by_alias_normalized", ["aliasNormalized"])
    .index("by_material", ["materialId"])
    .searchIndex("search_alias", { searchField: "aliasNormalized" }),

  // --- Estoque central e saldos simplificados por obra ---

  inventoryLocations: defineTable({
    type: inventoryLocationType,
    name: v.string(),
    projectId: v.optional(v.id("projects")),
    active: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_type", ["type"])
    .index("by_project", ["projectId"]),

  inventoryDocuments: defineTable({
    type: inventoryMovementType,
    status: inventoryDocumentStatus,
    sourceLocationId: v.optional(v.id("inventoryLocations")),
    destinationLocationId: v.optional(v.id("inventoryLocations")),
    projectId: v.optional(v.id("projects")),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
    compatibilityIssues: v.optional(
      v.array(
        v.object({
          ruleId: v.id("inventoryCompatibilityRules"),
          materialAId: v.id("materials"),
          materialBId: v.id("materials"),
          message: v.string(),
        })
      )
    ),
    approvalReason: v.optional(v.string()),
    approvedByUserId: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    rejectedByUserId: v.optional(v.id("users")),
    rejectedAt: v.optional(v.number()),
    postedAt: v.optional(v.number()),
    reversalOfDocumentId: v.optional(v.id("inventoryDocuments")),
    reversedByDocumentId: v.optional(v.id("inventoryDocuments")),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status", "createdAt"])
    .index("by_project", ["projectId", "createdAt"])
    .index("by_project_status", ["projectId", "status", "createdAt"])
    .index("by_created_by", ["createdByUserId", "createdAt"])
    .index("by_reversal_of", ["reversalOfDocumentId"]),

  inventoryDocumentItems: defineTable({
    documentId: v.id("inventoryDocuments"),
    lineNumber: v.number(),
    materialId: v.id("materials"),
    quantity: v.number(),
    unitCostCents: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_document", ["documentId", "lineNumber"])
    .index("by_material", ["materialId"]),

  inventoryEvents: defineTable({
    documentId: v.id("inventoryDocuments"),
    documentItemId: v.id("inventoryDocumentItems"),
    type: inventoryEventType,
    locationId: v.id("inventoryLocations"),
    materialId: v.id("materials"),
    quantityDelta: v.number(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_document", ["documentId"])
    .index("by_location", ["locationId", "createdAt"])
    .index("by_material", ["materialId", "createdAt"]),

  inventoryBalances: defineTable({
    locationId: v.id("inventoryLocations"),
    materialId: v.id("materials"),
    quantity: v.number(),
    // MVP: um endereço textual por material no estoque central.
    physicalAddress: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_location", ["locationId"])
    .index("by_location_material", ["locationId", "materialId"])
    .index("by_material", ["materialId"]),

  inventoryStockPolicies: defineTable({
    locationId: v.id("inventoryLocations"),
    materialId: v.id("materials"),
    minimumQuantity: v.number(),
    reorderPoint: v.number(),
    targetQuantity: v.number(),
    leadTimeDays: v.optional(v.number()),
    updatedAt: v.number(),
    updatedByUserId: v.id("users"),
  })
    .index("by_location", ["locationId"])
    .index("by_material", ["materialId"])
    .index("by_location_material", ["locationId", "materialId"]),

  inventoryCompatibilityRules: defineTable({
    type: inventoryCompatibilityRuleType,
    name: v.string(),
    materialAId: v.optional(v.id("materials")),
    materialBId: v.optional(v.id("materials")),
    categoryA: v.optional(v.string()),
    categoryB: v.optional(v.string()),
    attributeKey: v.optional(v.string()),
    message: v.string(),
    active: v.boolean(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_active", ["active"])
    .index("by_type", ["type"])
    .index("by_material_a", ["materialAId"])
    .index("by_material_b", ["materialBId"]),

  inventoryRequests: defineTable({
    projectId: v.id("projects"),
    status: inventoryRequestStatus,
    requestedByUserId: v.id("users"),
    notes: v.optional(v.string()),
    reviewedByUserId: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    reviewNotes: v.optional(v.string()),
    fulfilledByDocumentId: v.optional(v.id("inventoryDocuments")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId", "createdAt"])
    .index("by_status", ["status", "createdAt"])
    .index("by_requested_by", ["requestedByUserId", "createdAt"])
    .index("by_project_status", ["projectId", "status", "createdAt"]),

  inventoryRequestItems: defineTable({
    requestId: v.id("inventoryRequests"),
    materialId: v.id("materials"),
    quantity: v.number(),
    unit: v.optional(v.string()),
    reason: inventoryRequestReason,
    markedDepleted: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_request", ["requestId"])
    .index("by_material", ["materialId"]),

  // --- Engenharia: Empreiteiros (cadastro mestre) ---

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

  // --- RH: Funcionários e Folha de pagamento ---

  employees: defineTable({
    code: v.optional(v.string()),
    name: v.string(),
    nameNormalized: v.string(),
    cpf: v.optional(v.string()),
    cpfNormalized: v.optional(v.string()),
    // Ausente nos cadastros anteriores à equipe: tratado como "obra".
    staffGroup: v.optional(employeeStaffGroup),
    jobTitle: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    hiredAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    status: employeeStatus,
    archivedAt: v.optional(v.number()),
    archivedByUserId: v.optional(v.id("users")),
    paymentMethod: employeePaymentMethod,
    pixKey: v.optional(v.string()),
    baseSalaryCents: v.number(),
    receivesFoodBasket: v.boolean(),
    dailyTransitCents: v.number(),
    defaultTransportFoodDays: v.number(),
    // Descontinuado: vínculo antigo com o usuário que batia ponto. O ponto agora
    // é do próprio usuário e nada lê este campo. A migração
    // `migrations:clearEmployeeUserLinks` o apaga; remover do schema depois
    // que ela rodar em produção.
    userId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    createdByUserId: v.optional(v.id("users")),
    updatedByUserId: v.optional(v.id("users")),
  })
    .index("by_name_normalized", ["nameNormalized"])
    .index("by_code", ["code"])
    .index("by_cpf_normalized", ["cpfNormalized"])
    .index("by_status", ["status"])
    .index("by_email", ["email"]),

  payrollRuns: defineTable({
    year: v.number(),
    paymentMonth: v.number(),
    referenceYear: v.number(),
    referenceMonth: v.number(),
    paymentDay: v.number(),
    status: payrollRunStatus,
    mealVoucherPerDayCents: v.number(),
    foodBasketCents: v.number(),
    defaultDailyTransitCents: v.number(),
    defaultTransportFoodDays: v.number(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    createdByUserId: v.optional(v.id("users")),
    updatedByUserId: v.optional(v.id("users")),
    closedAt: v.optional(v.number()),
    closedByUserId: v.optional(v.id("users")),
  }).index("by_year_and_payment_month", ["year", "paymentMonth"]),

  payrollLines: defineTable({
    runId: v.id("payrollRuns"),
    employeeId: v.id("employees"),
    code: v.optional(v.string()),
    name: v.string(),
    jobTitle: v.optional(v.string()),
    baseSalaryCents: v.number(),
    paymentMethod: employeePaymentMethod,
    earningsCents: v.number(),
    deductionsCents: v.number(),
    foodBasketEnabled: v.boolean(),
    transportFoodDays: v.number(),
    dailyTransitCents: v.number(),
    supplementCents: v.number(),
    thirteenthFirstCents: v.number(),
    thirteenthSecondCents: v.number(),
    manualLoanDeductionCents: v.number(),
    awayNotes: v.optional(v.string()),
    notes: v.optional(v.string()),
    paid: v.boolean(),
    paidAt: v.optional(v.number()),
    paidByUserId: v.optional(v.id("users")),
    mealVoucherCents: v.number(),
    transitVoucherCents: v.number(),
    foodBasketCents: v.number(),
    scheduledLoanDeductionCents: v.number(),
    totalLoanDeductionCents: v.number(),
    totalPaymentCents: v.number(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_run", ["runId"])
    .index("by_employee", ["employeeId"])
    .index("by_run_and_employee", ["runId", "employeeId"]),

  employeeLoans: defineTable({
    employeeId: v.id("employees"),
    totalCents: v.number(),
    installmentCount: v.number(),
    installmentCents: v.number(),
    startYear: v.number(),
    startMonth: v.number(),
    description: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    createdByUserId: v.optional(v.id("users")),
    updatedByUserId: v.optional(v.id("users")),
  }).index("by_employee", ["employeeId"]),

  // Pensão alimentícia: pagamento mensal a um beneficiário (ex-cônjuge, filho)
  // por conta de um funcionário. É uma linha própria da folha, paga direto ao
  // beneficiário, com valor que pode mudar mês a mês. Não se mistura com a
  // linha do funcionário: não entra nos descontos nem no total dele (a
  // retenção oficial fica no holerite da contabilidade).
  employeeAlimonies: defineTable({
    employeeId: v.id("employees"),
    beneficiaryName: v.string(),
    // Valor padrão ao abrir um mês sem histórico; a folha ajusta por mês.
    amountCents: v.number(),
    paymentMethod: employeePaymentMethod,
    pixKey: v.optional(v.string()),
    notes: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    archivedByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    createdByUserId: v.optional(v.id("users")),
    updatedByUserId: v.optional(v.id("users")),
  }).index("by_employee", ["employeeId"]),

  payrollAlimonyLines: defineTable({
    runId: v.id("payrollRuns"),
    alimonyId: v.id("employeeAlimonies"),
    employeeId: v.id("employees"),
    // Snapshots do mês, como nas linhas de funcionário.
    employeeName: v.string(),
    beneficiaryName: v.string(),
    amountCents: v.number(),
    paymentMethod: employeePaymentMethod,
    pixKey: v.optional(v.string()),
    notes: v.optional(v.string()),
    paid: v.boolean(),
    paidAt: v.optional(v.number()),
    paidByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_run", ["runId"])
    .index("by_alimony", ["alimonyId"])
    .index("by_run_and_alimony", ["runId", "alimonyId"]),

  // --- RH: Ponto ---
  //
  // Cada marcação é de um usuário do app com a permissão `ponto.registrar`,
  // feita pelo app RLP com foto e/ou localização. A obra vem da cerca
  // (`projects.geofence`) que contém a posição. O cadastro de funcionários
  // (`employees`) é só da folha e não participa do ponto.

  // Singleton (key = "default"): preferências do módulo de ponto.
  clockSettings: defineTable({
    key: v.literal("default"),
    // Custo estimado de um homem-dia (para o relatório mensal).
    manDayCostCents: v.number(),
    photoRequired: v.boolean(),
    locationRequired: v.boolean(),
    // Janela (min) em que uma nova marcação do mesmo usuário é recusada.
    duplicateWindowMinutes: v.number(),
    updatedAt: v.number(),
    updatedByUserId: v.optional(v.id("users")),
  }).index("by_key", ["key"]),

  // Contadores monotônicos do ponto (ex.: NSR das marcações).
  timeClockCounters: defineTable({
    key: v.string(),
    value: v.number(),
  }).index("by_key", ["key"]),

  // Uma linha por marcação.
  clockPunches: defineTable({
    userId: v.id("users"),
    // Nome do usuário no momento da marcação (vai no comprovante).
    personName: v.string(),
    // Chave de idempotência gerada no aparelho (reenvio da fila offline).
    clientPunchId: v.string(),
    // Dia civil em Brasília ("YYYY-MM-DD").
    date: v.string(),
    // Horário oficial, atribuído pelo servidor (offline: o do aparelho).
    punchedAt: v.number(),
    // "HH:MM" em Brasília.
    timeLabel: v.string(),
    // Posição da marcação dentro do dia (0 = primeira).
    sequence: v.number(),
    kind: timeClockPunchKind,
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    accuracyMeters: v.optional(v.number()),
    photoStorageId: v.optional(v.id("_storage")),
    // Obra da cerca que contém a posição ou, fora de todas, a mais próxima
    // (`geofenceStatus` diz qual dos dois).
    projectId: v.optional(v.id("projects")),
    projectName: v.optional(v.string()),
    geofenceStatus: timeClockGeofenceStatus,
    // Relógio do aparelho no toque em "Registrar ponto".
    capturedAt: v.number(),
    offline: v.boolean(),
    deviceModel: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    // Comprovante: número sequencial e hash SHA-256 da marcação.
    nsr: v.number(),
    hash: v.string(),
  })
    .index("by_date", ["date"])
    .index("by_user_and_date", ["userId", "date"])
    .index("by_client_punch_id", ["clientPunchId"]),

  // Resumo diário por usuário (só dias com marcação), recalculado a cada
  // marcação. Base do relatório mensal de homem-dia.
  clockDays: defineTable({
    date: v.string(),
    userId: v.id("users"),
    personName: v.string(),
    // Obra do dia: a da primeira marcação dentro de uma cerca.
    projectId: v.optional(v.id("projects")),
    projectName: v.optional(v.string()),
    firstPunchAt: v.number(),
    lastPunchAt: v.number(),
    lastKind: timeClockPunchKind,
    punchCount: v.number(),
    updatedAt: v.number(),
  })
    .index("by_date", ["date"])
    .index("by_user_and_date", ["userId", "date"]),
});
