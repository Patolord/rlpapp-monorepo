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
import type * as deliveries from "../deliveries.js";
import type * as equipment from "../equipment.js";
import type * as healthCheck from "../healthCheck.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_functions from "../lib/functions.js";
import type * as maintenanceLogs from "../maintenanceLogs.js";
import type * as projectEquipment from "../projectEquipment.js";
import type * as projectUnits from "../projectUnits.js";
import type * as projects from "../projects.js";
import type * as qrCodes from "../qrCodes.js";
import type * as userAdmin from "../userAdmin.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  deliveries: typeof deliveries;
  equipment: typeof equipment;
  healthCheck: typeof healthCheck;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/functions": typeof lib_functions;
  maintenanceLogs: typeof maintenanceLogs;
  projectEquipment: typeof projectEquipment;
  projectUnits: typeof projectUnits;
  projects: typeof projects;
  qrCodes: typeof qrCodes;
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
