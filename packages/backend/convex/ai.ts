"use node";

import { equipKindValidator } from "./schema/engineering";
import { v } from "convex/values";
import OpenAI from "openai";
import { action, env } from "./_generated/server";
import { internal } from "./_generated/api";
import { aiIntentValidator } from "./model/ai/intents";
import { rejectReadOnlyAgentTokenInAction } from "./lib/agentTokens";
import { requireActionPermission } from "./lib/rbac";
import { SYSTEM_PROMPT, normalizeProposal } from "./model/ai/layoutProposal";
import { INTENT_SYSTEM_PROMPT, normalizeIntentResponse } from "./model/ai/intentResponse";

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

function isPdf(name: string, mimeType: string): boolean {
  return mimeType === "application/pdf" || name.toLowerCase().endsWith(".pdf");
}

/**
 * Lê um arquivo do storage e extrai texto conforme o tipo (Excel, Word, texto).
 * PDFs são enviados diretamente ao modelo (via input_file) e áudios são
 * transcritos via Whisper — ambos tratados fora desta função.
 */
async function extractText(
  buffer: Buffer,
  name: string,
  mimeType: string
): Promise<string> {
  const lower = name.toLowerCase();

  if (
    mimeType.includes("spreadsheet") ||
    mimeType === "text/csv" ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    lower.endsWith(".csv")
  ) {
    const mod = await import("xlsx");
    const XLSX = ("default" in mod ? (mod as Record<string, unknown>).default : mod) as typeof import("xlsx");
    // `cellFormula: false` garante que lemos o valor calculado das células e
    // nunca o texto da fórmula (ex: `=B10+100`).
    const wb = XLSX.read(buffer, { type: "buffer", cellFormula: false });
    const parts: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      // `blankrows: false` + filtro removem linhas totalmente vazias, que em
      // planilhas reais chegam às centenas e poluem o contexto da IA.
      const csv = XLSX.utils
        .sheet_to_csv(sheet, { blankrows: false })
        .split("\n")
        .filter((line) => line.replace(/[,;\s]/g, "").length > 0)
        .join("\n");
      if (csv.trim().length === 0) continue;
      parts.push(`# Aba: ${sheetName}\n${csv}`);
    }
    return parts.join("\n\n");
  }

  if (
    mimeType.includes("word") ||
    mimeType.includes("officedocument.wordprocessingml") ||
    lower.endsWith(".docx")
  ) {
    const mammoth = (await import("mammoth")).default;
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // Texto puro / fallback.
  return buffer.toString("utf-8");
}

function isAudio(name: string, mimeType: string): boolean {
  const lower = name.toLowerCase();
  return (
    mimeType.startsWith("audio/") ||
    [".mp3", ".m4a", ".wav", ".webm", ".ogg", ".mp4"].some((ext) =>
      lower.endsWith(ext)
    )
  );
}

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

    const extractedParts: string[] = [];
    // Conteúdo multimodal do usuário para a Responses API (texto + PDFs).
    const userParts: Array<
      | { type: "input_text"; text: string }
      | { type: "input_file"; filename: string; file_data: string }
    > = [];

    for (const file of args.files ?? []) {
      const blob = await ctx.storage.get(file.storageId);
      if (!blob) continue;
      const buffer = Buffer.from(await blob.arrayBuffer());

      if (isAudio(file.name, file.mimeType)) {
        const audioFile = await OpenAI.toFile(buffer, file.name);
        const transcription = await openai.audio.transcriptions.create({
          file: audioFile,
          model: "whisper-1",
        });
        extractedParts.push(
          `Transcrição do áudio "${file.name}":\n${transcription.text}`
        );
      } else if (isPdf(file.name, file.mimeType)) {
        // PDFs são entendidos nativamente pelo modelo via input_file.
        userParts.push({
          type: "input_file",
          filename: file.name,
          file_data: `data:application/pdf;base64,${buffer.toString("base64")}`,
        });
      } else {
        const text = await extractText(buffer, file.name, file.mimeType);
        extractedParts.push(`Conteúdo de "${file.name}":\n${text}`);
      }
    }

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

    const raw = response.output_text ?? "{}";
    let parsed: unknown;
    try {
      // Remove cercas de código (```json ... ```), se houver.
      const cleaned = raw
        .trim()
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("A IA não retornou um JSON válido. Tente reformular.");
    }

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

    const extractedParts: string[] = [];
    const userParts: Array<
      | { type: "input_text"; text: string }
      | { type: "input_file"; filename: string; file_data: string }
    > = [];

    for (const file of args.files ?? []) {
      const blob = await ctx.storage.get(file.storageId);
      if (!blob) continue;
      const buffer = Buffer.from(await blob.arrayBuffer());

      if (isAudio(file.name, file.mimeType)) {
        const audioFile = await OpenAI.toFile(buffer, file.name);
        const transcription = await openai.audio.transcriptions.create({
          file: audioFile,
          model: "whisper-1",
        });
        extractedParts.push(
          `Transcrição do áudio "${file.name}":\n${transcription.text}`
        );
      } else if (isPdf(file.name, file.mimeType)) {
        userParts.push({
          type: "input_file",
          filename: file.name,
          file_data: `data:application/pdf;base64,${buffer.toString("base64")}`,
        });
      } else {
        const text = await extractText(buffer, file.name, file.mimeType);
        extractedParts.push(`Conteúdo de "${file.name}":\n${text}`);
      }
    }

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

    const raw = response.output_text ?? "{}";
    let parsed: unknown;
    try {
      const cleaned = raw
        .trim()
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("A IA não retornou um JSON válido. Tente reformular.");
    }

    return normalizeIntentResponse(parsed);
  },
});
