"use node";

import { v } from "convex/values";
import { equipKindValidator } from "./schema/engineering";
import OpenAI from "openai";
import { action, env } from "./_generated/server";
import { internal } from "./_generated/api";
import { aiIntentValidator } from "./model/ai/intents";
import { rejectReadOnlyAgentTokenInAction } from "./lib/agentTokens";
import { requireActionPermission } from "./lib/rbac";
import { SYSTEM_PROMPT, normalizeProposal } from "./model/ai/layoutProposal";
import {
  INTENT_SYSTEM_PROMPT,
  normalizeIntentResponse,
  parseModelJson,
} from "./model/ai/intentResponse";
// A regra só olha o arquivo importado; ai.ts também é "use node".
// eslint-disable-next-line @convex-dev/import-wrong-runtime
import { readAttachments } from "./model/ai/attachments";

const unitTypeValidator = v.union(v.literal("vrf"), v.literal("split"));

const proposalUnitValidator = v.object({
  floor: v.number(),
  final: v.number(),
  label: v.optional(v.string()),
  type: unitTypeValidator,
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
});

const fileInputValidator = v.object({
  storageId: v.id("_storage"),
  name: v.string(),
  mimeType: v.string(),
});

export const proposeLayout = action({
  args: {
    projectId: v.id("projects"),
    message: v.optional(v.string()),
    floorsContext: v.optional(
      v.array(v.object({ number: v.number(), label: v.string() }))
    ),
    files: v.optional(v.array(fileInputValidator)),
  },
  returns: v.object({
    reply: v.string(),
    units: v.array(proposalUnitValidator),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    rejectReadOnlyAgentTokenInAction(identity);
    await requireActionPermission(ctx, "assistente.use");

    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    const { extractedParts, userParts } = await readAttachments(
      ctx,
      openai,
      args.files ?? []
    );

    const floorsContext =
      args.floorsContext && args.floorsContext.length > 0
        ? `Andares existentes nesta obra: ${args.floorsContext
            .map((f) => `${f.number} (${f.label})`)
            .join(", ")}.`
        : "";

    const textContent = [
      floorsContext,
      args.message?.trim() ? `Instrução do usuário: ${args.message.trim()}` : "",
      ...extractedParts,
    ]
      .filter(Boolean)
      .join("\n\n");

    if (!textContent.trim() && userParts.length === 0) {
      throw new Error("Envie uma mensagem ou um arquivo para a IA analisar.");
    }

    userParts.unshift({
      type: "input_text",
      text: textContent || "Extraia os apartamentos do(s) arquivo(s) anexado(s).",
    });

    const response = await openai.responses.create({
      model: "gpt-4o",
      temperature: 0,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: SYSTEM_PROMPT }],
        },
        { role: "user", content: userParts },
      ],
    });

    const parsed = parseModelJson(response.output_text ?? "{}");

    return normalizeProposal(parsed);
  },
});

export const interpret = action({
  args: {
    projectId: v.id("projects"),
    message: v.optional(v.string()),
    context: v.optional(v.string()),
    files: v.optional(v.array(fileInputValidator)),
  },
  returns: v.object({
    reply: v.string(),
    needsClarification: v.union(v.string(), v.null()),
    intents: v.array(aiIntentValidator),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    rejectReadOnlyAgentTokenInAction(identity);
    await requireActionPermission(ctx, "assistente.use");

    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    const { extractedParts, userParts } = await readAttachments(
      ctx,
      openai,
      args.files ?? []
    );

    // QR codes ativos e ainda não vinculados, para a IA propor assign_qr com
    // tokens reais (agrupados por lote para facilitar pedidos como "lote X").
    const unassignedQrs: {
      token: string;
      batchName: string | null;
      createdAt: number;
    }[] = await ctx.runQuery(internal.qrCodes.listUnassignedForAi, {});
    let qrContext = "";
    if (unassignedQrs.length > 0) {
      const byBatch = new Map<string, string[]>();
      for (const qr of unassignedQrs) {
        const batch = qr.batchName ?? "(sem lote)";
        const list = byBatch.get(batch) ?? [];
        list.push(qr.token);
        byBatch.set(batch, list);
      }
      const lines = [...byBatch.entries()].map(
        ([batch, tokens]) => `Lote "${batch}": ${tokens.join(", ")}`
      );
      qrContext = `QR codes disponíveis (não vinculados):\n${lines.join("\n")}`;
    }

    const textContent = [
      args.context?.trim() ? `Contexto atual da obra:\n${args.context.trim()}` : "",
      qrContext,
      args.message?.trim() ? `Pedido do usuário: ${args.message.trim()}` : "",
      ...extractedParts,
    ]
      .filter(Boolean)
      .join("\n\n");

    if (!textContent.trim() && userParts.length === 0) {
      throw new Error("Envie uma mensagem ou um arquivo para a IA analisar.");
    }

    userParts.unshift({
      type: "input_text",
      text: textContent || "Analise o(s) arquivo(s) anexado(s) e proponha intents.",
    });

    const response = await openai.responses.create({
      model: "gpt-4o",
      temperature: 0,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: INTENT_SYSTEM_PROMPT }],
        },
        { role: "user", content: userParts },
      ],
    });

    const parsed = parseModelJson(response.output_text ?? "{}");

    return normalizeIntentResponse(parsed);
  },
});
