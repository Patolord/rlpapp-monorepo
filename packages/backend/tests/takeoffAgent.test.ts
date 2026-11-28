import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  DEFAULT_TAKEOFF_AGENT_SETTINGS,
  estimateAgentCallCostMicroUsd,
} from "@rlpapp/shared/takeoff/agentModels";
import { api } from "../convex/_generated/api";
import {
  AnthropicSseUsageParser,
  countMessageImages,
  createAnthropicUsageTeeStream,
  sanitizeAnthropicRequestBody,
} from "../convex/model/procurement/takeoffAgentPolicy";
import { setup, withUser } from "./helpers";

function sseStreamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

const SAMPLE_SSE_CHUNKS = [
  'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"claude-opus-5-5","stop_reason":null,"usage":{"input_tokens":1200,"cache_creation_input_tokens":400,"cache_read_input_tokens":3000,"output_tokens":1}}}\n\n',
  'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Lendo a planta..."}}\n\n',
  'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
  'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"view_page","input":{}}}\n\n',
  'event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n',
  'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":250}}\n\n',
  'event: message_stop\ndata: {"type":"message_stop"}\n\n',
];

describe("takeoffAgentPolicy", () => {
  test("sanitizes body: forces model/effort, caps max_tokens, drops unknown keys, counts images", () => {
    const res = sanitizeAnthropicRequestBody(
      {
        model: "claude-expensive-fake",
        max_tokens: 999999,
        stream: true,
        unknown_field: "drop-me",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Veja" },
              { type: "image", source: { type: "base64", data: "abc" } },
              {
                type: "tool_result",
                tool_use_id: "t1",
                content: [{ type: "image", source: { type: "base64", data: "def" } }],
              },
            ],
          },
        ],
      },
      {
        ...DEFAULT_TAKEOFF_AGENT_SETTINGS,
        enabled: true,
        model: "claude-sonnet-5-5",
        effort: "medium",
        maxTokensPerTurn: 4096,
      }
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.model).toBe("claude-sonnet-5-5");
    expect(res.body.max_tokens).toBe(4096);
    expect(res.body.output_config).toEqual({ effort: "medium" });
    expect("unknown_field" in res.body).toBe(false);
    expect(res.imageCount).toBe(2);
    expect(res.stream).toBe(true);
    expect(countMessageImages(res.body.messages)).toBe(2);
  });

  test("parses Anthropic SSE usage across arbitrary chunk splits", () => {
    const parser = new AnthropicSseUsageParser();
    const raw = SAMPLE_SSE_CHUNKS.join("");
    // Split every 17 characters to exercise partial-line buffering.
    const encoder = new TextEncoder();
    for (let i = 0; i < raw.length; i += 17) {
      parser.push(encoder.encode(raw.slice(i, i + 17)));
    }
    expect(parser.finish()).toEqual({
      inputTokens: 1200,
      outputTokens: 250,
      cacheReadTokens: 3000,
      cacheCreationTokens: 400,
      stopReason: "tool_use",
      toolsCalled: ["view_page"],
    });
  });

  test("createAnthropicUsageTeeStream commits usage before close and on cancel/abort", async () => {
    // Normal completion
    const events: string[] = [];
    let finishedOk: {
      status: string;
      usage: { inputTokens: number; outputTokens: number; toolsCalled: string[] };
    } | null = null;
    const teed = createAnthropicUsageTeeStream(
      sseStreamFromChunks(SAMPLE_SSE_CHUNKS),
      async (res) => {
        events.push("onFinish");
        finishedOk = res;
      }
    );
    const body = await new Response(teed).text();
    events.push("readDone");
    expect(body).toContain("Lendo a planta...");
    expect(events).toEqual(["onFinish", "readDone"]);
    expect(finishedOk?.status).toBe("ok");
    expect(finishedOk?.usage.inputTokens).toBe(1200);
    expect(finishedOk?.usage.outputTokens).toBe(250);
    expect(finishedOk?.usage.toolsCalled).toEqual(["view_page"]);

    // Client cancel / abort
    let finishedAbort: { status: string; usage: { inputTokens: number } } | null = null;
    const encoder = new TextEncoder();
    let sentFirst = false;
    const openStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sentFirst) {
          sentFirst = true;
          controller.enqueue(encoder.encode(SAMPLE_SSE_CHUNKS[0]!));
        }
      },
    });
    const teedAbort = createAnthropicUsageTeeStream(openStream, async (res) => {
      finishedAbort = res;
    });
    const reader = teedAbort.getReader();
    await reader.read();
    await reader.cancel();
    expect(finishedAbort?.status).toBe("aborted");
    expect(finishedAbort?.usage.inputTokens).toBe(1200);
  });
});

