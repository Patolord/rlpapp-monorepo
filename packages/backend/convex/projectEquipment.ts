import { v } from "convex/values";
import {
  authedMutation,
  authedQuery,
  obrasMutation,
  obrasQuery,
} from "./lib/rbac";
import {
  equipKindValidator,
  equipmentStatusValidator,
} from "./schema/engineering";
import {
  assignPlannedEquipmentToEnvironment,
  bulkAddPlannedEquipmentToEnvironments,
  bulkAddToEnvironmentsResultValidator,
  createUnassignedPlannedEquipment,
  deletePlannedEquipment,
  listUnassignedPlannedEquipment,
  setPlannedEquipmentStatus,
  unassignedPlannedEquipmentValidator,
  upsertPlannedEquipmentInEnvironment,
} from "./model/engineering/projectEquipment";
import {
  bulkCreateUnitsWithEquipment,
  upsertUnitEquipment,
} from "./model/engineering/projectUnitEquipment";
import {
  addPlannedEquipmentMedia,
  claimPendingSlot,
  createPlannedItemFromRegisteredEquipment,
  linkEquipmentToPlannedItem,
  listPendingSlots as listPendingSlotsModel,
  pendingSlotValidator,
  recordFieldAction,
  unlinkEquipmentFromPlannedItem,
} from "./model/engineering/fieldEquipment";

const locationValidator = v.object({
  latitude: v.number(),
  longitude: v.number(),
});

// Ações de campo do técnico (via QR): Instalar, Testar, Finalizar.
// Sempre registra usuário, data/hora, observação e GPS (estrutura pronta).
// authedMutation permite que qr_operator execute após escanear.
export const fieldAction = authedMutation({
  args: {
    itemId: v.id("projectEquipment"),
    action: v.union(
      v.literal("install"),
      v.literal("test"),
      v.literal("finalize")
    ),
    notes: v.optional(v.string()),
    location: v.optional(locationValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await recordFieldAction(ctx, ctx.user, args);
    return null;
  },
});

// Cria/atualiza um equipamento planejado dentro de um AMBIENTE (hierarquia nova).
// O sistema é opcional: itens sem sistema exibem alerta na UI.
// Diferente de `upsert`, que opera sobre o caminho legado de apartamentos.
export const upsertInEnvironment = obrasMutation({
  args: {
    itemId: v.optional(v.id("projectEquipment")),
    environmentId: v.id("environments"),
    systemId: v.optional(v.id("systems")),
    ambiente: v.optional(v.string()),
    kind: equipKindValidator,
    modelo: v.optional(v.string()),
    capacidade: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    status: v.optional(equipmentStatusValidator),
    obs: v.optional(v.union(v.string(), v.null())),
    deadline: v.optional(v.union(v.number(), v.null())),
    scheduledDate: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.id("projectEquipment"),
  handler: async (ctx, args) => {
    return await upsertPlannedEquipmentInEnvironment(ctx, ctx.user, args);
  },
});

// Criação em massa de equipamentos planejados em vários ambientes de uma vez
// (painel de cadastro rápido). Opcionalmente gera um QR novo para cada item.
export const bulkAddToEnvironments = obrasMutation({
  args: {
    environmentIds: v.array(v.id("environments")),
    systemId: v.optional(v.id("systems")),
    items: v.array(
      v.object({
        kind: equipKindValidator,
        qty: v.number(),
        modelo: v.optional(v.string()),
        capacidade: v.optional(v.string()),
      })
    ),
    generateQr: v.boolean(),
  },
  returns: bulkAddToEnvironmentsResultValidator,
  handler: async (ctx, args) => {
    return await bulkAddPlannedEquipmentToEnvironments(ctx, ctx.user, args);
  },
});

// --- Pool de equipamentos não atribuídos (sem ambiente) ---

// Lista itens planejados da obra que ainda não estão em nenhum ambiente
// (pool de "não atribuídos" do painel lateral).
export const listUnassigned = obrasQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(unassignedPlannedEquipmentValidator),
  handler: async (ctx, args) => {
    return await listUnassignedPlannedEquipment(ctx, args.projectId);
  },
});

