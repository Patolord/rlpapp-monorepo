import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { authedMutation, obrasMutation, obrasQuery } from "./lib/rbac";
import { equipmentStatusValidator } from "./model/engineering/validators";
import {
  createQrBatch,
  listAvailableQrBatches,
  listQrBatchesWithoutProject,
  listRecentQrBatches,
  setQrBatchProject,
} from "./model/engineering/qrBatches";
import {
  createQrCode,
  getQrCodeByEquipmentId,
  getQrCodeLookup,
  getQrCodeStats,
  linkEquipmentToQr,
  listUnassignedQrCodesForAi,
  registerEquipmentForQr,
  removeQrCodeByToken,
  removeQrCodesByTokens,
  searchQrCodes,
} from "./model/engineering/qrCodes";
import {
  getQrFullContext,
  listQrCodesByProject,
  listRegisteredEquipmentForProject,
} from "./model/engineering/qrContext";
import {
  backfillQrProjectIds as backfillQrProjectIdsModel,
  generateQrForProjectEquipment,
  linkQrTokenToProjectEquipment,
} from "./model/engineering/qrProjectLinks";
import {
  availableQrBatchValidator,
  projectQrRowValidator,
  qrBatchCreateResultValidator,
  qrBatchSummaryValidator,
  qrBatchWithoutProjectValidator,
  qrCodeLookupValidator,
  qrCodeValidator,
  qrFullContextValidator,
  qrSearchResultValidator,
  registeredQrEquipmentValidator,
} from "./model/engineering/qrValidators";

export const getByToken = query({
  args: { token: v.string() },
  returns: v.union(qrCodeLookupValidator, v.null()),
  handler: async (ctx, args) => {
    return await getQrCodeLookup(ctx, args.token);
  },
});

export const stats = obrasQuery({
  args: {},
  returns: v.object({
    total: v.number(),
    linked: v.number(),
    free: v.number(),
    capped: v.boolean(),
  }),
  handler: async (ctx) => {
    return await getQrCodeStats(ctx);
  },
});

export const search = obrasQuery({
  args: { term: v.string() },
  returns: qrSearchResultValidator,
  handler: async (ctx, args) => {
    return await searchQrCodes(ctx, args.term);
  },
});

export const getByEquipmentId = obrasQuery({
  args: { equipmentId: v.id("equipment") },
  returns: v.union(qrCodeValidator, v.null()),
  handler: async (ctx, args) => {
    return await getQrCodeByEquipmentId(ctx, args.equipmentId);
  },
});

// QR codes ativos ainda não vinculados a nenhum equipamento, para o assistente
// de IA propor vínculos (intent assign_qr). Limitado para caber no contexto.
export const listUnassignedForAi = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      token: v.string(),
      batchName: v.union(v.string(), v.null()),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx) => {
    return await listUnassignedQrCodesForAi(ctx);
  },
});

export const create = obrasMutation({
  args: {
    token: v.string(),
  },
  returns: v.id("qrCodes"),
  handler: async (ctx, args) => {
    return await createQrCode(ctx, args.token);
  },
});

export const batchCreate = obrasMutation({
  args: {
    tokens: v.array(v.string()),
    batchName: v.optional(v.string()),
    // Todo novo lote de etiquetas de equipamento pertence a uma obra.
    projectId: v.id("projects"),
  },
  returns: qrBatchCreateResultValidator,
  handler: async (ctx, args) => {
    return await createQrBatch(ctx, args);
  },
});

// Lotes recentes de toda a base (todas as obras). Exposto ao MCP
// (`list_qr_batches`); no dashboard os lotes são vistos por obra.
export const listBatches = obrasQuery({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(qrBatchSummaryValidator),
  handler: async (ctx, args) => {
    return await listRecentQrBatches(ctx, args);
  },
});

// Lotes de QR codes que ainda têm etiquetas disponíveis (ativas e sem
// equipamento vinculado), com os tokens livres de cada lote. Usado pelo painel
// de cadastro rápido para vincular etiquetas impressas escolhendo pelo lote.
export const listAvailableBatches = obrasQuery({
  args: {},
  returns: v.array(availableQrBatchValidator),
  handler: async (ctx) => {
    return await listAvailableQrBatches(ctx);
  },
});

// Lotes cujas etiquetas não pertencem a nenhuma obra (lotes antigos, criados
// antes da obra de destino ser obrigatória). Etiquetas cadastradas desses lotes
// não aparecem em nenhuma obra até o lote receber uma obra.
export const listBatchesWithoutProject = obrasQuery({
  args: {},
  returns: v.array(qrBatchWithoutProjectValidator),
  handler: async (ctx) => {
    return await listQrBatchesWithoutProject(ctx);
  },
});

