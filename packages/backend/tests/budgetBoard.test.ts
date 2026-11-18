import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { resetGraphTokenCache } from "../convex/model/sharepoint/graph";
import { SHAREPOINT_LIBRARIES } from "../convex/model/sharepoint/libraries";
import { isInsideTrello } from "../convex/model/sharepoint/trello";
import { setup, withUser } from "./helpers";

/**
 * Quadro de orçamentos (convex/budgetBoard.ts): o quadro é a fonte da verdade
 * e as pastas da TRELLO no SharePoint só são conferidas e movidas a pedido.
 * O Microsoft Graph é simulado como em sharepoint.test.ts.
 */

const DRIVE = `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_LIBRARIES.projetos.siteId}/drive`;
const TRELLO = `${DRIVE}/root:/z/Or%C3%A7amentos/TRELLO`;
const PARENT_PATH = "/drives/b!x/root:/z/Orçamentos/TRELLO";

type Call = { url: string; method: string; body: string | null };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubGraph(handler: (url: string, call: Call) => Response | undefined): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const call: Call = {
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : null,
    };
    if (url.startsWith("https://login.microsoftonline.com/")) {
      return json({ access_token: "graph-token", expires_in: 3600 });
    }
    calls.push(call);
    return handler(url, call) ?? json({ error: { code: "itemNotFound" } }, 404);
  });
  return calls;
}

const folder = (id: string, name: string, parent = PARENT_PATH) => ({
  id,
  name,
  webUrl: `https://sp/${id}`,
  folder: { childCount: 1 },
  parentReference: { id: `parent-of-${id}`, path: parent },
});

/**
 * TRELLO com: Para Fazer/2026 (pf1, pf2), Para Fazer/Ultrapassados (old1),
 * Em Andamento (ea1, ea2), Concluído (c1), Obsoletos (vazia) e Pasta Padrão.
 */
