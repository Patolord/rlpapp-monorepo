import { describe, expect, it, vi } from "vitest";
import { fakeApp } from "../testContext";
import { AGENT_TOOLS } from "../tools";
import {
  buildAiSdkTools,
  formatToolFinishSummary,
  formatToolStartLabel,
  toolResultToModelOutput,
} from "./tools";

describe("AI SDK tool adapter", () => {
  it("wraps every AGENT_TOOLS entry with execute and toModelOutput", () => {
    const app = fakeApp();
    const tools = buildAiSdkTools(app.ctx);
    expect(Object.keys(tools).sort()).toEqual(AGENT_TOOLS.map((t) => t.name).sort());
  });

  it("maps text, error, and image tool results to AI SDK v7 outputs", () => {
    expect(
      toolResultToModelOutput({
        content: [{ type: "text", text: "ok" }],
      }),
    ).toEqual({ type: "text", value: "ok" });

    expect(
      toolResultToModelOutput({
        content: [{ type: "text", text: "falhou" }],
        isError: true,
      }),
    ).toEqual({ type: "error-text", value: "falhou" });

    expect(
      toolResultToModelOutput({
        content: [
          { type: "image", data: "QUJD", mimeType: "image/webp" },
          { type: "text", text: "página 1" },
        ],
      }),
    ).toEqual({
      type: "content",
      value: [
        {
          type: "file",
          mediaType: "image/webp",
          data: { type: "data", data: "QUJD" },
        },
        { type: "text", text: "página 1" },
      ],
    });
  });

  it("emits Portuguese activity hooks and converts thrown ToolError into isError result", async () => {
    const app = fakeApp();
    const onToolStart = vi.fn();
    const onToolFinish = vi.fn();
    const tools = buildAiSdkTools(app.ctx, { onToolStart, onToolFinish });

    const getTakeoff = tools.get_takeoff;
    expect(getTakeoff.execute).toBeDefined();
    const res = await getTakeoff.execute?.(
      {},
      { toolCallId: "tc1", messages: [], abortSignal: new AbortController().signal, context: {} },
    );
    expect(res).toMatchObject({ content: expect.any(Array) });
    expect(onToolStart).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: "get_takeoff", label: "Lendo o estado do takeoff…" }),
    );
    expect(onToolFinish).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "get_takeoff",
        isError: false,
        summary: "Resumo do takeoff lido",
      }),
    );

    // Calling set_scale with invalid inputs throws ToolError -> captured as isError result
    const setScale = tools.set_scale;
    const errRes = await setScale.execute?.(
      { page: 99, ratio: 0 },
      { toolCallId: "tc2", messages: [], abortSignal: new AbortController().signal, context: {} },
    );
    expect(errRes).toMatchObject({ isError: true });
    expect(onToolFinish).toHaveBeenLastCalledWith(
      expect.objectContaining({ toolName: "set_scale", isError: true }),
    );
  });

  it("formats helpful labels for common tools", () => {
    expect(formatToolStartLabel("view_page", { page: 2 })).toContain("página 2");
    expect(formatToolStartLabel("search_catalog", { query: "duto" })).toContain("duto");
    expect(formatToolFinishSummary("add_markings", { shapes: [{}, {}] }, { content: [] })).toBe(
      "2 marcações sugeridas",
    );
  });
});
