/**
 * Ferramentas MCP do cadastro de clientes e empreiteiros.
 */

import type { ToolSpec } from "../manifest";

export const CLIENTES_TOOLS: readonly ToolSpec[] = [
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
];
