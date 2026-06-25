"use node";

import { v, type Infer } from "convex/values";
import OpenAI from "openai";
import { action } from "./_generated/server";
import { aiIntentValidator } from "./aiIntents";

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

// ============================================================================
// Sistema multi-intent (chat lateral). A IA interpreta comandos e devolve
// INTENTS estruturados. Ela NUNCA escreve no banco — quem aplica é a mutation
// `aiIntents.applyIntents` após o usuário confirmar o preview.
// ============================================================================

const INTENT_SYSTEM_PROMPT = `Você é o assistente de engenharia de uma plataforma de gestão de obras de ar-condicionado.
A hierarquia da obra é: Obra → Torre → Andar → Ambiente → Equipamento.

Sua função é interpretar o pedido do usuário (texto, planilha, documento ou áudio transcrito) e devolver uma lista de INTENTS estruturados. Você NUNCA executa nada: apenas propõe. O usuário vai revisar e confirmar.

Responda SOMENTE com JSON válido neste formato:
{
  "reply": "frase curta em português explicando o que você vai fazer",
  "needsClarification": "pergunta ao usuário SE faltar informação essencial (senão omita ou deixe vazio)",
  "intents": [ ... ]
}

Tipos de intent disponíveis (campo "type"):
- {"type":"update_project","client?":string,"address?":string,"status?":"planning"|"in_progress"|"completed"|"paused","startDate?":epoch_ms,"endDate?":epoch_ms}
- {"type":"create_tower","name":string}
- {"type":"duplicate_tower","towerName":string,"newName?":string}
- {"type":"create_floors","towerName":string,"from":number,"to":number}
- {"type":"create_environment","towerName":string,"floorNumber":number,"name":string,"envType?":string}
- {"type":"add_equipment","towerName":string,"floorNumber":number,"environmentName":string,"system":string,"kind":"condensadora"|"evaporadora","modelo?":string,"capacidade?":string,"serialNumber?":string,"deadline?":epoch_ms}
- {"type":"create_checklist_template","name":string,"items":[{"label":string,"required":boolean}]}

Regras:
- Sempre referencie torre/andar/ambiente por NOME/NÚMERO. Para criar equipamento num ambiente novo, gere os intents na ordem: create_tower → create_floors → create_environment → add_equipment.
- Datas devem ser epoch em milissegundos (number).
- Se faltar uma informação crítica (ex: qual torre), use "needsClarification" e NÃO invente.
- Toda condensadora normalmente fica em "Área Técnica".
- Responda SOMENTE com o JSON, sem texto fora dele.`;

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

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY não configurada. Defina com: npx convex env set OPENAI_API_KEY <sua-chave>"
      );
    }

    const openai = new OpenAI({ apiKey });

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

    const textContent = [
      args.context?.trim() ? `Contexto atual da obra:\n${args.context.trim()}` : "",
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

type AiIntent = Infer<typeof aiIntentValidator>;

function coerceDate(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v) {
    const ms = new Date(v).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  return undefined;
}

// Coage cada intent ao formato esperado e descarta inválidos, garantindo que
// o validador de retorno da action passe mesmo com saídas imperfeitas da IA.
function normalizeIntentResponse(parsed: unknown): {
  reply: string;
  needsClarification: string | null;
  intents: AiIntent[];
} {
  const obj = (parsed ?? {}) as Record<string, unknown>;
  const reply = asString(obj.reply) || "Proposta gerada.";
  const needsClarification = asString(obj.needsClarification) || null;
  const rawIntents = Array.isArray(obj.intents) ? obj.intents : [];

  const intents: AiIntent[] = [];
  for (const r of rawIntents) {
    const o = (r ?? {}) as Record<string, unknown>;
    const type = asString(o.type);
    switch (type) {
      case "update_project": {
        const intent: Record<string, unknown> = { type };
        if (typeof o.client === "string") intent.client = o.client;
        if (typeof o.address === "string") intent.address = o.address;
        if (
          o.status === "planning" ||
          o.status === "in_progress" ||
          o.status === "completed" ||
          o.status === "paused"
        )
          intent.status = o.status;
        const sd = coerceDate(o.startDate);
        if (sd !== undefined) intent.startDate = sd;
        const ed = coerceDate(o.endDate);
        if (ed !== undefined) intent.endDate = ed;
        intents.push(intent as AiIntent);
        break;
      }
      case "create_tower": {
        const name = asString(o.name);
        if (name) intents.push({ type, name } as AiIntent);
        break;
      }
      case "duplicate_tower": {
        const towerName = asString(o.towerName);
        if (!towerName) break;
        const intent: Record<string, unknown> = { type, towerName };
        if (typeof o.newName === "string") intent.newName = o.newName;
        intents.push(intent as AiIntent);
        break;
      }
      case "create_floors": {
        const towerName = asString(o.towerName);
        const from = asNumber(o.from, NaN);
        const to = asNumber(o.to, NaN);
        if (towerName && Number.isFinite(from) && Number.isFinite(to)) {
          intents.push({
            type,
            towerName,
            from: Math.floor(from),
            to: Math.floor(to),
          } as AiIntent);
        }
        break;
      }
      case "create_environment": {
        const towerName = asString(o.towerName);
        const name = asString(o.name);
        const floorNumber = asNumber(o.floorNumber, NaN);
        if (towerName && name && Number.isFinite(floorNumber)) {
          const intent: Record<string, unknown> = {
            type,
            towerName,
            floorNumber: Math.floor(floorNumber),
            name,
          };
          if (typeof o.envType === "string") intent.envType = o.envType;
          intents.push(intent as AiIntent);
        }
        break;
      }
      case "add_equipment": {
        const towerName = asString(o.towerName);
        const environmentName = asString(o.environmentName);
        const system = asString(o.system);
        const floorNumber = asNumber(o.floorNumber, NaN);
        const kind = o.kind === "condensadora" ? "condensadora" : "evaporadora";
        if (towerName && environmentName && system && Number.isFinite(floorNumber)) {
          const intent: Record<string, unknown> = {
            type,
            towerName,
            floorNumber: Math.floor(floorNumber),
            environmentName,
            system,
            kind,
          };
          if (typeof o.modelo === "string") intent.modelo = o.modelo;
          if (typeof o.capacidade === "string") intent.capacidade = o.capacidade;
          if (typeof o.serialNumber === "string")
            intent.serialNumber = o.serialNumber;
          const dl = coerceDate(o.deadline);
          if (dl !== undefined) intent.deadline = dl;
          intents.push(intent as AiIntent);
        }
        break;
      }
      case "create_checklist_template": {
        const name = asString(o.name);
        const rawItems = Array.isArray(o.items) ? o.items : [];
        const items = rawItems
          .map((it) => {
            const i = (it ?? {}) as Record<string, unknown>;
            return { label: asString(i.label), required: Boolean(i.required) };
          })
          .filter((i) => i.label);
        if (name && items.length > 0) {
          intents.push({ type, name, items } as AiIntent);
        }
        break;
      }
    }
  }

  return { reply, needsClarification, intents };
}
