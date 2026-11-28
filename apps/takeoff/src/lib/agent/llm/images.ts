/**
 * Rolling image window for the AI SDK agent loop (`prepareStep`).
 *
 * Every turn of a tool loop resends the full message history. Keeping every
 * rendered page crop in history quickly blows past request-body limits and
 * inflates token cost. Trimming on *every* turn would break Anthropic's prompt
 * cache prefix on every turn, so we trim in batches: once more than
 * `keepLatest + batchTrim` images accumulate in tool results, we replace the
 * oldest ones with a concise Portuguese stub so only `keepLatest` remain.
 */

import type { ModelMessage } from "ai";

export const DEFAULT_KEEP_LATEST_IMAGES = 6;
export const DEFAULT_IMAGE_TRIM_BATCH = 4;

export const TRIMMED_IMAGE_STUB =
  "[Imagem anterior removida do contexto para economizar memória; chame view_page novamente se precisar rever esta região.]";

export interface TrimImagesOptions {
  /** Number of most recent tool-result images to keep live. */
  keepLatest?: number;
  /** Extra images tolerated before triggering a batch trim (preserves prompt cache). */
  batchTrim?: number;
}

interface ImageSlot {
  msgIndex: number;
  partIndex: number;
  contentIndex: number;
}

function isFileContentItem(item: unknown): boolean {
  if (!item || typeof item !== "object") return false;
  const rec = item as Record<string, unknown>;
  if (rec.type === "file") return true;
  if (rec.type === "image-data" || rec.type === "image-url") return true;
  return false;
}

function collectToolImageSlots(messages: readonly ModelMessage[]): ImageSlot[] {
  const slots: ImageSlot[] = [];
  for (let msgIndex = 0; msgIndex < messages.length; msgIndex++) {
    const msg = messages[msgIndex];
    if (msg.role !== "tool" || !Array.isArray(msg.content)) continue;
    for (let partIndex = 0; partIndex < msg.content.length; partIndex++) {
      const part = msg.content[partIndex];
      if (!part || typeof part !== "object" || part.type !== "tool-result") continue;
      // Keep company memory symbol examples small & intact; trim view_page screenshots.
      if (part.toolName !== "view_page") continue;
      const output = (part as { output?: unknown }).output;
      if (!output || typeof output !== "object") continue;
      const outObj = output as { type?: unknown; value?: unknown };
      if (outObj.type !== "content" || !Array.isArray(outObj.value)) continue;
      for (let contentIndex = 0; contentIndex < outObj.value.length; contentIndex++) {
        if (isFileContentItem(outObj.value[contentIndex])) {
          slots.push({ msgIndex, partIndex, contentIndex });
        }
      }
    }
  }
  return slots;
}

/**
 * Returns the original `messages` array untouched when below threshold (so
 * prompt cache prefixes stay byte-identical), or a shallow-copied array with
 * the oldest `view_page` images replaced by `TRIMMED_IMAGE_STUB`.
 */
export function trimHistoryImages(
  messages: ModelMessage[],
  opts: TrimImagesOptions = {},
): { messages: ModelMessage[]; trimmed: number; remaining: number } {
  const keepLatest = Math.max(1, opts.keepLatest ?? DEFAULT_KEEP_LATEST_IMAGES);
  const batchTrim = Math.max(0, opts.batchTrim ?? DEFAULT_IMAGE_TRIM_BATCH);
  const slots = collectToolImageSlots(messages);

  if (slots.length <= keepLatest + batchTrim) {
    return { messages, trimmed: 0, remaining: slots.length };
  }

  const dropCount = slots.length - keepLatest;
  const toDrop = new Set(
    slots.slice(0, dropCount).map((s) => `${s.msgIndex}:${s.partIndex}:${s.contentIndex}`),
  );

  const next = messages.map((msg, msgIndex) => {
    if (msg.role !== "tool" || !Array.isArray(msg.content)) return msg;
    let msgChanged = false;
    const nextContent = msg.content.map((part, partIndex) => {
      if (!part || typeof part !== "object" || part.type !== "tool-result") return part;
      const output = (part as { output?: unknown }).output;
      if (!output || typeof output !== "object") return part;
      const outObj = output as { type?: unknown; value?: unknown };
      if (outObj.type !== "content" || !Array.isArray(outObj.value)) return part;

      let partChanged = false;
      const nextValue = outObj.value.map((item, contentIndex) => {
        if (!toDrop.has(`${msgIndex}:${partIndex}:${contentIndex}`)) return item;
        partChanged = true;
        return { type: "text" as const, text: TRIMMED_IMAGE_STUB };
      });
      if (!partChanged) return part;
      msgChanged = true;
      return {
        ...part,
        output: { ...outObj, value: nextValue },
      };
    });
    return msgChanged ? ({ ...msg, content: nextContent } as ModelMessage) : msg;
  });

  return { messages: next, trimmed: dropCount, remaining: keepLatest };
}
