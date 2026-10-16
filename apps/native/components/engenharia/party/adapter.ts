import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReference } from "convex/server";
import { Building2, HardHat, type LucideIcon } from "lucide-react-native";

/**
 * Clientes e empreiteiros têm o mesmo modelo (pessoa + contatos). O adapter
 * aponta as telas genéricas para a API certa.
 */
export type PartyKind = "customer" | "contractor";

export type PartyRow = {
  _id: string;
  name: string;
  personType: "pf" | "pj" | null;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number | null;
};

export type PartyContact = {
  _id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  active: boolean;
  archivedAt: number | null;
};

type AnyQuery = FunctionReference<"query">;
type AnyMutation = FunctionReference<"mutation">;

export type PartyAdapter = {
  kind: PartyKind;
  singular: string;
  plural: string;
  article: "o" | "a";
  icon: LucideIcon;
  idKey: "customerId" | "contractorId";
  list: AnyQuery;
  get: AnyQuery;
  create: AnyMutation;
  update: AnyMutation;
  archive: AnyMutation;
  restore: AnyMutation;
  addContact: AnyMutation;
  updateContact: AnyMutation;
  removeContact: AnyMutation;
  restoreContact: AnyMutation;
  /** Lê a pessoa do retorno de `get` ({ customer } / { contractor }). */
  pick: (detail: Record<string, unknown>) => PartyRow;
};

export const CUSTOMER_ADAPTER: PartyAdapter = {
  kind: "customer",
  singular: "Cliente",
  plural: "Clientes",
  article: "o",
  icon: Building2,
  idKey: "customerId",
  list: api.customers.list,
  get: api.customers.get,
  create: api.customers.create,
  update: api.customers.update,
  archive: api.customers.archive,
  restore: api.customers.restore,
  addContact: api.customers.addContact,
  updateContact: api.customers.updateContact,
  removeContact: api.customers.removeContact,
  restoreContact: api.customers.restoreContact,
  pick: (detail) => detail.customer as PartyRow,
};

export const CONTRACTOR_ADAPTER: PartyAdapter = {
  kind: "contractor",
  singular: "Empreiteiro",
  plural: "Empreiteiros",
  article: "o",
  icon: HardHat,
  idKey: "contractorId",
  list: api.contractors.list,
  get: api.contractors.get,
  create: api.contractors.create,
  update: api.contractors.update,
  archive: api.contractors.archive,
  restore: api.contractors.restore,
  addContact: api.contractors.addContact,
  updateContact: api.contractors.updateContact,
  removeContact: api.contractors.removeContact,
  restoreContact: api.contractors.restoreContact,
  pick: (detail) => detail.contractor as PartyRow,
};

export const PERSON_TYPE_LABELS: Record<"pf" | "pj", string> = {
  pf: "Pessoa física",
  pj: "Pessoa jurídica",
};
