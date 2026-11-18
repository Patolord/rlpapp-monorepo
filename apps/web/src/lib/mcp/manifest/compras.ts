/**
 * Ferramentas MCP de compras: materiais, fornecedores, preços e takeoffs.
 */

import { PAGINATION_HINT, nowArg } from "./shared-args";
import type { ToolSpec } from "../manifest";

export const COMPRAS_TOOLS: readonly ToolSpec[] = [
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
      "Create a supplier: name (trade name) plus optional personType, legalName, taxId (CNPJ/CPF, validated and unique), stateRegistration, email, phone, website, address, paymentTerms, defaultLeadTimeDays, categories and notes. Only a repeated CNPJ/CPF is refused, not a repeated name: search with list_suppliers (name, legal name or CNPJ digits) first and reuse the existing supplier. Returns the supplier id.",
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
    description:
      "Price observations (quotes, invoices, estimates) newest first, filterable by material, project, takeoff, supplier and period (`from`/`to` on the price date, ms). Prices in BRL cents. Before backfilling past quotes, list the supplier's prices in that period to avoid recording them twice.",
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
    name: "get_material_price_history",
    function: "priceEvents:historyForMaterial",
    title: "Price history for a material",
    description:
      "Price history of a material with variation: chronological series in the reference unit (each point compared with the previous price from the same supplier), latest price per supplier, and a summary (change vs 30/90 days ago, min/max). Prices in BRL cents, deltaPercent with one decimal.",
    serverArgs: nowArg,
  },
  {
    name: "add_price_event",
    function: "priceEvents:add",
    title: "Record price",
    description:
      "Record a price observation for a material from a quote, invoice or estimate. unitPriceCents in BRL cents. For custom-fabricated items pass `takeoffItemId` (material, takeoff, project and dimensions are copied from the item; an item without a material gets a SKU for its size) or `dimensions` in mm, so the quote feeds size-based estimates. For several prices from the same supplier proposal prefer create_quote_proposal; pass `quoteProposalId` to attach a single price to an existing proposal. Returns the event id.",
  },
  {
    name: "create_quote_proposal",
    function: "quoteProposals:create",
    title: "Record supplier proposal",
    description:
      "Record a supplier's proposal: several prices sent at once (one line per material) with the date it arrived (`receivedAt`, ms), validity, payment terms and freight (cif | fob). Each line becomes a price event linked to the proposal, with the proposal's supplier, date and validity; unitPriceCents in BRL cents. Proposals received in the same week (Monday to Sunday, Brasília time) form one quote round compared in get_quote_week. Use this for backfilling history from past proposals; resolve materials with suggest_materials and suppliers with list_suppliers first. Returns the proposal id and the price event ids.",
    fieldDescriptions: {
      receivedAt: "When the proposal arrived (ms since epoch). Also the date of every price in it.",
      validUntil: "Until when the prices hold (ms since epoch).",
      paymentTerms: "Payment terms as the supplier wrote them (e.g. \"28 dias\", \"30/60\").",
      lines:
        "One per material: materialId (preferred) or rawDescription as the supplier wrote it, unitPriceCents, unit, quantity.",
    },
  },
  {
    name: "update_quote_proposal",
    function: "quoteProposals:update",
    title: "Update supplier proposal",
    description:
      "Fix a proposal's supplier, date, validity (null clears), payment terms, freight (null clears), reference or project. Supplier, date and validity are copied to every price of the proposal.",
  },
  {
    name: "link_price_events_to_proposal",
    function: "quoteProposals:linkPriceEvents",
    title: "Link prices to proposal",
    description:
      "Attach price events already recorded one by one to the proposal they came from. Each event must be from the proposal's supplier; it takes the proposal's date and validity. Returns how many were linked.",
    idempotent: true,
  },
  {
    name: "get_quote_proposal",
    function: "quoteProposals:get",
    title: "Get supplier proposal",
    description: "One proposal with its terms and the prices (lines) it brought.",
  },
  {
    name: "list_quote_proposals",
    function: "quoteProposals:list",
    title: "List supplier proposals",
    description: "Recent supplier proposals, newest first. Filter by `supplierId`.",
  },
  {
    name: "list_quote_weeks",
    function: "quoteProposals:listWeeks",
    title: "List quote rounds (weeks)",
    description:
      "Weeks that have recorded prices, newest first, with how many prices, suppliers, materials and proposals each has. A week (Monday to Sunday, Brasília time) is a quote round.",
    serverArgs: nowArg,
  },
  {
    name: "get_quote_week",
    function: "quoteProposals:week",
    title: "Compare suppliers in a week",
    description:
      "Quote map of the week containing `weekStart` (any instant of the week): one column per supplier (with its proposals), one row per material with each supplier's price that week (latest per supplier), the cheapest supplier and the 6-month reference (median). Includes prices recorded without a proposal.",
    serverArgs: nowArg,
  },
  {
    name: "get_family_price_history",
    function: "priceEvents:familyHistory",
    title: "Equipment price history",
    description:
      "Price history of a comparable item: the material family (by `familyId`, or the family of `materialId`) with every variant (brand, cycle, technology) and its budget reference (median of the last 6 months, range, spread, monthly change, status ok | wide | stale), plus every quote of the last `monthsBack` months (default 12) from all suppliers.",
    serverArgs: nowArg,
  },
  {
    name: "set_family_default_variant",
    function: "priceEvents:setFamilyDefaultVariant",
    title: "Set family reference variant",
    description:
      "Choose which variant of a material family is the budget price reference (e.g. the LG heat-and-cool 9,000 BTU/h split). Pass materialId null to clear.",
    idempotent: true,
  },
  {
    name: "suggest_size_estimate",
    function: "priceEvents:suggestEstimate",
    title: "Estimate price by size",
    description:
      "Size-based price estimate for a custom-fabricated item (grille, damper, duct) from past quotes of the same material family. Identify the family by `materialId`, `familyId` or `familyName`, and pass the target `dimensions` in mm (widthMm/heightMm, diameterMm or lengthMm). Returns the method (exact size, nearest sizes or fitted curve), confidence, price range and the precedent quotes used. Optional `supplierId` restricts to that supplier when it has enough quotes.",
    serverArgs: nowArg,
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
    description:
      "Material takeoffs (quantity lists), optionally for one project. source \"desktop\" marks budgets published by the desktop takeoff app (budget holds BDI, extras % and totals per sheet in BRL cents; publishedAt/publishedByName say when and by whom).",
  },
  {
    name: "get_takeoff",
    function: "takeoffs:get",
    title: "Get takeoff",
    description:
      "A takeoff with its items, matched materials and current price suggestions. Desktop budget lines also carry sheet (discipline/system), section (location or group), laborUnitPriceCents and externalRemovedAt (line dropped from the desktop budget but kept because purchasing already worked on it).",
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
  {
    name: "estimate_split_installation",
    function: "takeoffEstimates:split",
    title: "Estimate a split AC installation",
    description:
      "Quick budget of a split air-conditioning installation without measuring the drawing: the same calculator as the desktop app's \"Takeoff por estimativa\". Give one row per machine type from the equipment list (type, capacity in BTU/h, quantity, refrigerant line metres per machine, default 8). Each capacity picks the company's line-set kit (copper and insulation sizes, interconnect cable both ways); returns the priced lines (company catalog, copper by weight), material/labour totals and the total with BDI. RLP's scope is the line set, the machines (optional) and installation labour per evaporator; drain, brackets and electrical points are not included. Labour and BDI are not in the catalog: ask the user for laborPerEvaporatorBrl and bdiPercent when unknown. Read the warnings (lines without a catalog price count as R$ 0). Nothing is saved; prices in BRL (reais).",
    serverArgs: nowArg,
    fieldDescriptions: {
      machines:
        "One row per machine type. type: Hi Wall (default), Cassete, Piso-teto or Duto. capacityBtu: e.g. 18000. lineType: Inverter (default) or Convencional. lineMeters: line length per machine, default 8. unitPriceBrl: machine price in reais; omit to use the catalog price.",
      includeMachines: "Include the machines themselves (default true).",
      laborPerEvaporatorBrl: "Installation labour per evaporator, in reais, regardless of line length.",
      mobilizationBrl: "Mobilisation and travel for the whole job, in reais; omit when it is in the BDI.",
      bdiPercent: "BDI (markup) over material + labour, in percent (e.g. 30).",
    },
  },
  {
    name: "estimate_bathroom_exhaust",
    function: "takeoffEstimates:bathroomExhaust",
    title: "Estimate bathroom exhaust",
    description:
      "Quick budget of bathroom exhaust per bathroom (the desktop app's calculator): fan, flexible aluminium duct, clamps, ceiling grille and outside cap at the duct diameter, plus labour per bathroom. Returns priced lines, totals with BDI and warnings (lines without a catalog price count as R$ 0). Nothing is saved; prices in BRL (reais).",
    serverArgs: nowArg,
    fieldDescriptions: {
      diameterMm: "Duct diameter: 100 (default), 125 or 150 mm.",
      ductMeters: "Flexible duct per bathroom, metres (default 3).",
      fanPriceBrl: "Fan price in reais; omit to use the catalog price.",
      grille: "Ceiling grille (default true).",
      cap: "Outside cap (default true).",
      clampsPerBathroom: "Clamps per bathroom (default 2).",
      laborPerBathroomBrl: "Installation labour per bathroom, in reais.",
      bdiPercent: "BDI (markup) over material + labour, in percent (e.g. 30).",
    },
  },
];

/** Entra em TOOLS depois de ESTOQUE_EXTRA_TOOLS; ver a ordem em manifest.ts. */
export const COMPRAS_EXTRA_TOOLS: readonly ToolSpec[] = [
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
];
