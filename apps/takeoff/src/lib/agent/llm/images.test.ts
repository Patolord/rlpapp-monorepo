import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";
import { TRIMMED_IMAGE_STUB, trimHistoryImages } from "./images";

function makeViewPageToolMessage(id: string): ModelMessage {
  return {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: id,
        toolName: "view_page",
        output: {
          type: "content",
          value: [
            {
              type: "file",
              mediaType: "image/webp",
              data: { type: "data", data: `BASE64_${id}` },
            },
            { type: "text", text: `caption ${id}` },
          ],
        },
      },
    ],
  };
}

function makeMemoryToolMessage(id: string): ModelMessage {
  return {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: id,
        toolName: "get_memory",
        output: {
          type: "content",
          value: [
            {
              type: "file",
              mediaType: "image/png",
              data: { type: "data", data: "MEMORY_ICON" },
            },
          ],
        },
      },
    ],
  };
}

describe("trimHistoryImages", () => {
  it("returns original array reference untouched when under threshold", () => {
    const messages = Array.from({ length: 10 }, (_, i) => makeViewPageToolMessage(`v${i}`));
    const result = trimHistoryImages(messages, { keepLatest: 6, batchTrim: 4 });
    expect(result.trimmed).toBe(0);
    expect(result.remaining).toBe(10);
    expect(result.messages).toBe(messages);
  });

  it("batch-trims oldest view_page images once threshold is exceeded and keeps latest N", () => {
    const messages: ModelMessage[] = [
      makeMemoryToolMessage("mem"),
      ...Array.from({ length: 11 }, (_, i) => makeViewPageToolMessage(`v${i}`)),
    ];

    const result = trimHistoryImages(messages, { keepLatest: 6, batchTrim: 4 });
    expect(result.trimmed).toBe(5);
    expect(result.remaining).toBe(6);

    // get_memory image is preserved untouched
    const memPart = result.messages[0].content[0] as {
      output: { value: { type: string }[] };
    };
    expect(memPart.output.value[0].type).toBe("file");

    // Oldest 5 view_page images (indices 1..5) replaced by stub, captions kept
    for (let i = 1; i <= 5; i++) {
      const part = result.messages[i].content[0] as {
        output: { value: { type: string; text?: string }[] };
      };
      expect(part.output.value[0]).toEqual({ type: "text", text: TRIMMED_IMAGE_STUB });
      expect(part.output.value[1]).toEqual({ type: "text", text: `caption v${i - 1}` });
    }

    // Latest 6 view_page images (indices 6..11) stay live
    for (let i = 6; i <= 11; i++) {
      const part = result.messages[i].content[0] as {
        output: { value: { type: string }[] };
      };
      expect(part.output.value[0].type).toBe("file");
    }
  });
});
