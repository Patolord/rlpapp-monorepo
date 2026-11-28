import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { fakeApp } from "../testContext";
import { buildAgentSystemPrompt, runTakeoffAgentTurn, transcriptToModelMessages } from "./run";

const USAGE = {
  inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 20, text: 20, reasoning: 0 },
};

describe("runTakeoffAgentTurn", () => {
  it("appends company instructions extra only when non-empty", () => {
    const base = buildAgentSystemPrompt();
    expect(buildAgentSystemPrompt("   ")).toBe(base);
    expect(buildAgentSystemPrompt("Use padrão hospitalar.")).toContain("Use padrão hospitalar.");
  });

  it("converts text history into model messages", () => {
    const msgs = transcriptToModelMessages(
      [
        { id: "1", role: "user", text: "Oi", createdAt: 1 },
        { id: "2", role: "assistant", text: "   ", createdAt: 2 },
        { id: "3", role: "assistant", text: "Olá!", createdAt: 3 },
      ],
      "Levante os splits",
    );
    expect(msgs).toEqual([
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Olá!" },
      { role: "user", content: "Levante os splits" },
    ]);
  });

  it("executes a multi-step tool loop against AgentContext and streams deltas", async () => {
    const app = fakeApp();
    let callIndex = 0;

    const mockModel = new MockLanguageModelV4({
      doStream: async () => {
        const turn = callIndex++;
        if (turn === 0) {
          return {
            stream: simulateReadableStream({
              chunks: [
                {
                  type: "tool-call",
                  toolCallId: "tc-1",
                  toolName: "get_takeoff",
                  input: "{}",
                },
                {
                  type: "finish",
                  finishReason: { unified: "tool-calls", raw: "tool_use" },
                  usage: USAGE,
                },
              ],
            }),
          };
        }
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "text-start", id: "txt-1" },
              { type: "text-delta", id: "txt-1", delta: "Takeoff " },
              { type: "text-delta", id: "txt-1", delta: "lido com sucesso." },
              { type: "text-end", id: "txt-1" },
              {
                type: "finish",
                finishReason: { unified: "stop", raw: "end_turn" },
                usage: USAGE,
              },
            ],
          }),
        };
      },
    });

    const deltas: string[] = [];
    const onToolStart = vi.fn();
    const onToolFinish = vi.fn();
    const onStepFinish = vi.fn();

    const res = await runTakeoffAgentTurn({
      history: [],
      prompt: "Verifique o estado do takeoff",
      ctx: app.ctx,
      modelId: "claude-opus-5-5",
      maxTurns: 5,
      maxTokensPerTurn: 1024,
      modelOverride: mockModel,
      onTextDelta: (d) => deltas.push(d),
      onToolStart,
      onToolFinish,
      onStepFinish,
    });

    expect(res.aborted).toBe(false);
    expect(res.steps).toBe(2);
    expect(res.text).toBe("Takeoff lido com sucesso.");
    expect(deltas.join("")).toBe("Takeoff lido com sucesso.");
    expect(onToolStart).toHaveBeenCalledTimes(1);
    expect(onToolFinish).toHaveBeenCalledTimes(1);
    expect(onStepFinish).toHaveBeenCalledTimes(2);
  });

  it("returns aborted=true cleanly when AbortSignal fires", async () => {
    const app = fakeApp();
    const controller = new AbortController();
    controller.abort();

    const mockModel = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            {
              type: "finish",
              finishReason: { unified: "stop", raw: "end_turn" },
              usage: USAGE,
            },
          ],
        }),
      }),
    });

    const res = await runTakeoffAgentTurn({
      history: [],
      prompt: "Cancelar",
      ctx: app.ctx,
      modelId: "claude-opus-5-5",
      maxTurns: 5,
      maxTokensPerTurn: 1024,
      modelOverride: mockModel,
      abortSignal: controller.signal,
    });

    expect(res.aborted).toBe(true);
  });
});
