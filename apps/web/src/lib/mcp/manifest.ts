/**
 * Manifesto de ferramentas curadas, orientadas a tarefa.
 *
 * Cada entrada liga uma ferramenta MCP a uma função pública do Convex. O schema
 * de entrada vem do validador da função (via catálogo, ver convex-schema.ts);
 * tudo o que o agente precisa para *escolher* a ferramenta (nome, descrição,
 * anotações) é escrito à mão aqui.
 *
 * Regras:
 * - Nome pela intenção (`create_customer`), não pela implementação.
 * - Diga quando usar, o que devolve e as unidades (epoch ms, centavos).
 * - Marque como `destructive` o que apaga/arquiva/revoga.
 * - Use `serverArgs` para argumentos que o agente nunca deveria informar (`now`).
 * - Nunca inclua funções que devolvam tokens de QR code, ids de storage ou
 *   URLs de upload: as 6 ferramentas de engenharia já existentes (tools.ts)
 *   removem esses campos de propósito.
 */

export interface ToolSpec {
  /** Nome MCP: `^[a-zA-Z0-9_-]{1,64}$`. */
  name: string;
  /** Função pública do Convex, `modulo:funcao`. */
  function: string;
  title: string;
  description: string;
  /** Mutations que removem ou alteram dados de forma irreversível. */
  destructive?: boolean;
  /** Repetir a chamada com a mesma entrada não tem efeito adicional. */
  idempotent?: boolean;
  /** Descrições por argumento que sobrepõem as dicas compartilhadas. */
  fieldDescriptions?: Record<string, string>;
  /** Argumentos preenchidos pelo servidor; saem do schema de entrada. */
  serverArgs?: () => Record<string, unknown>;
}

const nowArg = () => ({ now: Date.now() });

const PAGINATION_HINT =
  'Use { "numItems": 50, "cursor": null } for the first page and pass continueCursor back as cursor for the next one.';

