import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyMemory } from "../lib/agent/memory";

// the installed app, signed in or not: the memory is the company's, reached through the backend
vi.mock("../lib/platform", async (original) => ({
  ...(await original<typeof import("../lib/platform")>()),
  isTauri: () => true,
}));

const backend = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  fetch: vi.fn(),
  add: vi.fn(),
  approve: vi.fn(),
  remove: vi.fn(),
  saved: [] as unknown[],
}));

vi.mock("../lib/account/convex", async (original) => ({
  ...(await original<typeof import("../lib/account/convex")>()),
  fetchAgentMemoryAsUser: backend.fetch,
  addAgentMemoryAsUser: backend.add,
  approveAgentMemoryAsUser: backend.approve,
  removeAgentMemoryAsUser: backend.remove,
}));

vi.mock("../lib/agent/memoryStore", () => ({
  loadAgentMemory: async () => ({
    version: 1,
    fetchedAt: 1,
    entries: [
      {
        id: "cached",
        kind: "nota",
        scope: "",
        text: "da cópia local",
        status: "ativa",
        origin: "usuario",
        createdAt: 1,
      },
    ],
  }),
  saveAgentMemory: async (memory: unknown) => {
    backend.saved.push(memory);
  },
}));

const { useStore } = await import("./index");
const { selectCanEditAgentMemory, SIGN_IN_FOR_MEMORY } = await import("./agentMemory");

const row = (id: string, text: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "nota",
  scope: "",
  text,
  target: null,
  image: null,
  status: "ativa",
  origin: "usuario",
  source: null,
  createdAt: 2,
  createdBy: "Ana",
  ...extra,
});

function signIn(signedIn: boolean) {
  useStore.setState({
    account: {
      status: signedIn ? "signedIn" : "signedOut",
      user: null,
      offline: false,
      error: null,
    },
  });
}

beforeEach(() => {
  backend.rows = [row("r1", "do servidor")];
  backend.saved.length = 0;
  backend.fetch.mockReset().mockImplementation(async () => backend.rows);
  backend.add.mockReset().mockImplementation(async (args: { text: string; proposed?: boolean }) => {
    const status = args.proposed ? "proposta" : "ativa";
    backend.rows = [
      ...backend.rows,
      row("r2", args.text, { status, origin: args.proposed ? "agente" : "usuario" }),
    ];
    return { id: "r2", status, added: true };
  });
  backend.approve.mockReset().mockResolvedValue(null);
  backend.remove.mockReset().mockImplementation(async (id: string) => {
    backend.rows = backend.rows.filter((r) => r.id !== id);
    return null;
  });
  useStore.setState({
    agentMemory: emptyMemory(),
    agentMemorySync: { source: "cache", loading: false, saving: false, error: null },
  });
  signIn(true);
});