// Cria um item planejado sem ambiente (vai para o pool de não atribuídos).
export const createUnassigned = obrasMutation({
  args: {
    projectId: v.id("projects"),
    systemId: v.optional(v.id("systems")),
    kind: equipKindValidator,
    modelo: v.optional(v.string()),
    capacidade: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    deadline: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.id("projectEquipment"),
  handler: async (ctx, args) => {
    return await createUnassignedPlannedEquipment(ctx, ctx.user, args);
  },
});

// Atribui um item do pool de não atribuídos a um ambiente, podendo definir o
// sistema no mesmo passo.
export const assignToEnvironment = obrasMutation({
  args: {
    itemId: v.id("projectEquipment"),
    environmentId: v.id("environments"),
    systemId: v.optional(v.id("systems")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assignPlannedEquipmentToEnvironment(ctx, ctx.user, args);
    return null;
  },
});

export const upsert = obrasMutation({
  args: {
    itemId: v.optional(v.id("projectEquipment")),
    projectId: v.id("projects"),
    unitId: v.id("projectUnits"),
    system: v.string(),
    ambiente: v.string(),
    kind: equipKindValidator,
    modelo: v.optional(v.string()),
    capacidade: v.optional(v.string()),
    status: v.optional(equipmentStatusValidator),
    obs: v.optional(v.union(v.string(), v.null())),
    deadline: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.id("projectEquipment"),
  handler: async (ctx, args) => {
    return await upsertUnitEquipment(ctx, args);
  },
});

export const setStatus = obrasMutation({
  args: {
    itemId: v.id("projectEquipment"),
    status: equipmentStatusValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await setPlannedEquipmentStatus(ctx, ctx.user, args);
    return null;
  },
});

export const remove = obrasMutation({
  args: { itemId: v.id("projectEquipment") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deletePlannedEquipment(ctx, args.itemId);
    return null;
  },
});

// Anexa fotos/vídeos a um equipamento planejado (upload feito via Convex storage).
// authedMutation: técnicos em campo (qr_operator) também podem anexar.
export const addMedia = authedMutation({
  args: {
    itemId: v.id("projectEquipment"),
    photoIds: v.optional(v.array(v.id("_storage"))),
    videoIds: v.optional(v.array(v.id("_storage"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await addPlannedEquipmentMedia(ctx, ctx.user, args);
    return null;
  },
});

// Vincula um equipamento real (QR) a um item planejado → verde/instalado.
export const linkEquipment = obrasMutation({
  args: {
    itemId: v.id("projectEquipment"),
    equipmentId: v.id("equipment"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await linkEquipmentToPlannedItem(ctx, args);
    return null;
  },
});

// Cria um item planejado diretamente a partir de um equipamento já cadastrado
// pelo técnico (QR + equipment sem item planejado), em um passo único. Não
// força "operational" (atribuir à obra não significa instalado).
export const createFromRegisteredEquipment = obrasMutation({
  args: {
    environmentId: v.id("environments"),
    systemId: v.optional(v.id("systems")),
    kind: equipKindValidator,
    equipmentId: v.optional(v.id("equipment")),
    token: v.optional(v.string()),
    modelo: v.optional(v.string()),
    capacidade: v.optional(v.string()),
  },
  returns: v.object({
    itemId: v.id("projectEquipment"),
    token: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    return await createPlannedItemFromRegisteredEquipment(ctx, ctx.user, args);
  },
});

// --- Vagas pendentes (atribuição pelo técnico na hora do scan) ---

// Vagas planejadas de uma obra ainda sem equipamento real vinculado, com o
// contexto de localização (torre/andar/ambiente). authedQuery: o técnico
// (qr_operator) usa após cadastrar um equipamento no /q/$token para escolher
// onde ele fica.
export const listPendingSlots = authedQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(pendingSlotValidator),
  handler: async (ctx, args) => {
    return await listPendingSlotsModel(ctx, args.projectId);
  },
});

// Técnico atribui o equipamento que acabou de cadastrar a uma vaga planejada.
// Diferente de `linkEquipment` (escritório), NÃO força "operational".
export const claimSlot = authedMutation({
  args: {
    itemId: v.id("projectEquipment"),
    equipmentId: v.id("equipment"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await claimPendingSlot(ctx, ctx.user, args);
    return null;
  },
});

export const unlinkEquipment = obrasMutation({
  args: { itemId: v.id("projectEquipment") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await unlinkEquipmentFromPlannedItem(ctx, args.itemId);
    return null;
  },
});

// Criação em lote (usada pelo assistente de IA após aprovação do usuário).
// Cria apartamentos e seus itens em uma única transação.
export const bulkCreate = obrasMutation({
  args: {
    projectId: v.id("projects"),
    units: v.array(
      v.object({
        floor: v.number(),
        final: v.number(),
        label: v.optional(v.string()),
        type: v.union(v.literal("vrf"), v.literal("split")),
        floorSpan: v.optional(v.number()),
        deadline: v.optional(v.number()),
        equipment: v.array(
          v.object({
            system: v.string(),
            ambiente: v.string(),
            kind: equipKindValidator,
            modelo: v.optional(v.string()),
            capacidade: v.optional(v.string()),
            obs: v.optional(v.string()),
          })
        ),
      })
    ),
  },
  returns: v.object({ units: v.number(), items: v.number() }),
  handler: async (ctx, args) => {
    return await bulkCreateUnitsWithEquipment(ctx, args);
  },
});
