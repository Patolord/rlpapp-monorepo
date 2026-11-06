import { v } from "convex/values";
import {
  obrasMutation,
  obrasQuery,
} from "./lib/rbac";
import {
  bulkCreateProjectSystems,
  createProjectSystem,
  createSystemsWithPlannedEquipment,
  listProjectSystems,
  removeProjectSystem,
  updateProjectSystem,
} from "./model/engineering/systems";

// Sistemas de climatização escopados a UMA obra (ex: "VRF 1", "Split").
// Um sistema agrupa equipamentos que podem estar em ambientes diferentes da
// mesma obra (condensadora na cobertura + evaporadoras nos apartamentos).

const systemValidator = v.object({
  _id: v.id("systems"),
  projectId: v.id("projects"),
  name: v.string(),
  type: v.union(v.string(), v.null()),
  obs: v.union(v.string(), v.null()),
  createdAt: v.number(),
});

// Lista os sistemas de uma obra (ordenados por nome).
export const listSystemsByProject = obrasQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(systemValidator),
  handler: async (ctx, args) => {
    return await listProjectSystems(ctx, args.projectId);
  },
});

// Cria um sistema dentro de uma obra. Nomes são únicos por obra
// (comparação case-insensitive) para evitar duplicatas como "VRF 1"/"vrf 1".
export const createSystemInProject = obrasMutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    type: v.optional(v.string()),
    obs: v.optional(v.string()),
  },
  returns: v.id("systems"),
  handler: async (ctx, args) => {
    return await createProjectSystem(ctx, ctx.user, args);
  },
});

// Cria vários sistemas de uma vez (fluxo de cadastro rápido). Nomes que já
// existem na obra (case-insensitive) não são recriados — retornam o sistema
// existente com `created: false`. Nomes duplicados na própria lista são
// deduplicados silenciosamente.
export const bulkCreateSystems = obrasMutation({
  args: {
    projectId: v.id("projects"),
    names: v.array(v.string()),
  },
  returns: v.array(
    v.object({
      systemId: v.id("systems"),
      name: v.string(),
      created: v.boolean(),
    })
  ),
  handler: async (ctx, args) => {
    return await bulkCreateProjectSystems(ctx, ctx.user, args);
  },
});

// Cadastro "sistema-first": cria sistemas com seus equipamentos planejados em
// uma única transação (detalhes em `createSystemsWithPlannedEquipment`).
// Não gera QR: as etiquetas nascem livres e são vinculadas em campo.
export const createSystemsWithEquipment = obrasMutation({
  args: {
    projectId: v.id("projects"),
    systems: v.array(
      v.object({
        systemId: v.optional(v.id("systems")),
        name: v.optional(v.string()),
        type: v.optional(v.string()),
        lines: v.array(
          v.object({
            kind: v.union(
              v.literal("condensadora"),
              v.literal("evaporadora")
            ),
            qty: v.number(),
            environmentId: v.id("environments"),
            modelo: v.optional(v.string()),
            capacidade: v.optional(v.string()),
          })
        ),
      })
    ),
  },
  returns: v.object({
    systemsCreated: v.number(),
    itemsCreated: v.number(),
  }),
  handler: async (ctx, args) => {
    return await createSystemsWithPlannedEquipment(ctx, ctx.user, args);
  },
});

// Atualiza nome/tipo/obs de um sistema. Renomear também sincroniza o campo
// denormalizado `system` (string) em todos os equipamentos do sistema.
export const updateSystemDetails = obrasMutation({
  args: {
    systemId: v.id("systems"),
    name: v.optional(v.string()),
    type: v.optional(v.union(v.string(), v.null())),
    obs: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updateProjectSystem(ctx, args);
    return null;
  },
});

// Remove um sistema da obra. Recusa se ainda houver equipamentos vinculados,
// para evitar exclusões em cascata acidentais.
export const removeSystemFromProject = obrasMutation({
  args: { systemId: v.id("systems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await removeProjectSystem(ctx, ctx.user, args.systemId);
    return null;
  },
});