describe("takeoffAgent Convex functions & HTTP proxy", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  const originalBase = process.env.ANTHROPIC_BASE_URL;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    delete process.env.ANTHROPIC_BASE_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
    if (originalBase === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = originalBase;
  });

  async function seedUsers() {
    const t = setup();
    const asAdmin = await withUser(t, {
      clerkId: "admin_1",
      name: "Admin",
      roles: ["admin"],
    });
    const asEstimator = await withUser(t, {
      clerkId: "est_1",
      name: "Orçamentista Ana",
      roles: ["takeoff"],
    });
    const asDenied = await withUser(t, {
      clerkId: "est_denied",
      name: "Orçamentista Sem IA",
      roles: ["takeoff"],
      permissionDenials: ["takeoff.agente"],
    });
    return { t, asAdmin, asEstimator, asDenied };
  }

  test("settings default to disabled, save with audit, and reflect in client status", async () => {
    const { asAdmin, asEstimator, asDenied } = await seedUsers();
    const now = Date.UTC(2026, 10, 28, 15, 0);

    const before = await asEstimator.query(api.takeoffAgent.getStatus, { now });
    expect(before.hasPermission).toBe(true);
    expect(before.enabled).toBe(false);
    expect(before.model).toBe("claude-opus-5-5");

    const deniedStatus = await asDenied.query(api.takeoffAgent.getStatus, { now });
    expect(deniedStatus.hasPermission).toBe(false);

    await asAdmin.mutation(api.takeoffAgent.saveSettings, {
      enabled: true,
      model: "claude-sonnet-5-5",
      effort: "medium",
      monthlyCompanyBudgetUsdCents: 15_000,
      monthlyUserBudgetUsdCents: 3_000,
      maxTurnsPerRun: 45,
      maxTokensPerTurn: 8_192,
      promptVersion: "v2",
      instructionsExtra: "Sempre separar VRF e Split em abas distintas.",
    });

    const after = await asEstimator.query(api.takeoffAgent.getStatus, { now });
    expect(after.enabled).toBe(true);
    expect(after.model).toBe("claude-sonnet-5-5");
    expect(after.effort).toBe("medium");
    expect(after.promptVersion).toBe("v2");
    expect(after.instructionsExtra).toBe(
      "Sempre separar VRF e Split em abas distintas."
    );
  });

  test("CORS preflight allows Tauri and dev Vite origins and omits unknown origins", async () => {
    const t = setup();
    const okRes = await t.fetch("/takeoff/agent/messages", {
      method: "OPTIONS",
      headers: { Origin: "tauri://localhost" },
    });
    expect(okRes.status).toBe(204);
    expect(okRes.headers.get("Access-Control-Allow-Origin")).toBe("tauri://localhost");

    const unknownRes = await t.fetch("/takeoff/agent/messages", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example" },
    });
    expect(unknownRes.status).toBe(204);
    expect(unknownRes.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  test("proxy rejects unauthenticated, denied permission, disabled agent, and missing API key", async () => {
    const { t, asAdmin, asEstimator, asDenied } = await seedUsers();
    const payload = JSON.stringify({
      messages: [{ role: "user", content: "Oi" }],
      stream: true,
    });

    // Missing API key -> 503
    delete process.env.ANTHROPIC_API_KEY;
    const noKey = await asEstimator.fetch("/takeoff/agent/messages", {
      method: "POST",
      body: payload,
    });
    expect(noKey.status).toBe(503);
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";

    // Unauthenticated -> 401
    const unauth = await t.fetch("/takeoff/agent/messages", {
      method: "POST",
      body: payload,
    });
    expect(unauth.status).toBe(401);

    // Denied takeoff.agente -> 403
    const denied = await asDenied.fetch("/takeoff/agent/messages", {
      method: "POST",
      body: payload,
    });
    expect(denied.status).toBe(403);

    // Agent disabled -> 403
    const disabled = await asEstimator.fetch("/takeoff/agent/messages", {
      method: "POST",
      body: payload,
    });
    expect(disabled.status).toBe(403);

    // Enable agent, verify startRun enforces permission
    await asAdmin.mutation(api.takeoffAgent.saveSettings, {
      ...DEFAULT_TAKEOFF_AGENT_SETTINGS,
      enabled: true,
    });
    await expect(asDenied.mutation(api.takeoffAgent.startRun, {})).rejects.toThrow(
      "takeoff.agente"
    );
  });

  test("proxy enforces body policy, records usage ledger, and updates dashboard", async () => {
    const { t, asAdmin, asEstimator } = await seedUsers();
    await asAdmin.mutation(api.takeoffAgent.saveSettings, {
      ...DEFAULT_TAKEOFF_AGENT_SETTINGS,
      enabled: true,
      model: "claude-opus-5-5",
      effort: "high",
      maxTokensPerTurn: 4096,
    });

    const started = await asEstimator.mutation(api.takeoffAgent.startRun, {
      takeoffExternalId: "proj-lorena",
      takeoffName: "Obra Lorena",
    });

    let forwardedBody: Record<string, unknown> | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      forwardedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          stop_reason: "tool_use",
          content: [
            { type: "text", text: "Lendo a planta..." },
            { type: "tool_use", id: "toolu_1", name: "view_page", input: {} },
          ],
          usage: {
            input_tokens: 1200,
            cache_creation_input_tokens: 400,
            cache_read_input_tokens: 3000,
            output_tokens: 250,
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
        }
      );
    });

    const res = await asEstimator.fetch("/takeoff/agent/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:1420",
        "x-takeoff-run-id": started.runId,
      },
      body: JSON.stringify({
        model: "claude-fake-override",
        max_tokens: 50_000,
        stream: false,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Analise a planta" },
              { type: "image", source: { type: "base64", data: "ZmFrZQ==" } },
            ],
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:1420");
    const responseBody = await res.text();
    expect(responseBody).toContain("Lendo a planta...");

    // Verify policy enforced on forwarded upstream request
    expect(forwardedBody).not.toBeNull();
    expect(forwardedBody!.model).toBe("claude-opus-5-5");
    expect(forwardedBody!.max_tokens).toBe(4096);
    expect(forwardedBody!.output_config).toEqual({ effort: "high" });

    // Verify ledger rows persisted
    const expectedCost = estimateAgentCallCostMicroUsd("claude-opus-5-5", {
      inputTokens: 1200,
      outputTokens: 250,
      cacheReadTokens: 3000,
      cacheCreationTokens: 400,
    });
    const calls = await t.run((ctx) => ctx.db.query("takeoffAgentCalls").collect());
    expect(calls).toHaveLength(1);
    expect(calls[0]!.status).toBe("ok");
    expect(calls[0]!.toolsCalled).toEqual(["view_page"]);
    expect(calls[0]!.imageCount).toBe(1);
    expect(calls[0]!.costMicroUsd).toBe(expectedCost);
    expect(calls[0]!.stopReason).toBe("tool_use");

    const run = await t.run((ctx) => ctx.db.get("takeoffAgentRuns", started.runId));
    expect(run?.turns).toBe(1);
    expect(run?.inFlightCalls).toBe(0);
    expect(run?.costMicroUsd).toBe(expectedCost);

    // Finish run + report review stats
    await asEstimator.mutation(api.takeoffAgent.finishRun, {
      runId: started.runId,
      status: "completed",
    });
    await asEstimator.mutation(api.takeoffAgent.reportReviewStats, {
      runId: started.runId,
      pending: 0,
      accepted: 18,
      edited: 2,
      rejected: 1,
    });

    const dash = await asAdmin.query(api.takeoffAgent.getDashboard, {
      now: Date.now(),
    });
    expect(dash.totals.runs).toBe(1);
    expect(dash.totals.turns).toBe(1);
    expect(dash.totals.costMicroUsd).toBe(expectedCost);
    expect(dash.totals.acceptedCount).toBe(18);
    expect(dash.totals.editedCount).toBe(2);
    expect(dash.totals.rejectedCount).toBe(1);
    expect(dash.byUser).toHaveLength(1);
    expect(dash.byUser[0]!.userName).toBe("Orçamentista Ana");
    expect(dash.recentRuns[0]!.takeoffName).toBe("Obra Lorena");
  });

  test("proxy streams SSE chunks unchanged to the caller", async () => {
    const { asAdmin, asEstimator } = await seedUsers();
    await asAdmin.mutation(api.takeoffAgent.saveSettings, {
      ...DEFAULT_TAKEOFF_AGENT_SETTINGS,
      enabled: true,
    });
    const started = await asEstimator.mutation(api.takeoffAgent.startRun, {});

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(sseStreamFromChunks(SAMPLE_SSE_CHUNKS), {
        status: 200,
        headers: { "content-type": "text/event-stream; charset=utf-8" },
      })
    );
    // Silence convex-test context warning when ReadableStream pull finalizes after t.fetch returns.
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await asEstimator.fetch("/takeoff/agent/messages", {
      method: "POST",
      headers: {
        Origin: "tauri://localhost",
        "x-takeoff-run-id": started.runId,
      },
      body: JSON.stringify({
        stream: true,
        messages: [{ role: "user", content: "Oi" }],
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("tauri://localhost");
    const streamed = await res.text();
    expect(streamed).toContain("Lendo a planta...");
    expect(streamed).toContain("message_stop");
  });

  test("proxy enforces monthly budget cap and passes through upstream 529 errors", async () => {
    const { t, asAdmin, asEstimator } = await seedUsers();
    await asAdmin.mutation(api.takeoffAgent.saveSettings, {
      ...DEFAULT_TAKEOFF_AGENT_SETTINGS,
      enabled: true,
      // Set budget to US$ 0.50 (50 cents)
      monthlyUserBudgetUsdCents: 50,
    });

    // Upstream 529 passes through and releases inFlightCalls
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }), {
        status: 529,
        headers: { "content-type": "application/json" },
      })
    );
    const overloaded = await asEstimator.fetch("/takeoff/agent/messages", {
      method: "POST",
      body: JSON.stringify({
        stream: true,
        messages: [{ role: "user", content: "Oi" }],
      }),
    });
    expect(overloaded.status).toBe(529);

    // Exhaust user budget directly via a prior run
    const now = Date.now();
    await t.run(async (ctx) => {
      const run = await ctx.db.query("takeoffAgentRuns").first();
      if (run) {
        await ctx.db.patch("takeoffAgentRuns", run._id, {
          costMicroUsd: 600_000, // US$ 0.60 > US$ 0.50 cap
          updatedAt: now,
        });
      }
    });

    const capped = await asEstimator.fetch("/takeoff/agent/messages", {
      method: "POST",
      body: JSON.stringify({
        stream: true,
        messages: [{ role: "user", content: "Oi" }],
      }),
    });
    expect(capped.status).toBe(429);
    const body = (await capped.json()) as { error?: { message?: string } };
    expect(body.error?.message).toContain("orçamento mensal");
  });
});
