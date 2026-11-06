import { defineTable } from "convex/server";
import { v } from "convex/values";

// Catálogo de materiais, fornecedores, preços e takeoffs do app desktop.

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

export const procurementTables = {
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
};
