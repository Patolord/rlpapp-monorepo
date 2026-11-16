import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { READ_ONLY_AGENT_TOKEN_MESSAGE } from "../convex/lib/agentTokens";
import { resetGraphTokenCache } from "../convex/model/sharepoint/graph";
import { SHAREPOINT_LIBRARIES, resolvePath } from "../convex/model/sharepoint/libraries";
import { setup, withUser } from "./helpers";

/**
 * Arquivos no SharePoint (convex/sharepoint.ts). O Microsoft Graph é
 * simulado: o `fetch` global responde ao token do Entra ID e às rotas do
 * Graph que cada teste declara, e guarda as chamadas feitas.
 */

const GRAPH = "https://graph.microsoft.com/v1.0";
const PROJETOS_ROOT = `${GRAPH}/sites/${SHAREPOINT_LIBRARIES.projetos.siteId}/drive/root`;

type Call = { url: string; method: string; headers: Record<string, string>; body: string | null };
type GraphHandler = (url: string, call: Call) => Response | undefined;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Substitui o fetch: token do Entra sempre ok; o resto vai para `handler` (404 se não tratar). */
function stubGraph(handler: GraphHandler): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    let body: string | null = null;
    if (typeof init?.body === "string") body = init.body;
    else if (init?.body instanceof Uint8Array) body = new TextDecoder().decode(init.body);
    const call: Call = { url, method: init?.method ?? "GET", headers, body };
    calls.push(call);
    if (url.startsWith("https://login.microsoftonline.com/")) {
      return json({ access_token: "graph-token", expires_in: 3600 });
    }
    return handler(url, call) ?? json({ error: { code: "itemNotFound" } }, 404);
  });
  return calls;
}

const graphCalls = (calls: Call[]) => calls.filter((c) => !c.url.startsWith("https://login."));

function agentIdentity(
  clerkId: string,
  tokenId: Id<"agentTokens">,
  permission: "full_access" | "read_only"
) {
  return { subject: clerkId, "agent_token.id": tokenId, "agent_token.permission": permission };
}