// Define (ou troca) a obra de destino de um lote e grava a obra nas etiquetas
// do lote. Etiquetas cujo equipamento já está num item planejado mantêm a obra
// do item planejado, que é a fonte de verdade.
export const setBatchProject = obrasMutation({
  args: {
    batchId: v.string(),
    projectId: v.id("projects"),
  },
  returns: v.object({ updated: v.number(), kept: v.number() }),
  handler: async (ctx, args) => {
    return await setQrBatchProject(ctx, ctx.user, args);
  },
});

export const remove = obrasMutation({
  args: {
    token: v.string(),
  },
  returns: v.id("qrCodes"),
  handler: async (ctx, args) => {
    return await removeQrCodeByToken(ctx, args.token);
  },
});

export const removeMany = obrasMutation({
  args: {
    tokens: v.array(v.string()),
  },
  returns: v.object({
    deleted: v.array(v.string()),
    blocked: v.array(v.string()),
    missing: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    return await removeQrCodesByTokens(ctx, args.tokens);
  },
});

// qr_operator também pode vincular equipamento ao QR que escaneou.
// `projectId` (opcional) é a obra aberta no app de campo no momento do
// cadastro: a etiqueta passa a pertencer a ela, salvo se o equipamento já
// está preso a um item planejado de outra obra.
export const assignEquipment = authedMutation({
  args: {
    token: v.string(),
    equipmentId: v.id("equipment"),
    projectId: v.optional(v.id("projects")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await linkEquipmentToQr(ctx, ctx.user, args);
    return null;
  },
});

// Cadastro + vínculo na mesma transação. Se a obra estiver arquivada ou o QR
// já tiver equipamento, nada é gravado — uma nova tentativa não cria órfão.
export const registerForQr = authedMutation({
  args: {
    token: v.string(),
    description: v.string(),
    labelPhotoIds: v.array(v.id("_storage")),
    status: v.optional(equipmentStatusValidator),
    projectId: v.optional(v.id("projects")),
  },
  returns: v.id("equipment"),
  handler: async (ctx, args) => {
    return await registerEquipmentForQr(ctx, ctx.user, args);
  },
});

// Contexto completo de um QR (página mobile ao escanear). Público (sem auth),
// como getByToken: QR → equipamento real → item planejado → ambiente → andar →
// torre → obra, incluindo checklist.
export const getFullContext = query({
  args: { token: v.string() },
  returns: v.union(qrFullContextValidator, v.null()),
  handler: async (ctx, args) => {
    return await getQrFullContext(ctx, args.token);
  },
});

// Gera um QR único para um item planejado da obra, criando o equipamento real
// e vinculando-o (sem alterar o status do planejamento). Idempotente: se o item
// já tem equipamento vinculado com QR, retorna o token existente.
export const generateForProjectEquipment = obrasMutation({
  args: { itemId: v.id("projectEquipment") },
  returns: v.object({ token: v.string(), created: v.boolean() }),
  handler: async (ctx, args) => {
    return await generateQrForProjectEquipment(ctx, ctx.user, args.itemId);
  },
});

// Vincula uma etiqueta QR já impressa a um item planejado — fluxo de bipagem
// do cadastro rápido (QR livre ou já cadastrado pelo técnico). Não altera o
// status do planejamento (etiqueta colada não significa instalado).
export const linkTokenToProjectEquipment = obrasMutation({
  args: {
    token: v.string(),
    itemId: v.id("projectEquipment"),
  },
  returns: v.object({ token: v.string() }),
  handler: async (ctx, args) => {
    return await linkQrTokenToProjectEquipment(ctx, ctx.user, args);
  },
});

// Fila de atribuição do operador: equipamentos já cadastrados pelo técnico
// (QR com equipment) destinados a esta obra, mas ainda sem item planejado.
export const listRegisteredForProject = obrasQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(registeredQrEquipmentValidator),
  handler: async (ctx, args) => {
    return await listRegisteredEquipmentForProject(ctx, args.projectId);
  },
});

// Lista todos os QR codes atribuídos a uma obra, com a localização
// (torre/andar/ambiente) e os dados do item planejado vinculado.
export const listByProject = obrasQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(projectQrRowValidator),
  handler: async (ctx, args) => {
    return await listQrCodesByProject(ctx, args.projectId);
  },
});

// Backfill único: preenche qrCodes.projectId para QRs já vinculados a uma
// obra antes da denormalização. Rodar via `npx convex run qrCodes:backfillQrProjectIds`.
export const backfillQrProjectIds = internalMutation({
  args: {},
  returns: v.object({ scanned: v.number(), patched: v.number() }),
  handler: async (ctx) => {
    return await backfillQrProjectIdsModel(ctx);
  },
});
