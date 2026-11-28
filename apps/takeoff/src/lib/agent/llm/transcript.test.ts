import { describe, expect, it } from "vitest";
import { emptyTranscript, parseTranscript } from "./transcript";

describe("agent transcript persistence", () => {
  it("returns empty transcript for invalid input", () => {
    const t = parseTranscript(null, "proj-1");
    expect(t.projectId).toBe("proj-1");
    expect(t.messages).toEqual([]);
    expect(t.lastRunId).toBeNull();
  });

  it("parses valid messages, normalizes interrupted running tools, and drops malformed rows", () => {
    const parsed = parseTranscript(
      {
        version: 1,
        projectId: "proj-1",
        lastRunId: "run_123",
        updatedAt: 1000,
        messages: [
          { id: "m1", role: "user", text: "Levante os difusores", createdAt: 10 },
          {
            id: "m2",
            role: "assistant",
            text: "Analisei a planta.",
            createdAt: 20,
            tools: [
              {
                id: "t1",
                toolName: "view_page",
                label: "Visualizando…",
                status: "running",
                summary: "Página 1 analisada",
              },
              {
                id: "t2",
                toolName: "set_scale",
                label: "Escala…",
                status: "error",
              },
              { invalid: true },
            ],
          },
          { id: "", role: "user", text: "ignored" },
          { id: "m3", role: "system", text: "ignored" },
        ],
      },
      "proj-1",
    );

    expect(parsed.lastRunId).toBe("run_123");
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[1].tools).toEqual([
      {
        id: "t1",
        toolName: "view_page",
        label: "Visualizando…",
        status: "done",
        summary: "Página 1 analisada",
      },
      {
        id: "t2",
        toolName: "set_scale",
        label: "Escala…",
        status: "error",
      },
    ]);
  });

  it("caps persisted transcript at 80 messages", () => {
    const raw = {
      ...emptyTranscript("p1"),
      messages: Array.from({ length: 120 }, (_, i) => ({
        id: `m${i}`,
        role: i % 2 === 0 ? "user" : "assistant",
        text: `msg ${i}`,
        createdAt: i,
      })),
    };
    const parsed = parseTranscript(raw, "p1");
    expect(parsed.messages).toHaveLength(80);
    expect(parsed.messages[0].id).toBe("m40");
  });
});
