"use node";

import { v } from "convex/values";
import OpenAI from "openai";
import { action } from "./_generated/server";

const unitTypeValidator = v.union(v.literal("vrf"), v.literal("split"));
const equipKindValidator = v.union(
  v.literal("condensadora"),
  v.literal("evaporadora")
);

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

/**
 * Lê um arquivo do storage e extrai texto conforme o tipo (Excel, Word, PDF,
 * texto). Áudio é transcrito separadamente via Whisper.
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
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer" });
    const parts: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      parts.push(`# Aba: ${sheetName}\n${XLSX.utils.sheet_to_csv(sheet)}`);
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

  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    // Importa o parser direto para evitar o código de debug do índice do pacote.
    // @ts-expect-error subpath sem tipos
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
    const result = await pdfParse(buffer);
    return result.text;
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

const SYSTEM_PROMPT = `Você é um assistente que estrutura dados de instalação de ar-condicionado em obras de prédios, a partir de texto livre, planilhas, documentos ou transcrições de áudio.

Sua tarefa: ler o conteúdo fornecido e devolver um JSON com a lista de apartamentos e seus equipamentos, seguindo EXATAMENTE este formato:

{
  "reply": "uma frase curta em português explicando o que você entendeu",
  "units": [
    {
      "floor": number,            // número do andar (ex: 2 para 2º andar). Térreo = 0.
      "final": number,            // posição do apto no andar (1 a N), na ordem
      "label": string,            // ex: "201" (se não souber, deixe vazio)
      "type": "vrf" | "split",    // VRF ou Split
      "floorSpan": number,        // 1 normal, 2 duplex, 3 triplex
      "equipment": [
        {
          "system": string,       // ex: "VRF 1", "VRF 2", "Split"
          "ambiente": string,     // ex: "Sala de Estar", "Suíte 1", "Área Técnica"
          "kind": "condensadora" | "evaporadora",
          "modelo": string,       // ex: "AM040", "AJ100" (vazio se desconhecido)
          "capacidade": string,   // ex: "4HP", "15.000 BTU/h" (vazio se desconhecido)
          "obs": string           // observações (vazio se nenhuma)
        }
      ]
    }
  ]
}

Regras:
- Toda condensadora fica em "Área Técnica" salvo indicação contrária.
- Cada sistema VRF tem 1 condensadora e várias evaporadoras; Split costuma ter 1 condensadora e 1+ evaporadoras.
- Se o conteúdo descrever vários andares idênticos, gere uma unidade para cada andar.
- Responda SOMENTE com o JSON válido, sem texto extra.`;

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

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY não configurada. Defina com: npx convex env set OPENAI_API_KEY <sua-chave>"
      );
    }

    const openai = new OpenAI({ apiKey });

    const extractedParts: string[] = [];
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

    const userContent = [
      floorsContext,
      args.message?.trim() ? `Instrução do usuário: ${args.message.trim()}` : "",
      ...extractedParts,
    ]
      .filter(Boolean)
      .join("\n\n");

    if (!userContent.trim()) {
      throw new Error("Envie uma mensagem ou um arquivo para a IA analisar.");
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("A IA não retornou um JSON válido. Tente reformular.");
    }

    return normalizeProposal(parsed);
  },
});

type ProposalUnit = {
  floor: number;
  final: number;
  label?: string;
  type: "vrf" | "split";
  floorSpan?: number;
  deadline?: number;
  equipment: Array<{
    system: string;
    ambiente: string;
    kind: "condensadora" | "evaporadora";
    modelo?: string;
    capacidade?: string;
    obs?: string;
  }>;
};

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function asNumber(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeProposal(parsed: unknown): {
  reply: string;
  units: ProposalUnit[];
} {
  const obj = (parsed ?? {}) as Record<string, unknown>;
  const reply = asString(obj.reply) || "Proposta gerada a partir do conteúdo.";
  const rawUnits = Array.isArray(obj.units) ? obj.units : [];

  const units: ProposalUnit[] = rawUnits.map((u) => {
    const unit = (u ?? {}) as Record<string, unknown>;
    const rawEquip = Array.isArray(unit.equipment) ? unit.equipment : [];
    const type = unit.type === "vrf" ? "vrf" : "split";
    let deadline: number | undefined;
    if (typeof unit.deadline === "string" && unit.deadline) {
      const ms = new Date(unit.deadline).getTime();
      if (Number.isFinite(ms)) deadline = ms;
    } else if (typeof unit.deadline === "number") {
      deadline = unit.deadline;
    }

    return {
      floor: Math.floor(asNumber(unit.floor, 0)),
      final: Math.max(1, Math.floor(asNumber(unit.final, 1))),
      label: asString(unit.label) || undefined,
      type,
      floorSpan: Math.max(1, Math.floor(asNumber(unit.floorSpan, 1))),
      deadline,
      equipment: rawEquip.map((e) => {
        const item = (e ?? {}) as Record<string, unknown>;
        return {
          system: asString(item.system) || "Split",
          ambiente: asString(item.ambiente) || "Ambiente",
          kind: item.kind === "condensadora" ? "condensadora" : "evaporadora",
          modelo: asString(item.modelo) || undefined,
          capacidade: asString(item.capacidade) || undefined,
          obs: asString(item.obs) || undefined,
        };
      }),
    };
  });

  return { reply, units };
}