function trelloRoutes(url: string): Response | undefined {
  if (url.startsWith(`${TRELLO}:?`)) return json(folder("trello", "TRELLO"));
  if (url.startsWith(`${TRELLO}:/children?`)) {
    return json({
      value: [
        folder("st-pf", "Para Fazer"),
        folder("st-ea", "Em Andamento"),
        folder("st-c", "Concluído"),
        folder("st-o", "Obsoletos (Mais de 60 dias após recebimento)"),
        folder("st-pp", "Pasta Padrão"),
        { id: "rar", name: "Concluído.rar", file: {} },
      ],
    });
  }
  const children: Record<string, unknown[]> = {
    "st-pf": [folder("g-2026", "2026"), folder("g-old", "Ultrapassados")],
    "g-2026": [folder("pf1", "Rocontec - Bailarinas"), folder("pf2", "MTC - Obra Vila das Belezas")],
    "g-old": [folder("old1", "AAM - Obra IBI")],
    "st-ea": [
      folder("ea1", "26.37108PRC - Tegra Incorporadora - Obra ARVO"),
      folder("ea2", "Observatório"),
      { id: "lnk", name: "TRELLO - Atalho.lnk", file: {} },
    ],
    "st-c": [folder("c1", "24.32584PRC - Lucio - Obra Cunha Gago")],
    "st-o": [],
  };
  const match = /\/drive\/items\/([^/?]+)\/children\?/.exec(url);
  if (match && children[match[1]!]) return json({ value: children[match[1]!] });
  return undefined;
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

async function engineer(t: ReturnType<typeof setup>, clerkId = "eng1", name = "Fernanda") {
  return await withUser(t, { clerkId, name, role: "engenheiro" });
}

describe("cards do quadro", () => {
  test("cria, edita, move e lista na ordem da coluna", async () => {
    const t = setup();
    const asEng = await engineer(t);
    const [fernanda] = await asEng.query(api.budgetBoard.listAssignees, {});
    expect(fernanda!.name).toBe("Fernanda");

    const a = await asEng.mutation(api.budgetBoard.create, {
      title: "Obra ARVO",
      client: "Tegra",
      stage: "para_fazer",
      assigneeIds: [fernanda!._id],
      dueDate: "2026-12-01",
    });
    const b = await asEng.mutation(api.budgetBoard.create, { title: "Obra N7", stage: "para_fazer" });
    // Card novo entra no topo.
    let board = await asEng.query(api.budgetBoard.list, {});
    expect(board.cards.map((c) => c.title)).toEqual(["Obra N7", "Obra ARVO"]);
    expect(board.cards[1]).toMatchObject({
      client: "Tegra",
      dueDate: "2026-12-01",
      assignees: [{ name: "Fernanda" }],
      folder: null,
    });

    await asEng.mutation(api.budgetBoard.update, {
      cardId: a,
      title: "Obra ARVO",
      notes: "Cliente pediu revisão",
      dueDate: null,
    });
    await asEng.mutation(api.budgetBoard.move, { cardId: a, stage: "em_andamento", index: 0 });
    await asEng.mutation(api.budgetBoard.move, { cardId: b, stage: "em_andamento", index: 1 });
    board = await asEng.query(api.budgetBoard.list, {});
    expect(board.cards.map((c) => [c.title, c.stage])).toEqual([
      ["Obra ARVO", "em_andamento"],
      ["Obra N7", "em_andamento"],
    ]);
    expect(board.cards[0]).toMatchObject({ notes: "Cliente pediu revisão", dueDate: null });

    // Reordenar dentro da coluna: N7 vai para o topo.
    await asEng.mutation(api.budgetBoard.move, { cardId: b, stage: "em_andamento", index: 0 });
    board = await asEng.query(api.budgetBoard.list, {});
    expect(board.cards.map((c) => c.title)).toEqual(["Obra N7", "Obra ARVO"]);

    await asEng.mutation(api.budgetBoard.remove, { cardId: b });
    board = await asEng.query(api.budgetBoard.list, {});
    expect(board.cards.map((c) => c.title)).toEqual(["Obra ARVO"]);

    const audit = await t.run(async (ctx) =>
      ctx.db.query("auditLogs").collect()
    );
    expect(audit.some((entry) => entry.details === "Card movido de Para Fazer para Em Andamento")).toBe(true);
  });

  test("valida título, prazo e responsáveis", async () => {
    const t = setup();
    const asEng = await engineer(t);
    await expect(
      asEng.mutation(api.budgetBoard.create, { title: "  ", stage: "para_fazer" })
    ).rejects.toThrow("Informe o título");
    await expect(
      asEng.mutation(api.budgetBoard.create, { title: "X", stage: "para_fazer", dueDate: "01/12/2026" })
    ).rejects.toThrow("Prazo inválido");
    const ghost = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        name: "Inativo",
        clerkId: "gone",
        roles: ["engenheiro"],
        isActive: false,
        createdAt: Date.now(),
      })
    );
    await expect(
      asEng.mutation(api.budgetBoard.create, {
        title: "X",
        stage: "para_fazer",
        assigneeIds: [ghost as Id<"users">],
      })
    ).rejects.toThrow("Responsável inexistente ou inativo");
  });

  test("orçamentista com só o acesso App Takeoff vê e edita o quadro, sem ver obras", async () => {
    const t = setup();
    const asTakeoff = await withUser(t, { clerkId: "orc1", name: "Orçamentista", roles: ["takeoff"] });
    const cardId = await asTakeoff.mutation(api.budgetBoard.create, { title: "Obra N7", stage: "para_fazer" });
    await asTakeoff.mutation(api.budgetBoard.move, { cardId, stage: "em_andamento", index: 0 });
    const board = await asTakeoff.query(api.budgetBoard.list, {});
    expect(board.cards.map((c) => [c.title, c.stage])).toEqual([["Obra N7", "em_andamento"]]);
    const assignees = await asTakeoff.query(api.budgetBoard.listAssignees, {});
    expect(assignees.map((user) => user.name)).toContain("Orçamentista");
    await expect(asTakeoff.query(api.projects.list, {})).rejects.toThrow();
  });

  test("sem o quadro no acesso não lê nem escreve", async () => {
    const t = setup();
    const asOther = await withUser(t, {
      clerkId: "x1",
      roles: ["compras"],
      permissionGrants: ["arquivos.read"],
    });
    await expect(asOther.query(api.budgetBoard.list, {})).rejects.toThrow(
      "Seu usuário não tem acesso ao quadro de orçamentos"
    );
    await expect(
      asOther.mutation(api.budgetBoard.create, { title: "X", stage: "para_fazer" })
    ).rejects.toThrow("Seu usuário não pode editar o quadro de orçamentos");
    const asReader = await withUser(t, {
      clerkId: "x2",
      roles: ["engenheiro"],
      permissionDenials: ["orcamentos.quadro.write"],
    });
    await asReader.query(api.budgetBoard.list, {});
    await expect(
      asReader.action(api.budgetBoard.moveFolder, {
        cardId: (await engineer(t, "eng9").then((asEng) =>
          asEng.mutation(api.budgetBoard.create, { title: "X", stage: "para_fazer" })
        )) as Id<"budgetCards">,
      })
    ).rejects.toThrow("Seu usuário não pode editar o quadro de orçamentos");
  });
});

