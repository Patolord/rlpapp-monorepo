import {
  Client,
  StreamableHTTPClientTransport,
  type FetchLike,
} from "@modelcontextprotocol/client";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { ConvexError } from "convex/values";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { EngineeringAdapter } from "./adapter";
import type { McpPrincipal } from "./auth";
import type { CatalogEntry } from "./catalog";
import type { CallRecord } from "./catalog-tools";
import { AGENT_WRITE_SCOPE, ENGINEERING_READ_SCOPE } from "./constants";
import type { ConvexCaller } from "./convex";
import { createAuthenticatedMcpHandler } from "./server";

const RESOURCE_URL = "https://app.example.com/mcp";

const mockAdapter: EngineeringAdapter = {
  listProjects: async () => [],
  resolveProject: async () => ({ _id: "jd7project" as Id<"projects">, slug: "obra" }),
  getProjectOverview: async () => null,
  getProjectHierarchy: async () => null,
  getEquipment: async () => null,
  getProjectReport: async () => null,
};

const catalog: CatalogEntry[] = [
  {
    path: "customers:list",
    module: "customers",
    name: "list",
    type: "query",
    access: { kind: "permission", permission: "engenharia.read" },
    allowed: true,
    signature: "{ search?: string }",
    argsValidator: {
      type: "object",
      value: { search: { fieldType: { type: "string" }, optional: true } },
    },
  },
  {
    path: "customers:create",
    module: "customers",
    name: "create",
    type: "mutation",
    access: { kind: "permission", permission: "engenharia.write" },
    allowed: true,
    signature: "{ name: string }",
    argsValidator: {
      type: "object",
      value: { name: { fieldType: { type: "string" }, optional: false } },
    },
  },
  {
    path: "employees:list",
    module: "employees",
    name: "list",
    type: "query",
    access: { kind: "permission", permission: "rh.read" },
    allowed: false,
    signature: "{}",
    argsValidator: { type: "object", value: {} },
  },
  {
    path: "dashboard:getDirectorOverview",
    module: "dashboard",
    name: "getDirectorOverview",
    type: "query",
    access: { kind: "permission", permission: "engenharia.read" },
    allowed: true,
    signature: "{ now: number }",
    argsValidator: {
      type: "object",
      value: { now: { fieldType: { type: "number" }, optional: false } },
    },
  },
  {
    path: "towers:list",
    module: "towers",
    name: "list",
    type: "query",
    access: { kind: "permission", permission: "engenharia.read" },
    allowed: true,
    signature: "{ projectId: Id<projects> }",
    argsValidator: {
      type: "object",
      value: {
        projectId: { fieldType: { type: "id", tableName: "projects" }, optional: false },
      },
    },
  },
  {
    path: "agentTokens:create",
    module: "agentTokens",
    name: "create",
    type: "action",
    access: { kind: "public" },
    allowed: true,
    signature: '{ name: string, permission: "full_access" | "read_only" }',
    argsValidator: {
      type: "object",
      value: {
        name: { fieldType: { type: "string" }, optional: false },
        permission: {
          fieldType: {
            type: "union",
            value: [
              { type: "literal", value: "full_access" },
              { type: "literal", value: "read_only" },
            ],
          },
          optional: false,
        },
      },
    },
  },
];

function principalFor(permission: "full_access" | "read_only"): McpPrincipal {
  return {
    userId: "user_eng",
    scopes:
      permission === "full_access"
        ? [ENGINEERING_READ_SCOPE, AGENT_WRITE_SCOPE]
        : [ENGINEERING_READ_SCOPE],
    agentToken: { id: "tok1", name: "Claude", prefix: "rlp_abcdefgh", permission },
    user: {
      id: "usr1",
      clerkId: "user_eng",
      name: "Eng",
      email: "eng@rlp.test",
      username: null,
      role: "engenheiro",
      department: null,
    },
  };
}

function authInfoFor(permission: "full_access" | "read_only") {
  const principal = principalFor(permission);
  return {
    token: "rlp_token",
    clientId: "agent-token",
    scopes:
      permission === "full_access"
        ? [ENGINEERING_READ_SCOPE, AGENT_WRITE_SCOPE]
        : [ENGINEERING_READ_SCOPE],
    extra: {
      userId: principal.userId,
      agentToken: principal.agentToken,
      user: principal.user,
    },
  };
}

function asFetch(handler: (request: Request) => Promise<Response>): FetchLike {
  return async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    return handler(request);
  };
}

