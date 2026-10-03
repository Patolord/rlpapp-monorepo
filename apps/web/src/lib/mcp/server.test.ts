import {
  Client,
  StreamableHTTPClientTransport,
  type FetchLike,
} from "@modelcontextprotocol/client";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { afterEach, describe, expect, test } from "vitest";

import type { EngineeringAdapter } from "./adapter";
import { ENGINEERING_READ_SCOPE } from "./constants";
import {
  createAuthenticatedMcpHandler,
  createEngineeringMcpHandler,
} from "./server";

const RESOURCE_URL = "https://app.example.com/mcp";

const mockAdapter: EngineeringAdapter = {
  listProjects: async () => [
    {
      _id: "jd7project" as Id<"projects">,
      _creationTime: 1,
      name: "Obra Teste",
      slug: "obra-teste",
      legacyNumber: null,
      floors: [],
      client: null,
      customerId: null,
      customerName: null,
      address: null,
      status: "in_progress",
      responsibleId: null,
      responsibleName: null,
      startDate: null,
      endDate: null,
      createdAt: 1,
      archivedAt: null,
      totalItems: 4,
      installedItems: 1,
      unitCount: 2,
      towerCount: 1,
    },
  ],
  resolveProject: async () => ({
    _id: "jd7project" as Id<"projects">,
    slug: "obra-teste",
  }),
  getProjectOverview: async () => null,
  getProjectHierarchy: async () => null,
  getEquipment: async () => ({
    _id: "jd7equip" as Id<"equipment">,
    description: "Evaporadora sala",
    status: "installing",
    createdAt: 1,
    projectEquipmentId: null,
    createdByUserId: null,
    tag: null,
    type: null,
    notes: null,
  }),
  getProjectReport: async () => null,
};

const adapterFactory = async () => mockAdapter;

function asFetch(handler: (request: Request) => Promise<Response>): FetchLike {
  return async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    return handler(request);
  };
}

async function connect(
  handler: (request: Request) => Promise<Response>,
  headers?: Record<string, string>
) {
  const client = new Client(
    { name: "rlp-mcp-test", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } }
  );
  const transport = new StreamableHTTPClientTransport(new URL(RESOURCE_URL), {
    fetch: asFetch(handler),
    requestInit: headers ? { headers } : undefined,
  });
  await client.connect(transport);
  return { client, transport };
}

describe("MCP engineering server", () => {
  const clients: Client[] = [];

  afterEach(async () => {
    while (clients.length > 0) {
      const client = clients.pop();
      await client?.close();
    }
  });

  test("discovers the server and lists read-only tools", async () => {
    const handler = createEngineeringMcpHandler({ adapterFactory });
    const { client } = await connect(handler);
    clients.push(client);

    const discovered = await client.discover();
    expect(discovered).toBeDefined();
    expect(client.getProtocolEra()).toBe("modern");
    expect(client.getServerVersion()?.name).toBe("rlp-engineering");

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

  test("calls list_projects when the OAuth token has the engineering scope", async () => {
    const handler = createAuthenticatedMcpHandler({
      adapterFactory,
      resourceUrl: RESOURCE_URL,
      verifyToken: async () => ({
        token: "oauth-token",
        clientId: "cursor",
        scopes: [ENGINEERING_READ_SCOPE],
        extra: { userId: "user_engineer" },
      }),
    });
    const { client } = await connect(handler, {
      Authorization: "Bearer oauth-token",
    });
    clients.push(client);

    const result = await client.callTool({ name: "list_projects", arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      projects: [{ slug: "obra-teste", totalItems: 4 }],
    });
  });

  test("rejects requests without a bearer token", async () => {
    const handler = createAuthenticatedMcpHandler({
      adapterFactory,
      resourceUrl: RESOURCE_URL,
      verifyToken: async () => undefined,
    });

    const response = await handler(
      new Request(RESOURCE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("Bearer");
    expect(response.headers.get("WWW-Authenticate")).toContain(
      "resource_metadata"
    );
  });

  test("rejects tokens missing the engineering scope", async () => {
    const handler = createAuthenticatedMcpHandler({
      adapterFactory,
      resourceUrl: RESOURCE_URL,
      verifyToken: async () => ({
        token: "oauth-token",
        clientId: "cursor",
        scopes: ["openid", "profile"],
        extra: { userId: "user_engineer" },
      }),
    });

    const response = await handler(
      new Request(RESOURCE_URL, {
        method: "POST",
        headers: {
          Authorization: "Bearer oauth-token",
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    );

    expect(response.status).toBe(403);
  });
});