export const TOOLS: readonly ToolSpec[] = [
  // --------------------------------------------------------------------------
  // Obras (projects) and their hierarchy
  // --------------------------------------------------------------------------
  {
    name: "create_project",
    function: "projects:create",
    title: "Create project (obra)",
    description:
      "Create a new engineering project (obra). Needs the customer id (list_customers) and the internal obra number. Returns the new project id. Add towers, floors, environments and equipment afterwards.",
    fieldDescriptions: {
      client: "Legacy free-text client name. Prefer customerId.",
      floors: "Legacy floor list for old-style projects; leave empty and use create_tower / create_floors instead.",
      responsibleId: "User id of the engineer responsible (list_users).",
    },
  },
  {
    name: "update_project",
    function: "projects:update",
    title: "Update project",
    description:
      "Change fields of a project (name, customer, status, dates, responsible). Only provided fields change; pass null to clear a nullable field.",
    idempotent: true,
  },
  {
    name: "archive_project",
    function: "projects:archive",
    title: "Archive project",
    description: "Archive a project so it leaves the active lists. Reversible with restore_project.",
    destructive: true,
    idempotent: true,
  },
  {
    name: "restore_project",
    function: "projects:restore",
    title: "Restore archived project",
    description: "Bring an archived project back, optionally setting its status.",
    idempotent: true,
  },
  {
    name: "list_project_technicians",
    function: "projects:getAssignedTechnicians",
    title: "List project technicians",
    description: "Field technicians (users) assigned to a project.",
  },
  {
    name: "set_project_technicians",
    function: "projects:setTechnicians",
    title: "Set project technicians",
    description:
      "Replace the full list of field technicians assigned to a project. Pass every user id that should remain assigned.",
    idempotent: true,
  },
  {
    name: "list_towers",
    function: "towers:list",
    title: "List towers",
    description: "Towers (blocks) of a project with their floor counts.",
  },
  {
    name: "create_tower",
    function: "towers:create",
    title: "Create tower",
    description: "Add a tower/block to a project. Returns the tower id.",
  },
  {
    name: "update_tower",
    function: "towers:update",
    title: "Update tower",
    description: "Rename or reorder a tower.",
    idempotent: true,
  },
  {
    name: "delete_tower",
    function: "towers:remove",
    title: "Delete tower",
    description: "Delete a tower and everything under it (floors, environments, planned equipment). Cannot be undone; confirm with the user first.",
    destructive: true,
  },
  {
    name: "list_floors",
    function: "floors:listByTower",
    title: "List floors",
    description: "Floors of a tower, with number and label.",
  },
  {
    name: "create_floors",
    function: "floors:create",
    title: "Create floors",
    description: "Add one or more floors to a tower in a single call. Returns the new floor ids.",
    fieldDescriptions: {
      floors: "Floors to add, each with a number (e.g. 3, 0 for ground, -1 for basement) and an optional label.",
    },
  },
  {
    name: "update_floor",
    function: "floors:update",
    title: "Update floor",
    description: "Change a floor's label or number.",
    idempotent: true,
  },
  {
    name: "delete_floor",
    function: "floors:remove",
    title: "Delete floor",
    description: "Delete a floor and its environments/equipment. Cannot be undone.",
    destructive: true,
  },
  {
    name: "list_environments",
    function: "environments:listByFloor",
    title: "List environments",
    description: "Environments (rooms/areas) of a floor with their grid layout.",
  },
  {
    name: "create_environment",
    function: "environments:create",
    title: "Create environment",
    description: "Add an environment (room/area) to a floor. Returns the environment id.",
  },
  {
    name: "update_environment",
    function: "environments:update",
    title: "Update environment",
    description: "Change an environment's name, type or grid position. Pass null to reset layout fields.",
    idempotent: true,
  },
  {
    name: "delete_environment",
    function: "environments:remove",
    title: "Delete environment",
    description: "Delete an environment and its planned equipment. Cannot be undone.",
    destructive: true,
  },
  {
    name: "list_systems",
    function: "systems:listSystemsByProject",
    title: "List systems",
    description: "HVAC systems (e.g. VRF, split) of a project, with counts of linked equipment.",
  },
  {
    name: "create_system",
    function: "systems:createSystemInProject",
    title: "Create system",
    description: "Add a system to a project. Returns the system id.",
  },
  {
    name: "update_system",
    function: "systems:updateSystemDetails",
    title: "Update system",
    description: "Change a system's name, type or notes.",
    idempotent: true,
  },
  {
    name: "delete_system",
    function: "systems:removeSystemFromProject",
    title: "Delete system",
    description: "Remove a system from a project. Cannot be undone.",
    destructive: true,
  },

  // --------------------------------------------------------------------------
  // Planned equipment (projectEquipment)
  // --------------------------------------------------------------------------
  {
    name: "list_unassigned_equipment",
    function: "projectEquipment:listUnassigned",
    title: "List unassigned planned equipment",
    description: "Planned equipment items of a project that are not placed in any environment yet.",
  },
  {
    name: "create_unassigned_equipment",
    function: "projectEquipment:createUnassigned",
    title: "Create unassigned planned equipment",
    description: "Add a planned equipment item to a project without placing it in an environment. Returns the item id.",
    fieldDescriptions: {
      kind: "Equipment kind (evaporator, condenser, ...).",
      modelo: "Model name as printed by the manufacturer.",
      capacidade: "Capacity, e.g. '12000 BTU'.",
    },
  },
  {
    name: "assign_equipment_to_environment",
    function: "projectEquipment:assignToEnvironment",
    title: "Place planned equipment in environment",
    description: "Move an unassigned planned equipment item into an environment (and optionally a system).",
    idempotent: true,
  },
  {
    name: "upsert_equipment_in_environment",
    function: "projectEquipment:upsertInEnvironment",
    title: "Create or update planned equipment in environment",
    description:
      "Create a planned equipment item inside an environment, or update it when itemId is given. Returns the item id.",
    fieldDescriptions: {
      itemId: "Omit to create; pass an existing projectEquipment id to update it.",
      kind: "Equipment kind (evaporator, condenser, ...).",
      obs: "Free-text notes; null clears.",
    },
  },
  {
    name: "set_planned_equipment_status",
    function: "projectEquipment:setStatus",
    title: "Set planned equipment status",
    description: "Change the installation status of a planned equipment item.",
    idempotent: true,
  },
  {
    name: "delete_planned_equipment",
    function: "projectEquipment:remove",
    title: "Delete planned equipment",
    description: "Delete a planned equipment item. Cannot be undone.",
    destructive: true,
  },
  {
    name: "update_equipment",
    function: "equipment:update",
    title: "Update registered equipment",
    description: "Change description, status or the planned item link of a physical equipment registered in the field (ids from get_equipment / project overview).",
    idempotent: true,
  },
  {
    name: "list_maintenance_logs",
    function: "maintenanceLogs:listByEquipment",
    title: "List maintenance logs",
    description: "Installation and maintenance records of a registered physical equipment, newest first.",
  },
  {
    name: "list_equipment_history",
    function: "equipmentHistory:listForEquipment",
    title: "List planned equipment history",
    description: "Audit trail (status changes, notes, location) of a planned equipment item.",
  },

  // --------------------------------------------------------------------------
  // Checklists
  // --------------------------------------------------------------------------
  {
    name: "list_checklist_templates",
    function: "checklists:listTemplates",
    title: "List checklist templates",
    description: "Checklist templates, global or scoped to a project.",
  },
  {
    name: "create_checklist_template",
    function: "checklists:createTemplate",
    title: "Create checklist template",
    description: "Create a reusable checklist template. Returns the template id.",
  },
  {
    name: "list_equipment_checklist",
    function: "checklists:listForEquipment",
    title: "List equipment checklist",
    description: "Checklist items of a planned equipment item with completion state.",
    fieldDescriptions: { equipmentId: "projectEquipment id (planned item), not the physical equipment id." },
  },
  {
    name: "apply_checklist_template",
    function: "checklists:applyTemplate",
    title: "Apply checklist template",
    description: "Copy a template's items onto a planned equipment item. Returns how many items were added.",
    fieldDescriptions: { replace: "true removes the existing items first." },
  },
  {
    name: "add_checklist_item",
    function: "checklists:addItem",
    title: "Add checklist item",
    description: "Add a single checklist item to a planned equipment item.",
  },
  {
    name: "toggle_checklist_item",
    function: "checklists:toggleItem",
    title: "Complete or reopen checklist item",
    description: "Mark a checklist item as completed (or not), optionally with notes.",
    idempotent: true,
  },
  {
    name: "delete_checklist_item",
    function: "checklists:removeItem",
    title: "Delete checklist item",
    description: "Remove a checklist item. Cannot be undone.",
    destructive: true,
  },

  // --------------------------------------------------------------------------
  // QR codes (counts only — tokens are never exposed)
  // --------------------------------------------------------------------------
  {
    name: "get_qr_code_stats",
    function: "qrCodes:stats",
    title: "QR code stats",
    description: "Totals of printed QR labels: linked to equipment vs still free.",
  },
  {
    name: "list_qr_batches",
    function: "qrCodes:listBatches",
    title: "List QR label batches",
    description: "Recent batches of printed QR labels with counts and destination project.",
  },

  // --------------------------------------------------------------------------
  // Customers and contractors
  // --------------------------------------------------------------------------
  {
    name: "list_customers",
    function: "customers:list",
    title: "List customers",
    description: "Customers (clientes) with contact data. Use to resolve a customerId before creating projects or contracts.",
  },
  {
    name: "get_customer",
    function: "customers:get",
    title: "Get customer",
    description: "One customer with its contacts.",
  },
  {
    name: "create_customer",
    function: "customers:create",
    title: "Create customer",
    description: "Create a customer (pessoa física or jurídica). Returns the customer id.",
    fieldDescriptions: { personType: "pf = individual (CPF), pj = company (CNPJ)." },
  },
  {
    name: "update_customer",
    function: "customers:update",
    title: "Update customer",
    description: "Change customer fields. Only provided fields change.",
    idempotent: true,
  },
  {
    name: "archive_customer",
    function: "customers:archive",
    title: "Archive customer",
    description: "Archive a customer (hidden from lists). Reversible with restore_customer.",
    destructive: true,
    idempotent: true,
  },
  {
    name: "restore_customer",
    function: "customers:restore",
    title: "Restore customer",
    description: "Restore an archived customer.",
    idempotent: true,
  },
  {
    name: "add_customer_contact",
    function: "customers:addContact",
    title: "Add customer contact",
    description: "Add a contact person to a customer. Returns the contact id.",
  },
  {
    name: "update_customer_contact",
    function: "customers:updateContact",
    title: "Update customer contact",
    description: "Change a customer contact. Pass null to clear a field.",
    idempotent: true,
  },
  {
    name: "remove_customer_contact",
    function: "customers:removeContact",
    title: "Remove customer contact",
    description: "Deactivate a customer contact.",
    destructive: true,
    idempotent: true,
  },
  {
    name: "list_contractors",
    function: "contractors:list",
    title: "List contractors",
    description: "Contractors (empreiteiros) hired for project work.",
  },
  {
    name: "get_contractor",
    function: "contractors:get",
    title: "Get contractor",
    description: "One contractor with its contacts.",
  },
  {
    name: "create_contractor",
    function: "contractors:create",
    title: "Create contractor",
    description: "Create a contractor. Returns the contractor id.",
  },
  {
    name: "update_contractor",
    function: "contractors:update",
    title: "Update contractor",
    description: "Change contractor fields. Only provided fields change.",
    idempotent: true,
  },
  {
    name: "archive_contractor",
    function: "contractors:archive",
    title: "Archive contractor",
    description: "Archive a contractor. Reversible with restore_contractor.",
    destructive: true,
    idempotent: true,
  },
  {
    name: "restore_contractor",
    function: "contractors:restore",
    title: "Restore contractor",
    description: "Restore an archived contractor.",
    idempotent: true,
  },
  {
    name: "add_contractor_contact",
    function: "contractors:addContact",
    title: "Add contractor contact",
    description: "Add a contact person to a contractor.",
  },
  {
    name: "update_contractor_contact",
    function: "contractors:updateContact",
    title: "Update contractor contact",
    description: "Change a contractor contact. Pass null to clear a field.",
    idempotent: true,
  },
  {
    name: "remove_contractor_contact",
    function: "contractors:removeContact",
    title: "Remove contractor contact",
    description: "Deactivate a contractor contact.",
    destructive: true,
    idempotent: true,
  },

  // --------------------------------------------------------------------------
  // Contracts and measurements (medições)
  // --------------------------------------------------------------------------
  {
    name: "list_contracts",
    function: "contracts:list",
    title: "List contracts",
    description: "Contracts (sales to customers or contractor hires), optionally filtered by project or direction.",
  },
  {
    name: "get_contract",
    function: "contracts:get",
    title: "Get contract",
    description: "Full contract with service items and totals.",
  },
  {
    name: "create_contract",
    function: "contracts:create",
    title: "Create contract",
    description:
      "Create a contract. direction client_sale needs customerId; contractor_hire needs contractorId. kind addendum needs parentContractId. Service items carry the amounts in BRL cents. Returns the contract id.",
  },
  {
    name: "update_contract",
    function: "contracts:update",
    title: "Update contract",
    description: "Change contract fields or replace its service items.",
    idempotent: true,
  },
  {
    name: "delete_contract",
    function: "contracts:remove",
    title: "Delete contract",
    description: "Delete a contract. Cannot be undone; confirm with the user first.",
    destructive: true,
  },
  {
    name: "get_contract_billing_overview",
    function: "contracts:getBillingOverview",
    title: "Contract billing overview",
    description: "Per-contract totals: contracted, measured, approved and paid amounts (BRL cents).",
  },
  {
    name: "list_measurement_contracts",
    function: "medicoes:listContracts",
    title: "List contracts eligible for measurement",
    description: "Customer-sale contracts of a project that can receive measurements (medições), with totals.",
  },
  {
    name: "list_measurements",
    function: "medicoes:listMedicoes",
    title: "List measurements",
    description: "Measurements (medições) of a project with status and amounts.",
  },
  {
    name: "get_project_progress",
    function: "medicoes:getProgress",
    title: "Project installation progress",
    description: "Installed vs planned equipment and the resulting percentage for a project.",
  },
  {
    name: "create_measurement",
    function: "medicoes:createMedicao",
    title: "Create measurement",
    description:
      "Record billable progress (medição) against a contract, either as a percentage of the contract or as an absolute amount in BRL cents. Returns the measurement id.",
    fieldDescriptions: {
      basis: "percent → use `percent`; amount → use `amountCents`.",
    },
  },
  {
    name: "update_measurement",
    function: "medicoes:updateMedicao",
    title: "Update measurement",
    description: "Change a measurement's description, basis, value or reference date.",
    idempotent: true,
  },
  {
    name: "set_measurement_status",
    function: "medicoes:setMedicaoStatus",
    title: "Set measurement status",
    description: "Move a measurement through its workflow (e.g. draft → approved → paid).",
    idempotent: true,
  },
  {
    name: "delete_measurement",
    function: "medicoes:removeMedicao",
    title: "Delete measurement",
    description: "Delete a measurement. Cannot be undone.",
    destructive: true,
  },
  {
    name: "get_measurements_overview",
    function: "medicoes:getOverview",
    title: "Measurements overview",
    description: "Per-project contract totals vs measured, approved and paid amounts (BRL cents).",
  },

  // --------------------------------------------------------------------------
  // Dashboards, documents, activity, estimates
  // --------------------------------------------------------------------------
  {
    name: "get_director_overview",
    function: "dashboard:getDirectorOverview",
    title: "Director dashboard",
    description: "KPIs, per-project progress, critical pending items, recent activity and weekly summary for the whole operation.",
    serverArgs: nowArg,
  },
  {
    name: "list_project_documents",
    function: "projectDocuments:listByProject",
    title: "List project documents",
    description: "Documents (PDFs) attached to a project with their field-access settings. Download is only available in the app.",
  },
  {
    name: "list_project_activity",
    function: "technicianActivity:listProjectActivity",
    title: "List field activity",
    description: "Paginated feed of field activity (registrations, maintenances, status changes) in a project, optionally for one technician.",
    fieldDescriptions: { paginationOpts: PAGINATION_HINT },
  },
  {
    name: "list_duct_estimates",
    function: "ductEstimates:list",
    title: "List duct estimates",
    description: "Saved duct sizing estimates of a project.",
  },
  {
    name: "get_duct_estimate",
    function: "ductEstimates:get",
    title: "Get duct estimate",
    description: "One duct sizing estimate with its inputs and results.",
  },

  // --------------------------------------------------------------------------
  // Team and audit
  // --------------------------------------------------------------------------
  {
    name: "list_users",
    function: "users:list",
    title: "List users",
    description: "Internal users with role and department. Use to resolve ids for responsibleId / technicianIds.",
  },
  {
    name: "get_user",
    function: "users:get",
    title: "Get user",
    description: "One internal user by id.",
  },
  {
    name: "list_audit_logs",
    function: "auditLogs:listByTable",
    title: "List audit logs",
    description: "Paginated audit trail for a table (e.g. projects, materials). Admins only.",
    fieldDescriptions: { paginationOpts: PAGINATION_HINT },
  },

  // --------------------------------------------------------------------------
  // Purchasing: materials, suppliers, prices, takeoffs
  // --------------------------------------------------------------------------
  {
    name: "list_materials",
    function: "materials:list",
    title: "List materials",
    description: "Material catalog entries (name, SKU, unit, category). Use search to narrow.",
  },
  {
    name: "search_material_catalog",
    function: "materials:listCatalog",
    title: "Search material catalog (paginated)",
    description:
      "Paginated material catalog with supplier summary (count, preferred supplier) and latest usable price with freshness. Filter by `search`, `category` and `status` (active | draft | archived).",
    fieldDescriptions: { paginationOpts: PAGINATION_HINT },
  },
  {
    name: "list_material_categories",
    function: "materials:listCategories",
    title: "List material categories",
    description: "Distinct material categories in use.",
  },
  {
    name: "list_material_families",
    function: "materials:listFamilies",
    title: "List material families",
    description: "Material families (groups of variants of the same product).",
  },
  {
    name: "get_material",
    function: "materials:get",
    title: "Get material",
    description: "One material with full catalog details.",
  },
  {
    name: "suggest_materials",
    function: "materials:suggest",
    title: "Suggest materials",
    description: "Fuzzy lookup of materials by name, alias, SKU or barcode. Use to resolve a materialId from free text.",
  },
  {
    name: "create_material",
    function: "materials:create",
    title: "Create material",
    description: "Create a material in the catalog. Returns the material id.",
    fieldDescriptions: {
      unitsPerPurchaseUnit: "How many base units one purchase unit contains (e.g. box of 12).",
      aliases: "Alternative names used in quotes/invoices for matching.",
    },
  },
  {
    name: "update_material",
    function: "materials:update",
    title: "Update material",
    description: "Change material fields. Only provided fields change; null clears nullable fields.",
    idempotent: true,
  },
  {
    name: "add_material_alias",
    function: "materials:addAlias",
    title: "Add material alias",
    description: "Register an alternative name for a material so quotes and takeoffs match it.",
  },
  {
    name: "list_suppliers",
    function: "suppliers:list",
    title: "List suppliers",
    description:
      "Suppliers (fornecedores) with CNPJ/CPF, legal name, contact data, payment terms, default lead time and categories. `search` matches name, legal name, category or tax id digits.",
  },
  {
    name: "get_supplier",
    function: "suppliers:get",
    title: "Get supplier",
    description: "One supplier (full register) with its contact people.",
  },
  {
    name: "create_supplier",
    function: "suppliers:create",
    title: "Create supplier",
    description:
      "Create a supplier: name (trade name) plus optional personType, legalName, taxId (CNPJ/CPF, validated and unique), stateRegistration, email, phone, website, address, paymentTerms, defaultLeadTimeDays, categories and notes. Returns the supplier id.",
  },
  {
    name: "update_supplier",
    function: "suppliers:update",
    title: "Update supplier",
    description:
      "Change supplier register fields (same fields as create, plus active). Pass null in taxId/personType/defaultLeadTimeDays to clear them.",
    idempotent: true,
  },
  {
    name: "add_supplier_contact",
    function: "suppliers:addContact",
    title: "Add supplier contact",
    description: "Add a contact person (with WhatsApp/email) to a supplier.",
  },
  {
    name: "list_supplier_material_offerings",
    function: "suppliers:listMaterialOfferings",
    title: "List supplier offerings",
    description:
      "Which suppliers offer a material (or which materials a supplier offers), with codes, purchase unit, payment terms and the effective lead time (offering value or the supplier default).",
  },
  {
    name: "upsert_supplier_material_offering",
    function: "suppliers:upsertMaterialOffering",
    title: "Create or update supplier offering",
    description: "Link a material to a supplier with its code, purchase unit, lead time and preference.",
    idempotent: true,
  },
  {
    name: "list_price_events",
    function: "priceEvents:list",
    title: "List price events",
    description: "Price observations (quotes, invoices, estimates) newest first, filterable by material, project or takeoff. Prices in BRL cents.",
    serverArgs: nowArg,
  },
  {
    name: "get_latest_material_prices",
    function: "priceEvents:latestForMaterial",
    title: "Latest prices for a material",
    description: "Most recent valid prices for a material (by id or raw description).",
    serverArgs: nowArg,
  },
  {
    name: "add_price_event",
    function: "priceEvents:add",
    title: "Record price",
    description: "Record a price observation for a material from a quote, invoice or estimate. unitPriceCents in BRL cents. Returns the event id.",
  },
  {
    name: "list_price_review_queue",
    function: "priceEvents:reviewQueue",
    title: "Price review queue",
    description: "Price events waiting for purchasing review (unmatched material/supplier).",
    serverArgs: nowArg,
  },
  {
    name: "review_price_event",
    function: "priceEvents:updateReview",
    title: "Review price event",
    description: "Approve/reject a price event and fix its material or supplier link.",
    idempotent: true,
  },
  {
    name: "get_purchasing_dashboard",
    function: "priceEvents:dashboardStats",
    title: "Purchasing dashboard",
    description: "Counts of active materials/suppliers, unreviewed and stale prices, recent events and takeoffs needing pricing.",
    serverArgs: nowArg,
  },
  {
    name: "list_takeoffs",
    function: "takeoffs:list",
    title: "List takeoffs",
    description: "Material takeoffs (quantity lists), optionally for one project.",
  },
  {
    name: "get_takeoff",
    function: "takeoffs:get",
    title: "Get takeoff",
    description: "A takeoff with its items, matched materials and current price suggestions.",
    serverArgs: nowArg,
  },
  {
    name: "create_takeoff",
    function: "takeoffs:create",
    title: "Create takeoff",
    description: "Create an empty takeoff, optionally linked to a project. Returns the takeoff id.",
  },
  {
    name: "add_takeoff_item",
    function: "takeoffs:addItem",
    title: "Add takeoff item",
    description: "Add a line (raw description, quantity, unit, optional matched material) to a takeoff.",
  },
  {
    name: "update_takeoff_item",
    function: "takeoffs:updateItem",
    title: "Update takeoff item",
    description: "Change a takeoff line, including matching it to a material or setting its status.",
    idempotent: true,
  },
  {
    name: "delete_takeoff_item",
    function: "takeoffs:removeItem",
    title: "Delete takeoff item",
    description: "Remove a takeoff line. Cannot be undone.",
    destructive: true,
  },

  // --------------------------------------------------------------------------
  // Inventory (estoque)
  // --------------------------------------------------------------------------
  {
    name: "list_inventory_balances",
    function: "inventory:listBalances",
    title: "List inventory balances",
    description: "Paginated stock balances per location/material with replenishment state. Filter by project for a site's stock.",
    fieldDescriptions: { paginationOpts: PAGINATION_HINT },
  },
  {
    name: "list_inventory_project_summaries",
    function: "inventory:listProjectSummaries",
    title: "Inventory per project",
    description: "Per-project counts of materials, transfers, consumptions and returns.",
  },
  {
    name: "list_inventory_documents",
    function: "inventory:listDocuments",
    title: "List inventory documents",
    description: "Paginated stock movement documents (receipts, transfers, consumption, adjustments) with status.",
    fieldDescriptions: { paginationOpts: PAGINATION_HINT },
  },
  {
    name: "list_inventory_events",
    function: "inventory:listEvents",
    title: "List inventory events",
    description: "Recent stock movement events (legacy view).",
  },
  {
    name: "list_inventory_pending_approvals",
    function: "inventory:listPendingApprovals",
    title: "Inventory documents awaiting approval",
    description: "Movement documents that need review before posting.",
  },
  {
    name: "create_inventory_document",
    function: "inventory:createDocument",
    title: "Create inventory document",
    description: "Create a stock movement document (receipt, transfer to site, consumption, return, adjustment) with its lines. It stays a draft or goes to approval; post it with post_inventory_document.",
  },
  {
    name: "post_inventory_document",
    function: "inventory:postDocument",
    title: "Post inventory document",
    description: "Apply a draft movement document to stock balances.",
    idempotent: true,
  },
  {
    name: "review_inventory_document",
    function: "inventory:reviewDocument",
    title: "Approve or reject inventory document",
    description: "Decide on a movement document waiting for approval, with a reason.",
    idempotent: true,
  },
  {
    name: "list_inventory_rules",
    function: "inventory:listRules",
    title: "List stock rules",
    description: "Minimum/reorder/target quantity rules per material and location.",
  },
  {
    name: "list_inventory_requests",
    function: "inventoryRequests:listOfficeRequests",
    title: "List material requests",
    description: "Material requests made by field teams, optionally filtered by project or status.",
  },
  {
    name: "get_inventory_request",
    function: "inventoryRequests:getRequest",
    title: "Get material request",
    description: "One material request with its lines.",
  },
  {
    name: "review_inventory_request",
    function: "inventoryRequests:reviewRequest",
    title: "Approve or reject material request",
    description: "Decide on a field material request, with a reason.",
    idempotent: true,
  },
  {
    name: "mark_inventory_request_fulfilled",
    function: "inventoryRequests:markFulfilled",
    title: "Mark material request fulfilled",
    description: "Link an approved request to the movement document that fulfilled it.",
    idempotent: true,
  },

  // --------------------------------------------------------------------------
  // HR: employees, payroll, time clock
  // --------------------------------------------------------------------------
  {
    name: "list_employees",
    function: "employees:list",
    title: "List employees",
    description: "Employees (funcionários) with job title, status and payroll parameters.",
  },
  {
    name: "get_employee",
    function: "employees:get",
    title: "Get employee",
    description: "One employee record.",
  },
  {
    name: "create_employee",
    function: "employees:create",
    title: "Create employee",
    description: "Create an employee. Salary and allowance fields are in BRL cents. Returns the employee id.",
  },
  {
    name: "update_employee",
    function: "employees:update",
    title: "Update employee",
    description: "Change employee fields. Pass null to clear nullable fields.",
    idempotent: true,
  },
  {
    name: "archive_employee",
    function: "employees:archive",
    title: "Archive employee",
    description: "Archive an employee (terminated/inactive). Reversible in the app.",
    destructive: true,
    idempotent: true,
  },
  {
    name: "list_payroll_runs",
    function: "payroll:listRuns",
    title: "List payroll runs",
    description: "Monthly payroll runs, optionally for one year.",
  },
  {
    name: "get_payroll_workspace",
    function: "payroll:getWorkspace",
    title: "Payroll workspace",
    description: "Everything about one month's payroll: run, lines per employee, totals, KPIs and employees not yet included.",
  },
  {
    name: "create_payroll_run",
    function: "payroll:createRun",
    title: "Create payroll run",
    description: "Open the payroll run for a payment month. Returns the run id.",
  },
  {
    name: "list_employee_loans",
    function: "payroll:listLoans",
    title: "List employee loans",
    description: "Loans/advances of an employee as of a payment month.",
  },
  {
    name: "get_time_clock_day",
    function: "timeClock:getDay",
    title: "Time clock: day",
    description: "Punches, presence and per-worksite summary for one day (mirror of the RHID access control).",
    fieldDescriptions: { date: "Day as YYYY-MM-DD." },
  },
  {
    name: "get_time_clock_live_status",
    function: "timeClock:getLiveStatus",
    title: "Time clock: who is on site now",
    description: "Live presence per person and worksite for a day (on site, lunch, left, absent, outside fence).",
    fieldDescriptions: { date: "Day as YYYY-MM-DD." },
  },
  {
    name: "get_time_clock_month_stats",
    function: "timeClock:getMonthStats",
    title: "Time clock: month stats",
    description: "Man-days per person and per worksite for a month, with cost.",
  },
  {
    name: "get_time_clock_sync_status",
    function: "timeClock:getSyncStatus",
    title: "Time clock: sync status",
    description: "When the RHID mirror last synced and whether it is configured.",
  },

  // --------------------------------------------------------------------------
  // Payroll lines, runs and loans
  // --------------------------------------------------------------------------
  {
    name: "add_payroll_line",
    function: "payroll:addEmployeeToRun",
    title: "Add employee to payroll run",
    description: "Add a payroll line to a run, either for an existing employee (employeeId) or an ad-hoc name. Returns the line id.",
  },
  {
    name: "update_payroll_line",
    function: "payroll:updateLine",
    title: "Update payroll line",
    description: "Change a payroll line: salary, earnings, deductions, allowances, 13th salary parts, manual loan deduction, notes. All money fields are BRL cents. Pass null to clear nullable text fields.",
    idempotent: true,
  },
  {
    name: "remove_payroll_line",
    function: "payroll:removeLine",
    title: "Remove payroll line",
    description: "Remove an employee's line from a payroll run. Cannot be undone.",
    destructive: true,
  },
  {
    name: "set_payroll_line_paid",
    function: "payroll:togglePaid",
    title: "Mark payroll line paid",
    description: "Mark a payroll line as paid or unpaid.",
    idempotent: true,
  },
  {
    name: "update_payroll_run_parameters",
    function: "payroll:updateRunParameters",
    title: "Update payroll run parameters",
    description: "Change the run-wide defaults: meal voucher per day, food basket value, default daily transit and transport/food days (BRL cents where applicable).",
    idempotent: true,
  },
  {
    name: "close_payroll_run",
    function: "payroll:closeRun",
    title: "Close payroll run",
    description: "Close a payroll run so its lines stop being editable. Reopen with reopen_payroll_run.",
    idempotent: true,
  },
  {
    name: "reopen_payroll_run",
    function: "payroll:reopenRun",
    title: "Reopen payroll run",
    description: "Reopen a closed payroll run for corrections.",
    idempotent: true,
  },
  {
    name: "create_employee_loan",
    function: "payroll:createLoan",
    title: "Create employee loan",
    description: "Register a loan/advance for an employee, split into monthly installments deducted from payroll starting at startYear/startMonth. Amounts in BRL cents. Returns the loan id.",
  },
  {
    name: "update_employee_loan",
    function: "payroll:updateLoan",
    title: "Update employee loan",
    description: "Change a loan's total, installments, start month or description.",
    idempotent: true,
  },
  {
    name: "archive_employee_loan",
    function: "payroll:archiveLoan",
    title: "Archive employee loan",
    description: "Archive a loan so it stops being deducted. Cannot be undone from here.",
    destructive: true,
    idempotent: true,
  },
  {
    name: "restore_employee",
    function: "employees:restore",
    title: "Restore employee",
    description: "Restore an archived employee.",
    idempotent: true,
  },

  // --------------------------------------------------------------------------
  // Inventory: locations, movements, stock policies, rules
  // --------------------------------------------------------------------------
  {
    name: "list_inventory_locations",
    function: "inventoryStockPolicies:listLocations",
    title: "List inventory locations",
    description: "Stock locations (central warehouse and project sites) with ids. Use to pick a locationId for stock policies.",
  },
  {
    name: "ensure_central_inventory_location",
    function: "inventoryStockPolicies:ensureCentralLocation",
    title: "Ensure central warehouse location",
    description: "Return the central warehouse location id, creating it if it does not exist yet.",
    idempotent: true,
  },
  {
    name: "list_inventory_projects",
    function: "inventory:listProjects",
    title: "List projects with inventory",
    description: "Projects that have a stock location, with the responsible user.",
  },
  {
    name: "list_inventory_material_options",
    function: "inventory:listMaterialOptions",
    title: "Search materials for inventory",
    description: "Materials tracked in inventory with unit, category and technical attributes. Use to pick materialIds for movement document lines.",
  },
  {
    name: "list_inventory_movements",
    function: "inventory:listEventsPaginated",
    title: "List inventory movements (paginated)",
    description: "Paginated stock movement events (material, location, quantity delta, document), optionally for one project.",
    fieldDescriptions: { paginationOpts: PAGINATION_HINT },
  },
  {
    name: "reverse_inventory_document",
    function: "inventory:reverseDocument",
    title: "Reverse posted inventory document",
    description: "Create and post a reversal of a posted movement document, undoing its effect on balances. Requires a reason. Returns the reversal document id.",
    destructive: true,
  },
  {
    name: "update_inventory_physical_address",
    function: "inventory:updatePhysicalAddress",
    title: "Update shelf/bin address",
    description: "Set the physical address (aisle/shelf/bin) of a stock balance.",
    idempotent: true,
  },
  {
    name: "quick_create_material",
    function: "inventory:quickCreateMaterial",
    title: "Quick-create material",
    description: "Create a minimal material (name, variant, unit, category) from the warehouse or purchasing when a movement needs an item that is not in the catalog yet. Returns the material with its generated SKU.",
  },
  {
    name: "get_stock_policy",
    function: "inventoryStockPolicies:getForLocation",
    title: "Get stock policy",
    description: "Minimum, reorder point, target and lead time for one material at one location, or null if none is set.",
  },
  {
    name: "list_material_stock_policies",
    function: "inventoryStockPolicies:listForMaterial",
    title: "List stock policies of a material",
    description: "Stock policies of a material across all locations.",
  },
  {
    name: "set_stock_policy",
    function: "inventoryStockPolicies:upsert",
    title: "Set stock policy (purchasing)",
    description: "Create or update the minimum / reorder point / target quantities and lead time for a material at a location. Purchasing permission.",
    idempotent: true,
  },
  {
    name: "set_stock_policy_from_warehouse",
    function: "inventoryStockPolicies:upsertFromWarehouse",
    title: "Set stock policy (warehouse)",
    description: "Same as set_stock_policy, for users of the warehouse team.",
    idempotent: true,
  },
  {
    name: "create_inventory_rule",
    function: "inventory:createRule",
    title: "Create inventory compatibility rule",
    description: "Create a compatibility/incompatibility rule between materials or categories that is checked when posting movement documents. Admins only.",
  },
  {
    name: "set_inventory_rule_active",
    function: "inventory:setRuleActive",
    title: "Enable or disable inventory rule",
    description: "Activate or deactivate a compatibility rule. Admins only.",
    idempotent: true,
  },

  // --------------------------------------------------------------------------
  // Purchasing and customer registry: remaining operations
  // --------------------------------------------------------------------------
  {
    name: "remove_supplier_contact",
    function: "suppliers:removeContact",
    title: "Remove supplier contact",
    description: "Remove a contact person from a supplier.",
    destructive: true,
    idempotent: true,
  },
  {
    name: "remove_supplier_material_offering",
    function: "suppliers:removeMaterialOffering",
    title: "Remove supplier offering",
    description: "Remove the link between a supplier and a material.",
    destructive: true,
    idempotent: true,
  },
  {
    name: "bulk_create_suppliers",
    function: "suppliers:bulkCreate",
    title: "Bulk create suppliers",
    description: "Create several suppliers in one call (e.g. from a spreadsheet). Returns created/skipped counts with per-row errors.",
  },
  {
    name: "restore_customer_contact",
    function: "customers:restoreContact",
    title: "Restore customer contact",
    description: "Reactivate a removed customer contact.",
    idempotent: true,
  },
  {
    name: "bulk_create_customers",
    function: "customers:bulkCreate",
    title: "Bulk create customers",
    description: "Create several customers in one call. Returns created/skipped counts with per-row errors.",
  },
  {
    name: "restore_contractor_contact",
    function: "contractors:restoreContact",
    title: "Restore contractor contact",
    description: "Reactivate a removed contractor contact.",
    idempotent: true,
  },
  {
    name: "list_material_aliases",
    function: "materials:listAliases",
    title: "List material aliases",
    description: "Alternative names registered for a material.",
  },
  {
    name: "list_material_variants",
    function: "materials:listVariants",
    title: "List material family variants",
    description: "Materials that belong to a family (variants of the same product).",
  },
  {
    name: "find_duplicate_materials",
    function: "materials:findDuplicateCandidates",
    title: "Find duplicate materials",
    description: "Before creating a material, find existing ones that look like the same product (by name, family, variant, manufacturer part number, dimensions). `exact` marks a confident match.",
  },
  {
    name: "preview_material_merge",
    function: "materials:mergePreview",
    title: "Preview material merge",
    description: "Show what merging a duplicate material (source) into another (target) would move: stock per location, takeoff items, price events, offerings and aliases. Run before merge_materials.",
  },
  {
    name: "merge_materials",
    function: "materials:merge",
    title: "Merge duplicate materials",
    description: "Merge the source material into the target: stock, prices, offerings, takeoff items and aliases move to the target and the source is deactivated. Cannot be undone; confirm with the user and run preview_material_merge first.",
    destructive: true,
  },
  {
    name: "bulk_create_materials",
    function: "materials:bulkCreate",
    title: "Bulk create materials",
    description: "Create several materials in one call (e.g. from a supplier catalog). Returns created/skipped counts with per-row errors.",
  },
  {
    name: "promote_takeoff_item_to_material",
    function: "takeoffs:promoteItemToMaterial",
    title: "Promote takeoff item to material",
    description: "Turn an unmatched takeoff line into a catalog material (or link it to one that already exists) and match the line to it.",
  },
  {
    name: "apply_takeoff_suggested_price",
    function: "takeoffs:applySuggestedPrice",
    title: "Apply price to takeoff item",
    description: "Set the estimated unit price (BRL cents) of a takeoff line, usually from get_latest_material_prices.",
    idempotent: true,
  },

  // --------------------------------------------------------------------------
  // Engineering: remaining structure operations
  // --------------------------------------------------------------------------
  {
    name: "delete_checklist_template",
    function: "checklists:removeTemplate",
    title: "Delete checklist template",
    description: "Delete a checklist template. Items already applied to equipment are kept.",
    destructive: true,
  },
  {
    name: "rename_duct_estimate",
    function: "ductEstimates:rename",
    title: "Rename duct estimate",
    description: "Rename a saved duct sizing estimate.",
    idempotent: true,
  },
  {
    name: "delete_duct_estimate",
    function: "ductEstimates:remove",
    title: "Delete duct estimate",
    description: "Delete a saved duct sizing estimate. Cannot be undone.",
    destructive: true,
  },
  {
    name: "duplicate_tower",
    function: "towers:duplicate",
    title: "Duplicate tower",
    description: "Copy a tower with its floors, environments, systems and planned equipment. Returns the new tower id.",
  },
  {
    name: "replicate_floor",
    function: "floors:replicate",
    title: "Replicate floor layout",
    description: "Copy the environments, systems and planned equipment of one floor onto other floors of the same tower, optionally renaming environments per target floor. Returns counts of what was created.",
    fieldDescriptions: {
      renames: "Optional per-target renames: for a source environment, the name it should have on a given target floor. Pass [] to keep names.",
    },
  },
  {
    name: "bulk_create_systems",
    function: "systems:bulkCreateSystems",
    title: "Bulk create systems",
    description: "Create several systems in a project by name; existing names are returned with created=false.",
  },
  {
    name: "upsert_project_unit",
    function: "projectUnits:upsert",
    title: "Create or update project unit",
    description: "Create a legacy project unit (floor + unit number, VRF or split) or update it when unitId is given. Returns the unit id.",
    fieldDescriptions: { unitId: "Omit to create; pass an existing projectUnits id to update." },
  },
  {
    name: "set_project_unit_deadline",
    function: "projectUnits:setDeadline",
    title: "Set project unit deadline",
    description: "Set or clear (null) the installation deadline of a project unit.",
    idempotent: true,
  },
  {
    name: "delete_project_unit",
    function: "projectUnits:remove",
    title: "Delete project unit",
    description: "Delete a project unit and its planned equipment. Cannot be undone.",
    destructive: true,
  },
  {
    name: "set_project_portal_users",
    function: "projects:setPortalUsers",
    title: "Set project portal users",
    description: "Replace the list of customer portal users who can see a project.",
    idempotent: true,
  },
  {
    name: "list_contract_base_options",
    function: "contracts:listBaseOptions",
    title: "List base contracts for an addendum",
    description: "Base contracts that an addendum can attach to, filtered by direction and project.",
  },
  {
    name: "list_record_audit_logs",
    function: "auditLogs:listByRecord",
    title: "List audit logs of a record",
    description: "Paginated audit trail for one record (table name + record id). Admins only.",
    fieldDescriptions: { paginationOpts: PAGINATION_HINT },
  },

  // --------------------------------------------------------------------------
  // Agent tokens (self-service)
  // --------------------------------------------------------------------------
  {
    name: "list_my_agent_tokens",
    function: "agentTokens:list",
    title: "List my agent tokens",
    description: "Agent tokens owned by the connected user (prefix, permission, expiry, last use). Never returns the secret.",
  },
  {
    name: "list_my_agent_calls",
    function: "agentTokens:listMyCalls",
    title: "List my recent agent calls",
    description: "Recent MCP tool calls made with the connected user's agent tokens.",
  },
];

export function isDestructive(spec: ToolSpec): boolean {
  return spec.destructive ?? /^(delete|remove|archive|revoke)_/.test(spec.name);
}
