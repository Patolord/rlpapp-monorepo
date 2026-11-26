import { describe, expect, it } from "vitest";
import { handleMcpPost, type McpServer, PROTOCOL_VERSIONS } from "./protocol";
import { fakeApp } from "./testContext";
import { type AgentTool, json, ToolError } from "./toolTypes";

const echo: AgentTool = {
  name: "echo",
  title: "Eco",
  description: "Returns its arguments.",
  inputSchema: { type: "object", properties: { text: { type: "string" } } },
  readOnly: true,
  run: async (args) => json(args),
};

const refuse: AgentTool = {
  ...echo,
  name: "refuse",
  readOnly: false,
  run: async () => {
    throw new ToolError("the room does not close");
  },
};

const crash: AgentTool = {
  ...echo,
  name: "crash",
  run: async () => {
    throw new Error("boom");
  },
};

const server = (): McpServer => ({
  name: "rlp-takeoff",
  title: "RLP Takeoff",
  version: "1.2.3",
  instructions: "be careful",
  tools: [echo, refuse, crash],
  context: fakeApp().ctx,
});

const post = async (message: unknown) => {
  const reply = await handleMcpPost(server(), JSON.stringify(message));
  return { status: reply.status, body: reply.body ? JSON.parse(reply.body) : null };
};

describe("handleMcpPost", () => {
  it("answers initialize with the requested protocol version, the tools capability and the method", async () => {
    const { status, body } = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "x" } },
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "rlp-takeoff", version: "1.2.3" },
        instructions: "be careful",
      },
    });
  });

  it("offers its newest version to a client asking for one it does not speak", async () => {
    const { body } = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2099-01-01" },
    });
    expect(body.result.protocolVersion).toBe(PROTOCOL_VERSIONS[0]);
  });

  it("accepts notifications with 202 and no body", async () => {
    expect(await post({ jsonrpc: "2.0", method: "notifications/initialized" })).toEqual({
      status: 202,
      body: null,
    });
  });

  it("lists the tools with their schemas and read-only hints", async () => {
    const { body } = await post({ jsonrpc: "2.0", id: "a", method: "tools/list" });
    expect(body.id).toBe("a");
    expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual([
      "echo",
      "refuse",
      "crash",
    ]);
    expect(body.result.tools[0]).toMatchObject({
      title: "Eco",
      inputSchema: { type: "object" },
      annotations: { readOnlyHint: true },
    });
    expect(body.result.tools[1].annotations.readOnlyHint).toBe(false);
  });

  it("runs a tool and returns its content", async () => {
    const { body } = await post({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "echo", arguments: { text: "olá" } },
    });
    expect(body.result).toEqual({ content: [{ type: "text", text: '{"text":"olá"}' }] });
  });

  it("returns a tool's own failure as a result the model can read, not a protocol error", async () => {
    for (const [name, message] of [
      ["refuse", "the room does not close"],
      ["crash", "boom"],
    ]) {
      const { status, body } = await post({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name, arguments: {} },
      });
      expect(status).toBe(200);
      expect(body.error).toBeUndefined();
      expect(body.result).toEqual({ content: [{ type: "text", text: message }], isError: true });
    }
  });

  it("rejects unknown tools and unknown methods with JSON-RPC errors", async () => {
    const unknownTool = await post({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "nope" },
    });
    expect(unknownTool.body.error.code).toBe(-32602);
    const unknownMethod = await post({ jsonrpc: "2.0", id: 5, method: "sampling/createMessage" });
    expect(unknownMethod.body.error.code).toBe(-32601);
  });

  it("answers ping and the empty lists some clients ask for", async () => {
    expect((await post({ jsonrpc: "2.0", id: 6, method: "ping" })).body.result).toEqual({});
    expect((await post({ jsonrpc: "2.0", id: 7, method: "prompts/list" })).body.result).toEqual({
      prompts: [],
    });
    expect((await post({ jsonrpc: "2.0", id: 8, method: "resources/list" })).body.result).toEqual({
      resources: [],
    });
  });

  it("reports unparseable and malformed messages", async () => {
    const parse = await handleMcpPost(server(), "{not json");
    expect(parse.status).toBe(400);
    expect(JSON.parse(parse.body).error.code).toBe(-32700);
    expect((await post({ id: 9, method: "ping" })).body.error.code).toBe(-32600);
    expect((await post("hello")).body.error.code).toBe(-32600);
  });

  it("answers a batch from an older client, skipping its notifications", async () => {
    const { status, body } = await post([
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "echo", arguments: {} } },
    ]);
    expect(status).toBe(200);
    expect(body.map((r: { id: number }) => r.id)).toEqual([1, 2]);
    expect((await post([{ jsonrpc: "2.0", method: "notifications/initialized" }])).status).toBe(
      202,
    );
  });
});
