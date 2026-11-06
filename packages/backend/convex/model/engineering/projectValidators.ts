import { v } from "convex/values";
import { projectStatus } from "../../schema/engineering";
import { accessRoles } from "../../schema/identity";
import { equipKindValidator, equipmentStatusValidator } from "./validators";

export const unitTypeValidator = v.union(v.literal("vrf"), v.literal("split"));

export const floorValidator = v.object({
  number: v.number(),
  label: v.string(),
});
export const floorsValidator = v.array(floorValidator);

// --- Listagem e resolução ---

export const projectListItemValidator = v.object({
  _id: v.id("projects"),
  _creationTime: v.number(),
  name: v.string(),
  slug: v.string(),
  legacyNumber: v.union(v.number(), v.null()),
  floors: floorsValidator,
  client: v.union(v.string(), v.null()),
  customerId: v.union(v.id("customers"), v.null()),
  customerName: v.union(v.string(), v.null()),
  address: v.union(v.string(), v.null()),
  status: v.union(projectStatus, v.null()),
  responsibleId: v.union(v.id("users"), v.null()),
  responsibleName: v.union(v.string(), v.null()),
  startDate: v.union(v.number(), v.null()),
  endDate: v.union(v.number(), v.null()),
  createdAt: v.number(),
  archivedAt: v.union(v.number(), v.null()),
  totalItems: v.number(),
  installedItems: v.number(),
  unitCount: v.number(),
  towerCount: v.number(),
});

export const projectResolutionValidator = v.object({
  _id: v.id("projects"),
  slug: v.string(),
});

// --- Visão completa (andares → aptos → itens) ---

export const projectOverviewEquipmentValidator = v.object({
  _id: v.id("projectEquipment"),
  system: v.string(),
  ambiente: v.string(),
  kind: equipKindValidator,
  modelo: v.string(),
  capacidade: v.string(),
  status: equipmentStatusValidator,
  obs: v.union(v.string(), v.null()),
  deadline: v.union(v.number(), v.null()),
  linkedEquipmentId: v.union(v.id("equipment"), v.null()),
  token: v.union(v.string(), v.null()),
  installedAt: v.union(v.number(), v.null()),
});

export const projectOverviewUnitValidator = v.object({
  _id: v.id("projectUnits"),
  floor: v.number(),
  final: v.number(),
  label: v.string(),
  type: unitTypeValidator,
  floorSpan: v.number(),
  deadline: v.union(v.number(), v.null()),
  equipment: v.array(projectOverviewEquipmentValidator),
});

export const projectOverviewValidator = v.object({
  _id: v.id("projects"),
  name: v.string(),
  slug: v.string(),
  legacyNumber: v.union(v.number(), v.null()),
  floors: floorsValidator,
  client: v.union(v.string(), v.null()),
  customerId: v.union(v.id("customers"), v.null()),
  customerName: v.union(v.string(), v.null()),
  address: v.union(v.string(), v.null()),
  status: v.union(projectStatus, v.null()),
  responsibleId: v.union(v.id("users"), v.null()),
  responsibleName: v.union(v.string(), v.null()),
  startDate: v.union(v.number(), v.null()),
  endDate: v.union(v.number(), v.null()),
  createdAt: v.number(),
  totalItems: v.number(),
  installedItems: v.number(),
  hierarchyFloors: v.number(),
  hierarchyEnvironments: v.number(),
  units: v.array(projectOverviewUnitValidator),
});

// --- Mutations ---

export const projectWithLinkedContractValidator = v.object({
  projectId: v.id("projects"),
  linkedContractId: v.union(v.id("contracts"), v.null()),
});

export const assignedTechnicianValidator = v.object({
  _id: v.id("users"),
  name: v.string(),
  roles: v.array(accessRoles),
});

// --- Gerador por padrão (estilo aba "Aptos") ---

export const systemTemplateValidator = v.object({
  // Nome do sistema, ex: "VRF 1", "VRF 2", "Split".
  name: v.string(),
  // Quantidade de evaporadoras (unidades internas) deste sistema.
  evaporadoras: v.number(),
  // Modelo/capacidade padrão da condensadora (opcional).
  condensadoraModelo: v.optional(v.string()),
  condensadoraCapacidade: v.optional(v.string()),
});

export const finalTemplateValidator = v.object({
  type: unitTypeValidator,
  systems: v.array(systemTemplateValidator),
});

export const layoutGenerationResultValidator = v.object({
  units: v.number(),
  items: v.number(),
});
