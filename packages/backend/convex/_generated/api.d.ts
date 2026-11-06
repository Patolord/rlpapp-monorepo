/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentTokens from "../agentTokens.js";
import type * as ai from "../ai.js";
import type * as aiChat from "../aiChat.js";
import type * as aiIntents from "../aiIntents.js";
import type * as alimonies from "../alimonies.js";
import type * as auditLogs from "../auditLogs.js";
import type * as checklists from "../checklists.js";
import type * as contractors from "../contractors.js";
import type * as contracts from "../contracts.js";
import type * as crons from "../crons.js";
import type * as customers from "../customers.js";
import type * as dashboard from "../dashboard.js";
import type * as employees from "../employees.js";
import type * as environments from "../environments.js";
import type * as equipment from "../equipment.js";
import type * as equipmentHistory from "../equipmentHistory.js";
import type * as floors from "../floors.js";
import type * as gateway_callerAuth from "../gateway/callerAuth.js";
import type * as gateway_functionCatalog from "../gateway/functionCatalog.js";
import type * as gateway_functionErrors from "../gateway/functionErrors.js";
import type * as gateway_functionRunner from "../gateway/functionRunner.js";
import type * as gateway_responses from "../gateway/responses.js";
import type * as gateway_takeoffAuth from "../gateway/takeoffAuth.js";
import type * as gateway_v1 from "../gateway/v1.js";
import type * as gateway_validate from "../gateway/validate.js";
import type * as healthCheck from "../healthCheck.js";
import type * as http from "../http.js";
import type * as inventory from "../inventory.js";
import type * as inventoryRequests from "../inventoryRequests.js";
import type * as inventoryStockPolicies from "../inventoryStockPolicies.js";
import type * as lib_accessErrors from "../lib/accessErrors.js";
import type * as lib_agentTokens from "../lib/agentTokens.js";
import type * as lib_apiCrypto from "../lib/apiCrypto.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_rbac from "../lib/rbac.js";
import type * as lib_takeoffAuth from "../lib/takeoffAuth.js";
import type * as maintenanceLogs from "../maintenanceLogs.js";
import type * as materialLookup from "../materialLookup.js";
import type * as materials from "../materials.js";
import type * as mcp_catalog from "../mcp/catalog.js";
import type * as mcpCatalog from "../mcpCatalog.js";
import type * as medicoes from "../medicoes.js";
import type * as migrations from "../migrations.js";
import type * as model_ai_intents from "../model/ai/intents.js";
import type * as model_contracts_contractorContacts from "../model/contracts/contractorContacts.js";
import type * as model_contracts_contractors from "../model/contracts/contractors.js";
import type * as model_contracts_customerContacts from "../model/contracts/customerContacts.js";
import type * as model_contracts_customerImport from "../model/contracts/customerImport.js";
import type * as model_contracts_customerRecords from "../model/contracts/customerRecords.js";
import type * as model_contracts_customerValidators from "../model/contracts/customerValidators.js";
import type * as model_contracts_customers from "../model/contracts/customers.js";
import type * as model_contracts_mutations from "../model/contracts/mutations.js";
import type * as model_contracts_queries from "../model/contracts/queries.js";
import type * as model_contracts_rules from "../model/contracts/rules.js";
import type * as model_contracts_serviceItems from "../model/contracts/serviceItems.js";
import type * as model_contracts_validators from "../model/contracts/validators.js";
import type * as model_engineering_documents from "../model/engineering/documents.js";
import type * as model_engineering_fieldEquipment from "../model/engineering/fieldEquipment.js";
import type * as model_engineering_floors from "../model/engineering/floors.js";
import type * as model_engineering_hierarchy from "../model/engineering/hierarchy.js";
import type * as model_engineering_projectEquipment from "../model/engineering/projectEquipment.js";
import type * as model_engineering_projectLayout from "../model/engineering/projectLayout.js";
import type * as model_engineering_projectMutations from "../model/engineering/projectMutations.js";
import type * as model_engineering_projectOverview from "../model/engineering/projectOverview.js";
import type * as model_engineering_projectUnitEquipment from "../model/engineering/projectUnitEquipment.js";
import type * as model_engineering_projectValidators from "../model/engineering/projectValidators.js";
import type * as model_engineering_projects from "../model/engineering/projects.js";
import type * as model_engineering_qrBatches from "../model/engineering/qrBatches.js";
import type * as model_engineering_qrCodes from "../model/engineering/qrCodes.js";
import type * as model_engineering_qrContext from "../model/engineering/qrContext.js";
import type * as model_engineering_qrProjectLinks from "../model/engineering/qrProjectLinks.js";
import type * as model_engineering_qrValidators from "../model/engineering/qrValidators.js";
import type * as model_engineering_slug from "../model/engineering/slug.js";
import type * as model_engineering_systems from "../model/engineering/systems.js";
import type * as model_engineering_validators from "../model/engineering/validators.js";
import type * as model_hr_alimonies from "../model/hr/alimonies.js";
import type * as model_hr_employeeLoans from "../model/hr/employeeLoans.js";
import type * as model_hr_payroll from "../model/hr/payroll.js";
import type * as model_hr_payrollLines from "../model/hr/payrollLines.js";
import type * as model_hr_payrollRuns from "../model/hr/payrollRuns.js";
import type * as model_hr_payrollValidators from "../model/hr/payrollValidators.js";
import type * as model_hr_payrollWorkspace from "../model/hr/payrollWorkspace.js";
import type * as model_hr_timeClock from "../model/hr/timeClock.js";
import type * as model_hr_timeClockDb from "../model/hr/timeClockDb.js";
import type * as model_hr_timeClockPresence from "../model/hr/timeClockPresence.js";
import type * as model_hr_timeClockPunch from "../model/hr/timeClockPunch.js";
import type * as model_hr_timeClockSettings from "../model/hr/timeClockSettings.js";
import type * as model_hr_timeClockValidators from "../model/hr/timeClockValidators.js";
import type * as model_identity_agentTokenCalls from "../model/identity/agentTokenCalls.js";
import type * as model_identity_agentTokenManagement from "../model/identity/agentTokenManagement.js";
import type * as model_identity_agentTokenValidators from "../model/identity/agentTokenValidators.js";
import type * as model_identity_agentTokens from "../model/identity/agentTokens.js";
import type * as model_identity_userAdministration from "../model/identity/userAdministration.js";
import type * as model_identity_userInvites from "../model/identity/userInvites.js";
import type * as model_identity_userSessions from "../model/identity/userSessions.js";
import type * as model_identity_userValidators from "../model/identity/userValidators.js";
import type * as model_identity_users from "../model/identity/users.js";
import type * as model_inventory_compatibility from "../model/inventory/compatibility.js";
import type * as model_inventory_documents from "../model/inventory/documents.js";
import type * as model_inventory_locations from "../model/inventory/locations.js";
import type * as model_inventory_posting from "../model/inventory/posting.js";
import type * as model_inventory_queries from "../model/inventory/queries.js";
import type * as model_inventory_requests from "../model/inventory/requests.js";
import type * as model_inventory_stockLedger from "../model/inventory/stockLedger.js";
import type * as model_inventory_stockPolicy from "../model/inventory/stockPolicy.js";
import type * as model_inventory_validators from "../model/inventory/validators.js";
import type * as model_inventory_workspace from "../model/inventory/workspace.js";
import type * as model_procurement_bulkImport from "../model/procurement/bulkImport.js";
import type * as model_procurement_catalog from "../model/procurement/catalog.js";
import type * as model_procurement_desktopBudget from "../model/procurement/desktopBudget.js";
import type * as model_procurement_estimateSuggestion from "../model/procurement/estimateSuggestion.js";
import type * as model_procurement_materialCatalogRows from "../model/procurement/materialCatalogRows.js";
import type * as model_procurement_materialIdentity from "../model/procurement/materialIdentity.js";
import type * as model_procurement_materialImport from "../model/procurement/materialImport.js";
import type * as model_procurement_materialLookup from "../model/procurement/materialLookup.js";
import type * as model_procurement_materialQueries from "../model/procurement/materialQueries.js";
import type * as model_procurement_materialValidators from "../model/procurement/materialValidators.js";
import type * as model_procurement_materials from "../model/procurement/materials.js";
import type * as model_procurement_mergeMaterials from "../model/procurement/mergeMaterials.js";
import type * as model_procurement_priceEstimates from "../model/procurement/priceEstimates.js";
import type * as model_procurement_priceEventReview from "../model/procurement/priceEventReview.js";
import type * as model_procurement_priceEventValidators from "../model/procurement/priceEventValidators.js";
import type * as model_procurement_priceEvents from "../model/procurement/priceEvents.js";
import type * as model_procurement_priceHistory from "../model/procurement/priceHistory.js";
import type * as model_procurement_priceSelection from "../model/procurement/priceSelection.js";
import type * as model_procurement_pricing from "../model/procurement/pricing.js";
import type * as model_procurement_seedLaborPrices from "../model/procurement/seedLaborPrices.js";
import type * as model_procurement_supplierImport from "../model/procurement/supplierImport.js";
import type * as model_procurement_supplierMaterials from "../model/procurement/supplierMaterials.js";
import type * as model_procurement_supplierValidators from "../model/procurement/supplierValidators.js";
import type * as model_procurement_suppliers from "../model/procurement/suppliers.js";
import type * as model_procurement_takeoffCatalog from "../model/procurement/takeoffCatalog.js";
import type * as model_procurement_takeoffItems from "../model/procurement/takeoffItems.js";
import type * as model_procurement_takeoffKits from "../model/procurement/takeoffKits.js";
import type * as model_procurement_takeoffPromotion from "../model/procurement/takeoffPromotion.js";
import type * as model_procurement_takeoffProposals from "../model/procurement/takeoffProposals.js";
import type * as model_procurement_takeoffSettings from "../model/procurement/takeoffSettings.js";
import type * as model_procurement_takeoffValidators from "../model/procurement/takeoffValidators.js";
import type * as model_procurement_takeoffs from "../model/procurement/takeoffs.js";
import type * as payroll from "../payroll.js";
import type * as portal from "../portal.js";
import type * as priceEvents from "../priceEvents.js";
import type * as projectDocuments from "../projectDocuments.js";
import type * as projectEquipment from "../projectEquipment.js";
import type * as projectUnits from "../projectUnits.js";
import type * as projects from "../projects.js";
import type * as qrCodes from "../qrCodes.js";
import type * as reports from "../reports.js";
import type * as schema_contracts from "../schema/contracts.js";
import type * as schema_engineering from "../schema/engineering.js";
import type * as schema_hr from "../schema/hr.js";
import type * as schema_identity from "../schema/identity.js";
import type * as schema_inventory from "../schema/inventory.js";
import type * as schema_procurement from "../schema/procurement.js";
import type * as suppliers from "../suppliers.js";
import type * as systems from "../systems.js";
import type * as takeoffAuth from "../takeoffAuth.js";
import type * as takeoffCatalog from "../takeoffCatalog.js";
import type * as takeoffKits from "../takeoffKits.js";
import type * as takeoffMaterials from "../takeoffMaterials.js";
import type * as takeoffSettings from "../takeoffSettings.js";
import type * as takeoffs from "../takeoffs.js";
import type * as technicianActivity from "../technicianActivity.js";
import type * as technicianPortal from "../technicianPortal.js";
import type * as timeClock from "../timeClock.js";
import type * as timeClockPunch from "../timeClockPunch.js";
import type * as towers from "../towers.js";
import type * as userAdmin from "../userAdmin.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentTokens: typeof agentTokens;
  ai: typeof ai;
  aiChat: typeof aiChat;
  aiIntents: typeof aiIntents;
  alimonies: typeof alimonies;
  auditLogs: typeof auditLogs;
  checklists: typeof checklists;
  contractors: typeof contractors;
  contracts: typeof contracts;
  crons: typeof crons;
  customers: typeof customers;
  dashboard: typeof dashboard;
  employees: typeof employees;
  environments: typeof environments;
  equipment: typeof equipment;
  equipmentHistory: typeof equipmentHistory;
  floors: typeof floors;
  "gateway/callerAuth": typeof gateway_callerAuth;
  "gateway/functionCatalog": typeof gateway_functionCatalog;
  "gateway/functionErrors": typeof gateway_functionErrors;
  "gateway/functionRunner": typeof gateway_functionRunner;
  "gateway/responses": typeof gateway_responses;
  "gateway/takeoffAuth": typeof gateway_takeoffAuth;
  "gateway/v1": typeof gateway_v1;
  "gateway/validate": typeof gateway_validate;
  healthCheck: typeof healthCheck;
  http: typeof http;
  inventory: typeof inventory;
  inventoryRequests: typeof inventoryRequests;
  inventoryStockPolicies: typeof inventoryStockPolicies;
  "lib/accessErrors": typeof lib_accessErrors;
  "lib/agentTokens": typeof lib_agentTokens;
  "lib/apiCrypto": typeof lib_apiCrypto;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/rbac": typeof lib_rbac;
  "lib/takeoffAuth": typeof lib_takeoffAuth;
  maintenanceLogs: typeof maintenanceLogs;
  materialLookup: typeof materialLookup;
  materials: typeof materials;
  "mcp/catalog": typeof mcp_catalog;
  mcpCatalog: typeof mcpCatalog;
  medicoes: typeof medicoes;
  migrations: typeof migrations;
  "model/ai/intents": typeof model_ai_intents;
  "model/contracts/contractorContacts": typeof model_contracts_contractorContacts;
  "model/contracts/contractors": typeof model_contracts_contractors;
  "model/contracts/customerContacts": typeof model_contracts_customerContacts;
  "model/contracts/customerImport": typeof model_contracts_customerImport;
  "model/contracts/customerRecords": typeof model_contracts_customerRecords;
  "model/contracts/customerValidators": typeof model_contracts_customerValidators;
  "model/contracts/customers": typeof model_contracts_customers;
  "model/contracts/mutations": typeof model_contracts_mutations;
  "model/contracts/queries": typeof model_contracts_queries;
  "model/contracts/rules": typeof model_contracts_rules;
  "model/contracts/serviceItems": typeof model_contracts_serviceItems;
  "model/contracts/validators": typeof model_contracts_validators;
  "model/engineering/documents": typeof model_engineering_documents;
  "model/engineering/fieldEquipment": typeof model_engineering_fieldEquipment;
  "model/engineering/floors": typeof model_engineering_floors;
  "model/engineering/hierarchy": typeof model_engineering_hierarchy;
  "model/engineering/projectEquipment": typeof model_engineering_projectEquipment;
  "model/engineering/projectLayout": typeof model_engineering_projectLayout;
  "model/engineering/projectMutations": typeof model_engineering_projectMutations;
  "model/engineering/projectOverview": typeof model_engineering_projectOverview;
  "model/engineering/projectUnitEquipment": typeof model_engineering_projectUnitEquipment;
  "model/engineering/projectValidators": typeof model_engineering_projectValidators;
  "model/engineering/projects": typeof model_engineering_projects;
  "model/engineering/qrBatches": typeof model_engineering_qrBatches;
  "model/engineering/qrCodes": typeof model_engineering_qrCodes;
  "model/engineering/qrContext": typeof model_engineering_qrContext;
  "model/engineering/qrProjectLinks": typeof model_engineering_qrProjectLinks;
  "model/engineering/qrValidators": typeof model_engineering_qrValidators;
  "model/engineering/slug": typeof model_engineering_slug;
  "model/engineering/systems": typeof model_engineering_systems;
  "model/engineering/validators": typeof model_engineering_validators;
  "model/hr/alimonies": typeof model_hr_alimonies;
  "model/hr/employeeLoans": typeof model_hr_employeeLoans;
  "model/hr/payroll": typeof model_hr_payroll;
  "model/hr/payrollLines": typeof model_hr_payrollLines;
  "model/hr/payrollRuns": typeof model_hr_payrollRuns;
  "model/hr/payrollValidators": typeof model_hr_payrollValidators;
  "model/hr/payrollWorkspace": typeof model_hr_payrollWorkspace;
  "model/hr/timeClock": typeof model_hr_timeClock;
  "model/hr/timeClockDb": typeof model_hr_timeClockDb;
  "model/hr/timeClockPresence": typeof model_hr_timeClockPresence;
  "model/hr/timeClockPunch": typeof model_hr_timeClockPunch;
  "model/hr/timeClockSettings": typeof model_hr_timeClockSettings;
  "model/hr/timeClockValidators": typeof model_hr_timeClockValidators;
  "model/identity/agentTokenCalls": typeof model_identity_agentTokenCalls;
  "model/identity/agentTokenManagement": typeof model_identity_agentTokenManagement;
  "model/identity/agentTokenValidators": typeof model_identity_agentTokenValidators;
  "model/identity/agentTokens": typeof model_identity_agentTokens;
  "model/identity/userAdministration": typeof model_identity_userAdministration;
  "model/identity/userInvites": typeof model_identity_userInvites;
  "model/identity/userSessions": typeof model_identity_userSessions;
  "model/identity/userValidators": typeof model_identity_userValidators;
  "model/identity/users": typeof model_identity_users;
  "model/inventory/compatibility": typeof model_inventory_compatibility;
  "model/inventory/documents": typeof model_inventory_documents;
  "model/inventory/locations": typeof model_inventory_locations;
  "model/inventory/posting": typeof model_inventory_posting;
  "model/inventory/queries": typeof model_inventory_queries;
  "model/inventory/requests": typeof model_inventory_requests;
  "model/inventory/stockLedger": typeof model_inventory_stockLedger;
  "model/inventory/stockPolicy": typeof model_inventory_stockPolicy;
  "model/inventory/validators": typeof model_inventory_validators;
  "model/inventory/workspace": typeof model_inventory_workspace;
  "model/procurement/bulkImport": typeof model_procurement_bulkImport;
  "model/procurement/catalog": typeof model_procurement_catalog;
  "model/procurement/desktopBudget": typeof model_procurement_desktopBudget;
  "model/procurement/estimateSuggestion": typeof model_procurement_estimateSuggestion;
  "model/procurement/materialCatalogRows": typeof model_procurement_materialCatalogRows;
  "model/procurement/materialIdentity": typeof model_procurement_materialIdentity;
  "model/procurement/materialImport": typeof model_procurement_materialImport;
  "model/procurement/materialLookup": typeof model_procurement_materialLookup;
  "model/procurement/materialQueries": typeof model_procurement_materialQueries;
  "model/procurement/materialValidators": typeof model_procurement_materialValidators;
  "model/procurement/materials": typeof model_procurement_materials;
  "model/procurement/mergeMaterials": typeof model_procurement_mergeMaterials;
  "model/procurement/priceEstimates": typeof model_procurement_priceEstimates;
  "model/procurement/priceEventReview": typeof model_procurement_priceEventReview;
  "model/procurement/priceEventValidators": typeof model_procurement_priceEventValidators;
  "model/procurement/priceEvents": typeof model_procurement_priceEvents;
  "model/procurement/priceHistory": typeof model_procurement_priceHistory;
  "model/procurement/priceSelection": typeof model_procurement_priceSelection;
  "model/procurement/pricing": typeof model_procurement_pricing;
  "model/procurement/seedLaborPrices": typeof model_procurement_seedLaborPrices;
  "model/procurement/supplierImport": typeof model_procurement_supplierImport;
  "model/procurement/supplierMaterials": typeof model_procurement_supplierMaterials;
  "model/procurement/supplierValidators": typeof model_procurement_supplierValidators;
  "model/procurement/suppliers": typeof model_procurement_suppliers;
  "model/procurement/takeoffCatalog": typeof model_procurement_takeoffCatalog;
  "model/procurement/takeoffItems": typeof model_procurement_takeoffItems;
  "model/procurement/takeoffKits": typeof model_procurement_takeoffKits;
  "model/procurement/takeoffPromotion": typeof model_procurement_takeoffPromotion;
  "model/procurement/takeoffProposals": typeof model_procurement_takeoffProposals;
  "model/procurement/takeoffSettings": typeof model_procurement_takeoffSettings;
  "model/procurement/takeoffValidators": typeof model_procurement_takeoffValidators;
  "model/procurement/takeoffs": typeof model_procurement_takeoffs;
  payroll: typeof payroll;
  portal: typeof portal;
  priceEvents: typeof priceEvents;
  projectDocuments: typeof projectDocuments;
  projectEquipment: typeof projectEquipment;
  projectUnits: typeof projectUnits;
  projects: typeof projects;
  qrCodes: typeof qrCodes;
  reports: typeof reports;
  "schema/contracts": typeof schema_contracts;
  "schema/engineering": typeof schema_engineering;
  "schema/hr": typeof schema_hr;
  "schema/identity": typeof schema_identity;
  "schema/inventory": typeof schema_inventory;
  "schema/procurement": typeof schema_procurement;
  suppliers: typeof suppliers;
  systems: typeof systems;
  takeoffAuth: typeof takeoffAuth;
  takeoffCatalog: typeof takeoffCatalog;
  takeoffKits: typeof takeoffKits;
  takeoffMaterials: typeof takeoffMaterials;
  takeoffSettings: typeof takeoffSettings;
  takeoffs: typeof takeoffs;
  technicianActivity: typeof technicianActivity;
  technicianPortal: typeof technicianPortal;
  timeClock: typeof timeClock;
  timeClockPunch: typeof timeClockPunch;
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
