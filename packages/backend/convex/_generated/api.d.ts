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
import type * as aiIntents from "../aiIntents.js";
import type * as checklists from "../checklists.js";
import type * as deliveries from "../deliveries.js";
import type * as environments from "../environments.js";
import type * as equipment from "../equipment.js";
import type * as equipmentHistory from "../equipmentHistory.js";
import type * as floors from "../floors.js";
import type * as healthCheck from "../healthCheck.js";
import type * as http from "../http.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_hierarchy from "../lib/hierarchy.js";
import type * as maintenanceLogs from "../maintenanceLogs.js";
import type * as migrations from "../migrations.js";
import type * as portal from "../portal.js";
import type * as projectEquipment from "../projectEquipment.js";
import type * as projectUnits from "../projectUnits.js";
import type * as projects from "../projects.js";
import type * as qrCodes from "../qrCodes.js";
import type * as reports from "../reports.js";
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
  aiIntents: typeof aiIntents;
  checklists: typeof checklists;
  deliveries: typeof deliveries;
  environments: typeof environments;
  equipment: typeof equipment;
  equipmentHistory: typeof equipmentHistory;
  floors: typeof floors;
  healthCheck: typeof healthCheck;
  http: typeof http;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/functions": typeof lib_functions;
  "lib/hierarchy": typeof lib_hierarchy;
  maintenanceLogs: typeof maintenanceLogs;
  migrations: typeof migrations;
  portal: typeof portal;
  projectEquipment: typeof projectEquipment;
  projectUnits: typeof projectUnits;
  projects: typeof projects;
  qrCodes: typeof qrCodes;
  reports: typeof reports;
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
