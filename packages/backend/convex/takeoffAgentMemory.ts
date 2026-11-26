import { v } from "convex/values";
import { takeoffAppMutation, takeoffAppQuery } from "./lib/rbac";
import {
  addTakeoffAgentMemory,
  approveTakeoffAgentMemory,
  listTakeoffAgentMemory,
  removeTakeoffAgentMemory,
  takeoffAgentMemoryAddResultValidator,
  takeoffAgentMemoryEntryValidator,
  takeoffAgentMemoryInputValidator,
} from "./model/procurement/takeoffAgentMemory";

/**
 * Memória do agente de IA do RLP Takeoff: as convenções da empresa sobre as
 * plantas que recebe (anotações, termos e símbolos), lidas pelo agente no
 * começo de cada levantamento e compartilhadas por todos os usuários do app.
 * O app desktop chama estas funções com a conta do usuário e guarda a última
 * cópia para uso offline. O que o agente propõe fica como proposta até uma
 * pessoa aprovar. Falhas esperadas vêm como `ConvexError({ code, message })`:
 * `INVALID_MEMORY`, `MEMORY_FULL`, `MEMORY_NOT_FOUND`.
 */

/** Todas as entradas (em uso e propostas), da mais antiga para a mais nova. */
export const list = takeoffAppQuery({
  args: {},
  returns: v.array(takeoffAgentMemoryEntryValidator),
  handler: async (ctx) => await listTakeoffAgentMemory(ctx),
});

/**
 * Grava uma entrada. Com `proposed`, é uma sugestão do agente de IA do usuário
 * e espera aprovação; sem ele, vale a partir de agora. Uma anotação ou termo
 * que já existe não é duplicado.
 */
export const add = takeoffAppMutation({
  args: { ...takeoffAgentMemoryInputValidator.fields, proposed: v.optional(v.boolean()) },
  returns: takeoffAgentMemoryAddResultValidator,
  handler: async (ctx, { proposed, ...input }) =>
    await addTakeoffAgentMemory(ctx, ctx.user, input, proposed ?? false),
});

/** Aprova uma proposta do agente: a partir daí todos os agentes a leem. */
export const approve = takeoffAppMutation({
  args: { id: v.id("takeoffAgentMemory") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await approveTakeoffAgentMemory(ctx, ctx.user, id);
    return null;
  },
});

/** Apaga uma entrada, ou descarta uma proposta. */
export const remove = takeoffAppMutation({
  args: { id: v.id("takeoffAgentMemory") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await removeTakeoffAgentMemory(ctx, ctx.user, id);
    return null;
  },
});
