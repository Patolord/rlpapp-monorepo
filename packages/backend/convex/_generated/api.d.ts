/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as aiChat from "../aiChat.js";
import type * as aiIntents from "../aiIntents.js";
import type * as auditLogs from "../auditLogs.js";
import type * as checklists from "../checklists.js";
import type * as contractors from "../contractors.js";
import type * as contracts from "../contracts.js";
import type * as customers from "../customers.js";
import type * as dashboard from "../dashboard.js";
import type * as ductEstimates from "../ductEstimates.js";
import type * as employees from "../employees.js";
import type * as environments from "../environments.js";
import type * as equipment from "../equipment.js";
import type * as equipmentHistory from "../equipmentHistory.js";
import type * as floors from "../floors.js";
import type * as healthCheck from "../healthCheck.js";
import type * as http from "../http.js";
import type * as inventory from "../inventory.js";
import type * as inventoryRequests from "../inventoryRequests.js";
import type * as inventoryStockPolicies from "../inventoryStockPolicies.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_compras_bulkImport from "../lib/compras/bulkImport.js";
import type * as lib_compras_catalog from "../lib/compras/catalog.js";
import type * as lib_compras_mergeMaterials from "../lib/compras/mergeMaterials.js";
import type * as lib_compras_procurement from "../lib/compras/procurement.js";
import type * as lib_customers_helpers from "../lib/customers/helpers.js";
import type * as lib_engenharia_hierarchy from "../lib/engenharia/hierarchy.js";
import type * as lib_engenharia_slug from "../lib/engenharia/slug.js";
import type * as lib_inventory_compatibility from "../lib/inventory/compatibility.js";
import type * as lib_inventory_operations from "../lib/inventory/operations.js";
import type * as lib_inventory_queries from "../lib/inventory/queries.js";
import type * as lib_inventory_requests from "../lib/inventory/requests.js";
import type * as lib_inventory_stockPolicy from "../lib/inventory/stockPolicy.js";
import type * as lib_projects_helpers from "../lib/projects/helpers.js";
import type * as lib_rbac from "../lib/rbac.js";
import type * as lib_rh_payroll from "../lib/rh/payroll.js";
import type * as maintenanceLogs from "../maintenanceLogs.js";
import type * as materials from "../materials.js";
import type * as medicoes from "../medicoes.js";
import type * as migrations from "../migrations.js";
import type * as model_contracts_mutations from "../model/contracts/mutations.js";
import type * as model_contracts_queries from "../model/contracts/queries.js";
import type * as model_contracts_rules from "../model/contracts/rules.js";
import type * as model_contracts_serviceItems from "../model/contracts/serviceItems.js";
import type * as model_contracts_validators from "../model/contracts/validators.js";
import type * as payroll from "../payroll.js";
import type * as portal from "../portal.js";
import type * as priceEvents from "../priceEvents.js";
import type * as projectEquipment from "../projectEquipment.js";
import type * as projectUnits from "../projectUnits.js";
import type * as projects from "../projects.js";
import type * as qrCodes from "../qrCodes.js";
import type * as reports from "../reports.js";
import type * as suppliers from "../suppliers.js";
import type * as systems from "../systems.js";
import type * as takeoffs from "../takeoffs.js";
import type * as technicianActivity from "../technicianActivity.js";
import type * as technicianPortal from "../technicianPortal.js";
import type * as towers from "../towers.js";
import type * as userAdmin from "../userAdmin.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  aiChat: typeof aiChat;
  aiIntents: typeof aiIntents;
  auditLogs: typeof auditLogs;
  checklists: typeof checklists;
  contractors: typeof contractors;
  contracts: typeof contracts;
  customers: typeof customers;
  dashboard: typeof dashboard;
  ductEstimates: typeof ductEstimates;
  employees: typeof employees;
  environments: typeof environments;
  equipment: typeof equipment;
  equipmentHistory: typeof equipmentHistory;
  floors: typeof floors;
  healthCheck: typeof healthCheck;
  http: typeof http;
  inventory: typeof inventory;
  inventoryRequests: typeof inventoryRequests;
  inventoryStockPolicies: typeof inventoryStockPolicies;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/compras/bulkImport": typeof lib_compras_bulkImport;
  "lib/compras/catalog": typeof lib_compras_catalog;
  "lib/compras/mergeMaterials": typeof lib_compras_mergeMaterials;
  "lib/compras/procurement": typeof lib_compras_procurement;
  "lib/customers/helpers": typeof lib_customers_helpers;
  "lib/engenharia/hierarchy": typeof lib_engenharia_hierarchy;
  "lib/engenharia/slug": typeof lib_engenharia_slug;
  "lib/inventory/compatibility": typeof lib_inventory_compatibility;
  "lib/inventory/operations": typeof lib_inventory_operations;
  "lib/inventory/queries": typeof lib_inventory_queries;
  "lib/inventory/requests": typeof lib_inventory_requests;
  "lib/inventory/stockPolicy": typeof lib_inventory_stockPolicy;
  "lib/projects/helpers": typeof lib_projects_helpers;
  "lib/rbac": typeof lib_rbac;
  "lib/rh/payroll": typeof lib_rh_payroll;
  maintenanceLogs: typeof maintenanceLogs;
  materials: typeof materials;
  medicoes: typeof medicoes;
  migrations: typeof migrations;
  "model/contracts/mutations": typeof model_contracts_mutations;
  "model/contracts/queries": typeof model_contracts_queries;
  "model/contracts/rules": typeof model_contracts_rules;
  "model/contracts/serviceItems": typeof model_contracts_serviceItems;
  "model/contracts/validators": typeof model_contracts_validators;
  payroll: typeof payroll;
  portal: typeof portal;
  priceEvents: typeof priceEvents;
  projectEquipment: typeof projectEquipment;
  projectUnits: typeof projectUnits;
  projects: typeof projects;
  qrCodes: typeof qrCodes;
  reports: typeof reports;
  suppliers: typeof suppliers;
  systems: typeof systems;
  takeoffs: typeof takeoffs;
  technicianActivity: typeof technicianActivity;
  technicianPortal: typeof technicianPortal;
  towers: typeof towers;
  userAdmin: typeof userAdmin;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