async function connect(handler: (request: Request) => Promise<Response>) {
  const client = new Client(
    { name: "rlp-mcp-test", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } }
  );
  const transport = new StreamableHTTPClientTransport(new URL(RESOURCE_URL), {
    fetch: asFetch(handler),
    requestInit: { headers: { Authorization: "Bearer rlp_token" } },
  });
  await client.connect(transport);
  return client;
}

function buildHandler(options: {
  permission: "full_access" | "read_only";
  caller: ConvexCaller;
  records?: CallRecord[];
  allowRawCalls?: boolean;
}) {
  return createAuthenticatedMcpHandler({
    adapterFactory: async () => mockAdapter,
    resourceUrl: RESOURCE_URL,
    verifyToken: async () => authInfoFor(options.permission),
    catalogLoader: async () => catalog,
    callerFactory: () => options.caller,
    allowRawCalls: options.allowRawCalls ?? false,
    recordCall: options.records
      ? async (_principal, record) => {
          options.records!.push(record);
        }
      : null,
    log: () => undefined,
  });
}

describe("ferramentas derivadas do catálogo", () => {
  const clients: Client[] = [];

  afterEach(async () => {
    while (clients.length > 0) {
      const client = clients.pop();
      await client?.close();
    }
  });

  test("token full_access vê ferramentas curadas permitidas, whoami e search_functions", async () => {
    const caller: ConvexCaller = { call: vi.fn(async () => []) };
    const client = await connect(buildHandler({ permission: "full_access", caller }));
    clients.push(client);

    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    // Embutidas continuam lá.
    expect(names).toContain("list_projects");
    expect(names).toContain("get_project_report");
    // Curadas presentes no catálogo e permitidas.
    expect(names).toEqual(
      expect.arrayContaining([
        "list_customers",
        "create_customer",
        "list_towers",
        "get_director_overview",
        "whoami",
        "search_functions",
      ])
    );
    // Não permitida para o usuário, não existe no catálogo, raw desligado.
    expect(names).not.toContain("list_employees");
    expect(names).not.toContain("create_project");
    expect(names).not.toContain("call_function");

    const createCustomer = tools.find((tool) => tool.name === "create_customer");
    expect(createCustomer?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    });
    expect(createCustomer?.inputSchema).toMatchObject({
      type: "object",
      required: ["name"],
    });

    // Argumentos do servidor (`now`) saem do schema exposto.
    const overview = tools.find((tool) => tool.name === "get_director_overview");
    expect(JSON.stringify(overview?.inputSchema)).not.toContain('"now"');

    const whoami = await client.callTool({ name: "whoami", arguments: {} });
    expect(JSON.parse((whoami.content as Array<{ text: string }>)[0]!.text)).toMatchObject({
      auth: "agent_token",
      agent_token: { permission: "full_access" },
      user: { role: "engenheiro" },
    });
  });

  test("chama a função pelo caminho com os argumentos, preenche server args e registra a chamada", async () => {
    const calls: Array<{ kind: string; path: string; args: Record<string, unknown> }> = [];
    const caller: ConvexCaller = {
      call: async (kind, path, args) => {
        calls.push({ kind, path, args });
        if (path === "customers:create") return "jd7customer";
        if (path === "customers:list") throw new ConvexError("Acesso restrito à área de engenharia");
        return { kpis: {} };
      },
    };
    const records: CallRecord[] = [];
    const client = await connect(buildHandler({ permission: "full_access", caller, records }));
    clients.push(client);

    const created = await client.callTool({
      name: "create_customer",
      arguments: { name: "Construtora X" },
    });
    expect(created.isError).toBeFalsy();
    expect((created.content as Array<{ text: string }>)[0]!.text).toBe('"jd7customer"');
    expect(calls[0]).toEqual({
      kind: "mutation",
      path: "customers:create",
      args: { name: "Construtora X" },
    });

    await client.callTool({ name: "get_director_overview", arguments: {} });
    expect(calls[1]!.path).toBe("dashboard:getDirectorOverview");
    expect(calls[1]!.args.now).toBeTypeOf("number");

    const failed = await client.callTool({ name: "list_customers", arguments: {} });
    expect(failed.isError).toBe(true);
    expect((failed.content as Array<{ text: string }>)[0]!.text).toBe(
      "Acesso restrito à área de engenharia"
    );

    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({
      tool: "create_customer",
      functionPath: "customers:create",
      outcome: "success",
    });
    expect(records[2]).toMatchObject({
      tool: "list_customers",
      outcome: "error",
      errorMessage: "Acesso restrito à área de engenharia",
    });
  });

  test("token read_only só recebe queries; call_function respeita permissão e valida argumentos", async () => {
    const caller: ConvexCaller = { call: vi.fn(async () => [{ name: "Torre A" }]) };
    const client = await connect(
      buildHandler({ permission: "read_only", caller, allowRawCalls: true })
    );
    clients.push(client);

    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toContain("list_customers");
    expect(names).toContain("call_function");
    expect(names).not.toContain("create_customer");

    const write = await client.callTool({
      name: "call_function",
      arguments: { path: "customers:create", args: { name: "x" } },
    });
    expect(write.isError).toBe(true);
    expect((write.content as Array<{ text: string }>)[0]!.text).toContain("read-only");

    const forbidden = await client.callTool({
      name: "call_function",
      arguments: { path: "employees:list", args: {} },
    });
    expect(forbidden.isError).toBe(true);
    expect((forbidden.content as Array<{ text: string }>)[0]!.text).toContain("not allowed");

    const badArgs = await client.callTool({
      name: "call_function",
      arguments: { path: "towers/list", args: {} },
    });
    expect(badArgs.isError).toBe(true);
    expect((badArgs.content as Array<{ text: string }>)[0]!.text).toContain("Invalid arguments");

    const ok = await client.callTool({
      name: "call_function",
      arguments: { path: "towers.list", args: { projectId: "jd7project" } },
    });
    expect(ok.isError).toBeFalsy();
    expect(caller.call).toHaveBeenCalledWith("query", "towers:list", { projectId: "jd7project" });

    const search = await client.callTool({
      name: "search_functions",
      arguments: { query: "customers" },
    });
    const parsed = JSON.parse((search.content as Array<{ text: string }>)[0]!.text) as {
      matches: Array<{ function: string; tool?: string; callable: boolean }>;
    };
    expect(parsed.matches.map((m) => m.function)).toEqual(
      expect.arrayContaining(["customers:list", "customers:create"])
    );
    expect(parsed.matches.find((m) => m.function === "customers:list")).toMatchObject({
      tool: "list_customers",
      callable: true,
    });
    expect(parsed.matches.find((m) => m.function === "customers:create")).toMatchObject({
      callable: false,
    });
  });

  test("token full_access não gerencia tokens via call_function", async () => {
    const caller: ConvexCaller = { call: vi.fn(async () => "novo") };
    const client = await connect(
      buildHandler({ permission: "full_access", caller, allowRawCalls: true })
    );
    clients.push(client);

    const result = await client.callTool({
      name: "call_function",
      arguments: { path: "agentTokens:create", args: { name: "x", permission: "full_access" } },
    });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]!.text).toContain(
      "cannot be called with an agent token"
    );
    expect(caller.call).not.toHaveBeenCalled();
  });

  test("conexão OAuth só com escopo de leitura recebe apenas queries", async () => {
    const caller: ConvexCaller = { call: vi.fn(async () => []) };
    const handler = createAuthenticatedMcpHandler({
      adapterFactory: async () => mockAdapter,
      resourceUrl: RESOURCE_URL,
      verifyToken: async () => ({
        token: "oauth-token",
        clientId: "cursor",
        scopes: [ENGINEERING_READ_SCOPE],
        extra: { userId: "user_eng" },
      }),
      catalogLoader: async () => catalog,
      callerFactory: () => caller,
      allowRawCalls: true,
      recordCall: null,
      log: () => undefined,
    });
    const client = await connect(handler);
    clients.push(client);

    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toContain("list_customers");
    expect(names).toContain("list_towers");
    expect(names).not.toContain("create_customer");

    const write = await client.callTool({
      name: "call_function",
      arguments: { path: "customers:create", args: { name: "x" } },
    });
    expect(write.isError).toBe(true);
    expect((write.content as Array<{ text: string }>)[0]!.text).toContain("read-only");

    const whoami = await client.callTool({ name: "whoami", arguments: {} });
    expect(JSON.parse((whoami.content as Array<{ text: string }>)[0]!.text)).toMatchObject({
      auth: "oauth",
      agent_token: null,
    });
  });

  test("sem catálogo o servidor continua servindo as ferramentas embutidas", async () => {
    const handler = createAuthenticatedMcpHandler({
      adapterFactory: async () => mockAdapter,
      resourceUrl: RESOURCE_URL,
      verifyToken: async () => authInfoFor("full_access"),
      catalogLoader: async () => {
        throw new Error("convex down");
      },
      callerFactory: () => ({ call: async () => null }),
      recordCall: null,
      log: () => undefined,
    });
    const client = await connect(handler);
    clients.push(client);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "get_equipment",
      "get_project_hierarchy",
      "get_project_overview",
      "get_project_report",
      "list_projects",
      "resolve_project",
    ]);
  });
});
