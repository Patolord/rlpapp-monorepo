"use node";

import OpenAI from "openai";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";

// Anexos enviados ao assistente (áudio, PDF, planilhas, Word, texto), lidos do
// storage e convertidos para a Responses API da OpenAI. Só roda no runtime
// Node (Buffer, xlsx, mammoth, Whisper).

export type AttachmentInput = {
  storageId: Id<"_storage">;
  name: string;
  mimeType: string;
};

export type UserPart =
  | { type: "input_text"; text: string }
  | { type: "input_file"; filename: string; file_data: string };

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

/**
 * Lê os anexos: áudios viram transcrição (Whisper), PDFs vão inteiros como
 * input_file (o modelo entende nativamente) e o resto vira texto extraído.
 */
export async function readAttachments(
  ctx: ActionCtx,
  openai: OpenAI,
  files: AttachmentInput[]
): Promise<{ extractedParts: string[]; userParts: UserPart[] }> {
  const extractedParts: string[] = [];
  const userParts: UserPart[] = [];

  for (const file of files) {
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

  return { extractedParts, userParts };
}