describe("the company's memory in the installed app", () => {
  it("starts from the copy on this machine and replaces it with the company's", async () => {
    await useStore.getState().loadAgentMemoryCache();
    expect(useStore.getState().agentMemory.entries.map((e) => e.id)).toEqual(["cached"]);

    const memory = await useStore.getState().refreshAgentMemory();
    expect(memory.entries).toEqual([
      {
        id: "r1",
        kind: "nota",
        scope: "",
        text: "do servidor",
        status: "ativa",
        origin: "usuario",
        createdAt: 2,
        createdBy: "Ana",
      },
    ]);
    expect(useStore.getState().agentMemorySync).toEqual({
      source: "company",
      loading: false,
      saving: false,
      error: null,
    });
    // kept on disk for the next time without a connection
    expect(backend.saved).toHaveLength(1);
  });

  it("keeps the cached copy when the server does not answer, and says why", async () => {
    await useStore.getState().loadAgentMemoryCache();
    backend.fetch.mockRejectedValue(new Error("rede fora"));
    const memory = await useStore.getState().refreshAgentMemory();
    expect(memory.entries.map((e) => e.id)).toEqual(["cached"]);
    expect(useStore.getState().agentMemorySync).toEqual({
      source: "cache",
      loading: false,
      saving: false,
      error: "rede fora",
    });
  });

  it("stores what a person teaches for everyone, and what the agent proposes as a proposal", async () => {
    const taught = await useStore
      .getState()
      .addAgentMemory({ kind: "nota", text: "dreno fora do escopo" });
    expect(taught).toEqual({ id: "r2", status: "ativa", added: true });
    expect(backend.add).toHaveBeenLastCalledWith({
      kind: "nota",
      text: "dreno fora do escopo",
      proposed: false,
    });
    // the list on screen is the server's again
    expect(useStore.getState().agentMemory.entries.map((e) => e.id)).toEqual(["r1", "r2"]);

    await useStore.getState().addAgentMemory({ kind: "nota", text: "da IA" }, true);
    expect(backend.add).toHaveBeenLastCalledWith({ kind: "nota", text: "da IA", proposed: true });
  });

  it("fetches again after a change, even when a fetch was already on its way", async () => {
    // a refresh started before the change reads the list as it was
    let release: (rows: unknown) => void = () => undefined;
    backend.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const early = useStore.getState().refreshAgentMemory();
    const adding = useStore.getState().addAgentMemory({ kind: "nota", text: "nova" });
    await Promise.resolve();
    release([row("r1", "do servidor")]);
    await Promise.all([early, adding]);
    expect(backend.fetch).toHaveBeenCalledTimes(2);
    expect(useStore.getState().agentMemory.entries.map((e) => e.id)).toEqual(["r1", "r2"]);
  });

  it("stores one change at a time", async () => {
    const first = useStore.getState().addAgentMemory({ kind: "nota", text: "uma" });
    expect(useStore.getState().agentMemorySync.saving).toBe(true);
    await expect(
      useStore.getState().addAgentMemory({ kind: "nota", text: "outra" }),
    ).rejects.toThrow(/Aguarde/);
    await first;
    expect(useStore.getState().agentMemorySync.saving).toBe(false);
    expect(backend.add).toHaveBeenCalledTimes(1);
  });

  it("approves and removes through the backend", async () => {
    await useStore.getState().approveAgentMemory("r1");
    expect(backend.approve).toHaveBeenCalledWith("r1");
    await useStore.getState().removeAgentMemory("r1");
    expect(backend.remove).toHaveBeenCalledWith("r1");
    expect(useStore.getState().agentMemory.entries).toEqual([]);
  });

  it("passes on the reason the backend gave for refusing", async () => {
    backend.add.mockRejectedValue(
      new ConvexError({ code: "MEMORY_FULL", message: "A memória da IA já tem 400 entradas" }),
    );
    await expect(
      useStore.getState().addAgentMemory({ kind: "nota", text: "mais uma" }),
    ).rejects.toThrow("A memória da IA já tem 400 entradas");
  });

  it("checks an entry before sending it", async () => {
    await expect(
      useStore.getState().addAgentMemory({ kind: "termo", text: "VE-01" }),
    ).rejects.toThrow(/item que o termo representa/);
    expect(backend.add).not.toHaveBeenCalled();
  });

  it("reads the cached copy but changes nothing while signed out", async () => {
    signIn(false);
    await useStore.getState().loadAgentMemoryCache();
    expect(selectCanEditAgentMemory(useStore.getState())).toBe(false);
    expect((await useStore.getState().refreshAgentMemory()).entries.map((e) => e.id)).toEqual([
      "cached",
    ]);
    expect(backend.fetch).not.toHaveBeenCalled();
    await expect(
      useStore.getState().addAgentMemory({ kind: "nota", text: "sem conta" }),
    ).rejects.toThrow(SIGN_IN_FOR_MEMORY);
    await expect(useStore.getState().removeAgentMemory("cached")).rejects.toThrow(
      SIGN_IN_FOR_MEMORY,
    );
    expect(backend.add).not.toHaveBeenCalled();
    expect(backend.remove).not.toHaveBeenCalled();
  });
});