describe("conferência com as pastas da TRELLO", () => {
  test("importa pastas ativas, marca a pasta fora da etapa e lista as sem card", async () => {
    const t = setup();
    stubGraph(trelloRoutes);
    const asEng = await engineer(t);

    let check = await asEng.action(api.budgetBoard.checkFolders, {});
    expect(check.stages.map((s) => [s.stage, s.name, s.folderCount])).toEqual([
      ["para_fazer", "Para Fazer", 2],
      ["em_andamento", "Em Andamento", 2],
      ["concluido", "Concluído", 1],
      ["obsoleto", "Obsoletos (Mais de 60 dias após recebimento)", 0],
    ]);
    // Só Para Fazer (fora os Ultrapassados) e Em Andamento viram pendência.
    expect(check.orphans.map((o) => o.itemId).sort()).toEqual(["ea1", "ea2", "pf1", "pf2"]);

    const created = await asEng.action(api.budgetBoard.importFolders, {
      itemIds: ["ea1", "pf1", "c1", "old1"],
    });
    // c1 (Concluído) e old1 (Ultrapassados) não são ativas: ficam de fora.
    expect(created).toBe(2);
    let board = await asEng.query(api.budgetBoard.list, {});
    const arvo = board.cards.find((c) => c.folder?.itemId === "ea1")!;
    expect(arvo).toMatchObject({
      stage: "em_andamento",
      prcNumber: "26.37108PRC",
      client: "Tegra Incorporadora",
      title: "Obra ARVO",
      folder: { name: "26.37108PRC - Tegra Incorporadora - Obra ARVO", stage: "em_andamento" },
    });
    expect(board.cards.find((c) => c.folder?.itemId === "pf1")).toMatchObject({
      stage: "para_fazer",
      client: "Rocontec",
      title: "Bailarinas",
    });
    // Importar de novo não duplica.
    expect(await asEng.action(api.budgetBoard.importFolders, { itemIds: ["ea1"] })).toBe(0);

    // O card vai para Concluído no quadro; a pasta continua em Em Andamento.
    await asEng.mutation(api.budgetBoard.move, { cardId: arvo._id, stage: "concluido", index: 0 });
    check = await asEng.action(api.budgetBoard.checkFolders, {});
    board = await asEng.query(api.budgetBoard.list, {});
    expect(board.cards.find((c) => c._id === arvo._id)).toMatchObject({
      stage: "concluido",
      folder: { stage: "em_andamento" },
    });
    expect(check.orphans.map((o) => o.itemId).sort()).toEqual(["ea2", "pf2"]);
    expect(check.missing).toBe(0);
  });

  test("liga um card a uma pasta sem card e recusa pasta já ligada", async () => {
    const t = setup();
    stubGraph(trelloRoutes);
    const asEng = await engineer(t);
    const a = await asEng.mutation(api.budgetBoard.create, { title: "Observatório", stage: "em_andamento" });
    const b = await asEng.mutation(api.budgetBoard.create, { title: "Outro", stage: "em_andamento" });
    await asEng.action(api.budgetBoard.linkFolder, { cardId: a, itemId: "ea2" });
    const board = await asEng.query(api.budgetBoard.list, {});
    expect(board.cards.find((c) => c._id === a)!.folder).toMatchObject({
      itemId: "ea2",
      stage: "em_andamento",
      webUrl: "https://sp/ea2",
    });
    await expect(asEng.action(api.budgetBoard.linkFolder, { cardId: b, itemId: "ea2" })).rejects.toThrow(
      "já está ligada ao card"
    );
    await expect(asEng.action(api.budgetBoard.linkFolder, { cardId: b, itemId: "nope" })).rejects.toThrow(
      "Pasta não encontrada na TRELLO"
    );
  });

  test("pasta apagada fica marcada como não encontrada", async () => {
    const t = setup();
    stubGraph(trelloRoutes);
    const asEng = await engineer(t);
    const cardId = await asEng.mutation(api.budgetBoard.create, { title: "Sumida", stage: "para_fazer" });
    await t.run(async (ctx) => ctx.db.patch("budgetCards", cardId, { folderItemId: "deleted" }));
    const check = await asEng.action(api.budgetBoard.checkFolders, {});
    expect(check.missing).toBe(1);
    const board = await asEng.query(api.budgetBoard.list, {});
    expect(board.cards[0]!.folder).toMatchObject({ itemId: "deleted", stage: "missing" });
  });
});

