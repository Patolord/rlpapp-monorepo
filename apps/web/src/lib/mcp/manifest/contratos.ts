/**
 * Ferramentas MCP de contratos e medições.
 */

import type { ToolSpec } from "../manifest";

export const CONTRATOS_TOOLS: readonly ToolSpec[] = [
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
];
