/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as categoriasFinanceiras from "../categoriasFinanceiras.js";
import type * as clientes from "../clientes.js";
import type * as conciliacoes from "../conciliacoes.js";
import type * as contasBancarias from "../contasBancarias.js";
import type * as contasPagar from "../contasPagar.js";
import type * as contasReceber from "../contasReceber.js";
import type * as deliveryConfirmations from "../deliveryConfirmations.js";
import type * as equipment from "../equipment.js";
import type * as healthCheck from "../healthCheck.js";
import type * as inventory from "../inventory.js";
import type * as lib_auth from "../lib/auth.js";
import type * as maintenanceLogs from "../maintenanceLogs.js";
import type * as materialRequests from "../materialRequests.js";
import type * as privateData from "../privateData.js";
import type * as products from "../products.js";
import type * as qrCodes from "../qrCodes.js";
import type * as receipts from "../receipts.js";
import type * as relatorios from "../relatorios.js";
import type * as seed from "../seed.js";
import type * as shipments from "../shipments.js";
import type * as sites from "../sites.js";
import type * as suppliers from "../suppliers.js";
import type * as transacoesBancarias from "../transacoesBancarias.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  categoriasFinanceiras: typeof categoriasFinanceiras;
  clientes: typeof clientes;
  conciliacoes: typeof conciliacoes;
  contasBancarias: typeof contasBancarias;
  contasPagar: typeof contasPagar;
  contasReceber: typeof contasReceber;
  deliveryConfirmations: typeof deliveryConfirmations;
  equipment: typeof equipment;
  healthCheck: typeof healthCheck;
  inventory: typeof inventory;
  "lib/auth": typeof lib_auth;
  maintenanceLogs: typeof maintenanceLogs;
  materialRequests: typeof materialRequests;
  privateData: typeof privateData;
  products: typeof products;
  qrCodes: typeof qrCodes;
  receipts: typeof receipts;
  relatorios: typeof relatorios;
  seed: typeof seed;
  shipments: typeof shipments;
  sites: typeof sites;
  suppliers: typeof suppliers;
  transacoesBancarias: typeof transacoesBancarias;
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