beforeEach(() => {
  process.env.MS_GRAPH_TENANT_ID = "tenant-test";
  process.env.MS_GRAPH_CLIENT_ID = "client-test";
  process.env.MS_GRAPH_CLIENT_SECRET = "secret-test";
  resetGraphTokenCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("caminhos e pastas liberadas", () => {
  test("primeira pasta precisa estar liberada; grafia vem da configuração", () => {
    expect(resolvePath("projetos", "projetos orçamento\\Bios//planta.pdf", "read")).toEqual({
      library: "projetos",
      segments: ["Projetos Orçamento", "Bios", "planta.pdf"],
      path: "Projetos Orçamento/Bios/planta.pdf",
    });
    // NFD (acento combinado) vale como NFC.
    expect(resolvePath("projetos", "Projetos Orc\u0327amento/x", "write").path).toBe(
      "Projetos Orçamento/x"
    );
    expect(resolvePath("projetos", "", "read").path).toBe("");

    expect(() => resolvePath("publico", "Beatriz/recibo.pdf", "read")).toThrow(
      "Leitura em Publico só é permitida nas pastas"
    );
    expect(() => resolvePath("projetos", "PROJETOS GERAL/x.pdf", "write")).toThrow(
      "Escrita em Projetos só é permitida nas pastas: Projetos Orçamento"
    );
    expect(() => resolvePath("publico", "Formularios e modelos/x.txt", "write")).toThrow(
      "pastas: nenhuma"
    );
    expect(() => resolvePath("projetos", "Projetos Orçamento/../Beatriz", "read")).toThrow(
      "Caminho não pode ter"
    );
    expect(() => resolvePath("projetos", "Projetos Orçamento/a:b", "read")).toThrow("Nome inválido");
    expect(() => resolvePath("projetos", "", "write")).toThrow("Informe o caminho");
    expect(() => resolvePath("projetos", "Projetos Orçamento", "write")).toThrow(
      "Não é possível substituir a própria pasta liberada"
    );
  });
});

describe("ferramentas de arquivos", () => {
  test("sem arquivos.read não lista nem chama o Graph", async () => {
    const t = setup();
    const calls = stubGraph(() => undefined);
    const asEng = await withUser(t, { clerkId: "eng1", role: "engenheiro" });
    await expect(
      asEng.action(api.sharepoint.listFolderContents, { library: "projetos" })
    ).rejects.toThrow("Seu usuário não tem acesso aos arquivos do SharePoint");
    await expect(asEng.query(api.sharepoint.listLibraries, {})).rejects.toThrow(
      "Seu usuário não tem acesso aos arquivos do SharePoint"
    );
    expect(calls).toEqual([]);
  });

  test("raiz da biblioteca mostra só as pastas liberadas", async () => {
    const t = setup();
    const calls = stubGraph((url) => {
      if (url.startsWith(`${PROJETOS_ROOT}/children?`)) {
        return json({
          value: [
            { id: "1", name: "Projetos Orçamento", folder: { childCount: 34 }, size: 10 },
            { id: "2", name: "Meus documentos Waldemar Rede", folder: { childCount: 32 } },
            { id: "3", name: "PROJETOS GERAL", folder: { childCount: 51 } },
            { id: "4", name: "solto.pdf", file: { mimeType: "application/pdf" } },
          ],
        });
      }
      return undefined;
    });
    const asDirector = await withUser(t, { clerkId: "dir1", role: "director" });

    const root = await asDirector.action(api.sharepoint.listFolderContents, { library: "projetos" });
    expect(root.items.map((item) => item.name)).toEqual(["Projetos Orçamento", "PROJETOS GERAL"]);
    expect(root.items[0]).toMatchObject({
      path: "Projetos Orçamento",
      kind: "folder",
      childCount: 34,
    });
    expect(graphCalls(calls)[0]!.headers.authorization).toBe("Bearer graph-token");

    const libraries = await asDirector.query(api.sharepoint.listLibraries, {});
    expect(libraries.find((l) => l.library === "projetos")?.writeFolders).toEqual([
      "Projetos Orçamento",
    ]);
  });

  test("lista uma subpasta com filtro por nome e cursor da próxima página", async () => {
    const t = setup();
    const calls = stubGraph((url) => {
      if (url.startsWith(`${PROJETOS_ROOT}:/Projetos%20Or%C3%A7amento/Bios:/children?`)) {
        return json({
          value: [
            {
              id: "a",
              name: "Planta Térreo.pdf",
              size: 2048,
              file: { mimeType: "application/pdf" },
              eTag: '"{A},1"',
              lastModifiedDateTime: "2026-11-10T12:00:00Z",
              lastModifiedBy: { user: { displayName: "Ana" } },
            },
            { id: "b", name: "memorial.docx", size: 10, file: {} },
          ],
          "@odata.nextLink": `${PROJETOS_ROOT}:/x:/children?$top=200&$skiptoken=abc123`,
        });
      }
      return undefined;
    });
    const asDirector = await withUser(t, { clerkId: "dir1", role: "director" });

    const page = await asDirector.action(api.sharepoint.listFolderContents, {
      library: "projetos",
      path: "projetos orçamento/Bios",
      nameContains: "planta terreo",
    });
    expect(page.path).toBe("Projetos Orçamento/Bios");
    expect(page.nextCursor).toBe("abc123");
    expect(page.items).toEqual([
      {
        name: "Planta Térreo.pdf",
        path: "Projetos Orçamento/Bios/Planta Térreo.pdf",
        kind: "file",
        size: 2048,
        modifiedAt: Date.parse("2026-11-10T12:00:00Z"),
        modifiedBy: "Ana",
        childCount: null,
        mimeType: "application/pdf",
        webUrl: null,
        eTag: '"{A},1"',
      },
    ]);

    await asDirector.action(api.sharepoint.listFolderContents, {
      library: "projetos",
      path: "Projetos Orçamento/Bios",
      cursor: "abc123",
    });
    expect(graphCalls(calls)[1]!.url).toContain("$skiptoken=abc123");
  });

  test("pasta fora da lista é recusada antes de falar com o Graph", async () => {
    const t = setup();
    const calls = stubGraph(() => undefined);
    const asDirector = await withUser(t, { clerkId: "dir1", role: "director" });
    await expect(
      asDirector.action(api.sharepoint.readFileContents, {
        library: "publico",
        path: "Documentos Reinaldo e Waldemar/rg.pdf",
      })
    ).rejects.toThrow("Leitura em Publico só é permitida nas pastas");
    expect(calls).toEqual([]);
  });

  test("lê texto inline e devolve link para binários", async () => {
    const t = setup();
    const jsonPath = `${PROJETOS_ROOT}:/Projetos%20Or%C3%A7amento/Bios/Bios.takeoff.json:`;
    const pdfPath = `${PROJETOS_ROOT}:/Projetos%20Or%C3%A7amento/Bios/ARQ-101.pdf:`;
    const calls = stubGraph((url) => {
      if (url === jsonPath) {
        return json({
          id: "j",
          name: "Bios.takeoff.json",
          size: 30,
          file: { mimeType: "application/json" },
          eTag: '"{J},3"',
          "@microsoft.graph.downloadUrl": "https://rlpengcombr.sharepoint.com/download?j",
        });
      }
      if (url === "https://rlpengcombr.sharepoint.com/download?j") {
        return new Response('\uFEFF{"version":4,"name":"Bios"}');
      }
      if (url === pdfPath) {
        return json({
          id: "p",
          name: "ARQ-101.pdf",
          size: 5_000_000,
          file: { mimeType: "application/pdf" },
          "@microsoft.graph.downloadUrl": "https://rlpengcombr.sharepoint.com/download?p",
        });
      }
      return undefined;
    });
    const asDirector = await withUser(t, { clerkId: "dir1", role: "director" });

    const text = await asDirector.action(api.sharepoint.readFileContents, {
      library: "projetos",
      path: "Projetos Orçamento/Bios/Bios.takeoff.json",
    });
    expect(text.text).toBe('{"version":4,"name":"Bios"}');
    expect(text.downloadUrl).toBeNull();
    expect(text.item.eTag).toBe('"{J},3"');
    // O link pré-autenticado é baixado sem o token do Graph.
    const download = calls.find((c) => c.url.endsWith("download?j"))!;
    expect(download.headers.authorization).toBeUndefined();

    const pdf = await asDirector.action(api.sharepoint.readFileContents, {
      library: "projetos",
      path: "Projetos Orçamento/Bios/ARQ-101.pdf",
    });
    expect(pdf.text).toBeNull();
    expect(pdf.downloadUrl).toBe("https://rlpengcombr.sharepoint.com/download?p");
    expect(calls.some((c) => c.url.endsWith("download?p"))).toBe(false);
  });

  test("salvar só cria, substitui com eTag e fica na auditoria", async () => {
    const t = setup();
    const target = `${PROJETOS_ROOT}:/Projetos%20Or%C3%A7amento/Bios/Bios.takeoff.json:/content`;
    const calls = stubGraph((url, call) => {
      if (url.startsWith(target) && call.method === "PUT") {
        return json({
          id: "j",
          name: "Bios.takeoff.json",
          size: call.body?.length ?? 0,
          file: { mimeType: "application/json" },
          eTag: '"{J},4"',
        });
      }
      return undefined;
    });
    const asDirector = await withUser(t, { clerkId: "dir1", role: "director" });

    const created = await asDirector.action(api.sharepoint.saveFile, {
      library: "projetos",
      path: "Projetos Orçamento/Bios/Bios.takeoff.json",
      text: '{"version":4}',
      contentType: "application/json",
    });
    expect(created.replaced).toBe(false);
    const put = graphCalls(calls)[0]!;
    expect(put.url).toBe(`${target}?@microsoft.graph.conflictBehavior=fail`);
    expect(put.body).toBe('{"version":4}');
    expect(put.headers["content-type"]).toBe("application/json");
    expect(put.headers["if-match"]).toBeUndefined();

    const replaced = await asDirector.action(api.sharepoint.saveFile, {
      library: "projetos",
      path: "Projetos Orçamento/Bios/Bios.takeoff.json",
      text: '{"version":4,"name":"Bios"}',
      ifMatch: '"{J},3"',
    });
    expect(replaced.replaced).toBe(true);
    const replace = graphCalls(calls)[1]!;
    expect(replace.url).toBe(`${target}?@microsoft.graph.conflictBehavior=replace`);
    expect(replace.headers["if-match"]).toBe('"{J},3"');

    const audit = await t.run(async (ctx) =>
      ctx.db
        .query("auditLogs")
        .filter((q) => q.eq(q.field("tableName"), "sharepoint"))
        .collect()
    );
    expect(audit.map((row) => [row.action, row.recordId])).toEqual([
      ["create", "projetos:Projetos Orçamento/Bios/Bios.takeoff.json"],
      ["update", "projetos:Projetos Orçamento/Bios/Bios.takeoff.json"],
    ]);
  });

  test("conteúdo: exatamente um formato, base64 válido e no máximo 3,5 MB", async () => {
    const t = setup();
    const calls = stubGraph(() => undefined);
    const asDirector = await withUser(t, { clerkId: "dir1", role: "director" });
    const path = "Projetos Orçamento/Bios/x.bin";
    await expect(
      asDirector.action(api.sharepoint.saveFile, { library: "projetos", path })
    ).rejects.toThrow("um dos dois");
    await expect(
      asDirector.action(api.sharepoint.saveFile, { library: "projetos", path, contentBase64: "não!" })
    ).rejects.toThrow("não é base64 válido");
    await expect(
      asDirector.action(api.sharepoint.saveFile, {
        library: "projetos",
        path,
        text: "x".repeat(4 * 1024 * 1024),
      })
    ).rejects.toThrow("acima de 3,5 MB");
    expect(graphCalls(calls)).toEqual([]);
  });

  test("nome já existente e arquivo alterado viram mensagens claras", async () => {
    const t = setup();
    stubGraph((url) => {
      if (url.includes("/Novo.json:/content")) {
        return json({ error: { code: "nameAlreadyExists" } }, 409);
      }
      if (url.includes("/Velho.json:/content")) {
        return json({ error: { code: "resourceModified" } }, 412);
      }
      return undefined;
    });
    const asDirector = await withUser(t, { clerkId: "dir1", role: "director" });
    await expect(
      asDirector.action(api.sharepoint.saveFile, {
        library: "projetos",
        path: "Projetos Orçamento/Bios/Novo.json",
        text: "{}",
      })
    ).rejects.toThrow("Para substituir, leia o arquivo e passe o eTag em ifMatch");
    await expect(
      asDirector.action(api.sharepoint.saveFile, {
        library: "projetos",
        path: "Projetos Orçamento/Bios/Velho.json",
        text: "{}",
        ifMatch: '"{V},1"',
      })
    ).rejects.toThrow("O arquivo mudou no SharePoint desde a leitura");
  });

  test("cria pasta dentro da pasta liberada", async () => {
    const t = setup();
    const calls = stubGraph((url, call) => {
      if (url === `${PROJETOS_ROOT}:/Projetos%20Or%C3%A7amento:/children` && call.method === "POST") {
        return json({ id: "f", name: "Bios - Torre 2", folder: { childCount: 0 } }, 201);
      }
      return undefined;
    });
    const asDirector = await withUser(t, { clerkId: "dir1", role: "director" });
    const result = await asDirector.action(api.sharepoint.createFolderAt, {
      library: "projetos",
      path: "Projetos Orçamento/Bios - Torre 2",
    });
    expect(result.item).toMatchObject({ path: "Projetos Orçamento/Bios - Torre 2", kind: "folder" });
    expect(JSON.parse(graphCalls(calls)[0]!.body!)).toEqual({
      name: "Bios - Torre 2",
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    });
  });

  test("token somente-leitura lê mas não grava; arquivos.read sozinho também não grava", async () => {
    const t = setup();
    const calls = stubGraph((url) => {
      if (url.startsWith(`${PROJETOS_ROOT}/children?`)) return json({ value: [] });
      return undefined;
    });
    const asDirector = await withUser(t, { clerkId: "dir1", role: "director" });
    const readOnly = await asDirector.action(api.agentTokens.create, {
      name: "Grok leitura",
      permission: "read_only",
    });
    const asAgent = t.withIdentity(agentIdentity("dir1", readOnly.id, "read_only"));

    await asAgent.action(api.sharepoint.listFolderContents, { library: "projetos" });
    await expect(
      asAgent.action(api.sharepoint.saveFile, {
        library: "projetos",
        path: "Projetos Orçamento/Bios/x.json",
        text: "{}",
      })
    ).rejects.toThrow(READ_ONLY_AGENT_TOKEN_MESSAGE);
    // Mesmo com a claim dizendo full_access, vale a permissão gravada no banco.
    const asLyingAgent = t.withIdentity(agentIdentity("dir1", readOnly.id, "full_access"));
    await expect(
      asLyingAgent.action(api.sharepoint.createFolderAt, {
        library: "projetos",
        path: "Projetos Orçamento/Nova",
      })
    ).rejects.toThrow(READ_ONLY_AGENT_TOKEN_MESSAGE);

    const asReader = await withUser(t, {
      clerkId: "eng2",
      role: "engenheiro",
      permissionGrants: ["arquivos.read"],
    });
    await asReader.action(api.sharepoint.listFolderContents, { library: "projetos" });
    await expect(
      asReader.action(api.sharepoint.saveFile, {
        library: "projetos",
        path: "Projetos Orçamento/Bios/x.json",
        text: "{}",
      })
    ).rejects.toThrow("Seu usuário não pode salvar arquivos no SharePoint");

    expect(graphCalls(calls).every((c) => c.method === "GET")).toBe(true);
  });

  test("sem as credenciais do app responde que o SharePoint não está configurado", async () => {
    const t = setup();
    const calls = stubGraph(() => undefined);
    delete process.env.MS_GRAPH_CLIENT_SECRET;
    const asDirector = await withUser(t, { clerkId: "dir1", role: "director" });
    await expect(
      asDirector.action(api.sharepoint.listFolderContents, { library: "projetos" })
    ).rejects.toThrow("SharePoint não configurado neste ambiente");
    expect(calls).toEqual([]);
  });
});
