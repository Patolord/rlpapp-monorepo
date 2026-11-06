/**
 * Ferramentas MCP de estoque: saldos, documentos, requisições, locais,
 * movimentações, políticas de estoque e regras.
 */

import { PAGINATION_HINT } from "./shared-args";
import type { ToolSpec } from "../manifest";

export const ESTOQUE_TOOLS: readonly ToolSpec[] = [
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
];

/** Entra em TOOLS depois de RH_TOOLS; ver a ordem em manifest.ts. */
export const ESTOQUE_EXTRA_TOOLS: readonly ToolSpec[] = [
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
];