describe("mover a pasta para a etapa do card", () => {
  test("move pelo id, para a pasta da etapa, e registra", async () => {
    const t = setup();
    const calls = stubGraph((url, call) => {
      if (url.startsWith(`${DRIVE}/items/ea1?`) && call.method === "GET") {
        return json(folder("ea1", "26.37108PRC - Tegra - Obra ARVO", `${PARENT_PATH}/Em Andamento`));
      }
      if (url.startsWith(`${DRIVE}/items/ea1?`) && call.method === "PATCH") {
        return json(folder("ea1", "26.37108PRC - Tegra - Obra ARVO", `${PARENT_PATH}/Concluído`));
      }
      return trelloRoutes(url);
    });
    const asEng = await engineer(t);
    const cardId = await asEng.mutation(api.budgetBoard.create, { title: "Obra ARVO", stage: "concluido" });
    await t.run(async (ctx) =>
      ctx.db.patch("budgetCards", cardId, { folderItemId: "ea1", folderStage: "em_andamento" })
    );

    await asEng.action(api.budgetBoard.moveFolder, { cardId });
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toContain("conflictBehavior=fail");
    expect(JSON.parse(patch.body!)).toEqual({ parentReference: { id: "st-c" } });
    const board = await asEng.query(api.budgetBoard.list, {});
    expect(board.cards[0]!.folder).toMatchObject({ stage: "concluido" });
    const audit = await t.run(async (ctx) => ctx.db.query("auditLogs").collect());
    expect(audit.some((e) => e.details?.includes("movida no SharePoint de Em Andamento para Concluído"))).toBe(
      true
    );
  });

  test("não move pasta que está fora da TRELLO", async () => {
    const t = setup();
    const calls = stubGraph((url) => {
      if (url.startsWith(`${DRIVE}/items/rh1?`)) return json(folder("rh1", "Folha", "/drives/b!x/root:/RH"));
      return trelloRoutes(url);
    });
    const asEng = await engineer(t);
    const cardId = await asEng.mutation(api.budgetBoard.create, { title: "X", stage: "concluido" });
    await t.run(async (ctx) => ctx.db.patch("budgetCards", cardId, { folderItemId: "rh1" }));
    await expect(asEng.action(api.budgetBoard.moveFolder, { cardId })).rejects.toThrow(
      "Só é possível mover pastas de orçamento que estão na TRELLO"
    );
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  test("isInsideTrello reconhece o caminho com e sem codificação", () => {
    // Formato que o Graph devolve hoje para o site Projetos.
    expect(isInsideTrello("/drive/root:/z/Orçamentos/TRELLO/Em Andamento")).toBe(true);
    expect(isInsideTrello("/drives/b!x/root:/z/Orçamentos/TRELLO/Em Andamento")).toBe(true);
    expect(isInsideTrello("/drives/b!x/root:/z/Or%C3%A7amentos/TRELLO")).toBe(true);
    expect(isInsideTrello("/drive/root:/z/Orçamentos")).toBe(false);
    expect(isInsideTrello("/drives/b!x/root:/z/Orçamentos/TRELLO2")).toBe(false);
    expect(isInsideTrello(undefined)).toBe(false);
  });
});
