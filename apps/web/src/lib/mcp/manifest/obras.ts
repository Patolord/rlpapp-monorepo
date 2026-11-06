/**
 * Ferramentas MCP de obras: estrutura (torres, andares, ambientes, sistemas,
 * unidades), equipamentos previstos, checklists e QR codes.
 */

import { PAGINATION_HINT } from "./shared-args";
import type { ToolSpec } from "../manifest";

export const OBRAS_TOOLS: readonly ToolSpec[] = [
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
];

/** Entra em TOOLS depois de COMPRAS_EXTRA_TOOLS; ver a ordem em manifest.ts. */
export const OBRAS_EXTRA_TOOLS: readonly ToolSpec[] = [
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
];
