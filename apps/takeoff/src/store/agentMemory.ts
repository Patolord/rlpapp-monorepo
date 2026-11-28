import {
  addAgentMemoryAsUser,
  approveAgentMemoryAsUser,
  fetchAgentMemoryAsUser,
  refusalMessage,
  removeAgentMemoryAsUser,
} from "../lib/account/convex";
import {
  type AgentMemory,
  type AgentMemoryInput,
  addLocalMemory,
  approveLocalMemory,
  emptyMemory,
  type MemoryAdded,
  memoryFromRemote,
  memoryProblem,
  removeLocalMemory,
} from "../lib/agent/memory";
import { loadAgentMemory, saveAgentMemory } from "../lib/agent/memoryStore";
import { cropSymbol } from "../lib/agent/symbolCrop";
import { isTauri } from "../lib/platform";
import { session, useDoc } from "../lib/session";
import type { State } from "./index";
import { errorMessage, type Slice } from "./shared";

export interface AgentMemorySync {
  /**
   * Where the list on screen came from: "company" is the backend, read in this session;
   * "cache" is the last copy this machine received (signed out, or the server did not answer);
   * "local" is browser dev mode, where the memory lives on the machine.
   */
  source: "company" | "cache" | "local";
  loading: boolean;
  /** A change is being stored: the dialog and "Lembrar símbolo" wait for it. */
  saving: boolean;
  /** Why the last refresh failed; the cached copy stays in use. */
  error: string | null;
}

/**
 * The AI agent's memory (lib/agent/memory.ts): the company's, read and taught as the signed-in
 * user and cached on disk for offline use.
 */
export interface AgentMemorySlice {
  agentMemory: AgentMemory;
  agentMemorySync: AgentMemorySync;

  /** At launch: the copy kept on this machine, until the company's arrives. */
  loadAgentMemoryCache(): Promise<void>;
  /**
   * Fetch the company's memory when signed in. Never fails: without an account or a connection
   * the cached copy stays, with the reason in `agentMemorySync`. Resolves to what is in use.
   */
  refreshAgentMemory(): Promise<AgentMemory>;
  /**
   * Store an entry for the whole company; `proposed` marks what the AI agent suggested, which
   * waits for approval. Rejects with a message in Portuguese (not signed in, refused, offline).
   */
  addAgentMemory(input: AgentMemoryInput, proposed?: boolean): Promise<MemoryAdded>;
  approveAgentMemory(id: string): Promise<void>;
  removeAgentMemory(id: string): Promise<void>;
  /** Keep the drawing around a selected count mark as a symbol example of its item. */
  rememberSymbol(measurementId: string): Promise<void>;
}

export const SIGN_IN_FOR_MEMORY =
  "Entre com a conta da empresa (Entrar, no topo) para alterar a memória da IA: ela é compartilhada por todos";

/** Whether the memory can be changed right now: signed in, or browser dev mode. */
export const selectCanEditAgentMemory = (s: State): boolean =>
  !isTauri() || s.account.status === "signedIn";

export const createAgentMemorySlice: Slice<AgentMemorySlice> = (set, get) => {
  let refreshing: Promise<AgentMemory> | null = null;
  let remembering = false;
  /** Writes of the cache file, one after the other: the last memory kept is the last written. */
  let saved: Promise<void> = Promise.resolve();

  /** Keep a memory in use and on disk; a failed write only reports. */
  const keep = (memory: AgentMemory, source: AgentMemorySync["source"]) => {
    set({
      agentMemory: memory,
      agentMemorySync: { ...get().agentMemorySync, source, loading: false, error: null },
    });
    saved = saved
      .then(() => saveAgentMemory(memory))
      .catch((e) =>
        set({ status: `A cópia local da memória da IA não foi salva: ${errorMessage(e)}` }),
      );
  };

  /**
   * One change at a time: a second click while the first is on its way would store the same
   * symbol twice, for the whole company.
   */
  const saving = async <T>(change: () => Promise<T>): Promise<T> => {
    if (get().agentMemorySync.saving) {
      throw new Error("Aguarde: a alteração anterior da memória ainda está sendo gravada");
    }
    set({ agentMemorySync: { ...get().agentMemorySync, saving: true } });
    try {
      return await change();
    } finally {
      set({ agentMemorySync: { ...get().agentMemorySync, saving: false } });
    }
  };

  /** Run a write against the backend as the user, then bring the list up to date. */
  const asCompany = async <T>(call: () => Promise<T>): Promise<T> => {
    if (get().account.status !== "signedIn") throw new Error(SIGN_IN_FOR_MEMORY);
    let result: T;
    try {
      result = await call();
    } catch (e) {
      if (await get().handleSignedOut(e)) throw new Error(SIGN_IN_FOR_MEMORY);
      throw new Error(refusalMessage(e));
    }
    // a fetch already on its way may have read the list before this change: let it finish,
    // then fetch again
    await refreshing?.catch(() => undefined);
    await get().refreshAgentMemory();
    return result;
  };

  return {
    agentMemory: emptyMemory(),
    // settled by loadAgentMemoryCache at launch (the store is also created where there is no window)
    agentMemorySync: { source: "cache", loading: false, saving: false, error: null },

    loadAgentMemoryCache: async () => {
      const cached = await loadAgentMemory();
      if (!isTauri()) {
        set({
          agentMemory: cached,
          agentMemorySync: { source: "local", loading: false, saving: false, error: null },
        });
        return;
      }
      // the company's copy may already have arrived while the file was being read
      if (get().agentMemorySync.source !== "company") set({ agentMemory: cached });
    },

    refreshAgentMemory: () => {
      if (!isTauri() || get().account.status !== "signedIn") {
        return Promise.resolve(get().agentMemory);
      }
      refreshing ??= (async () => {
        set({ agentMemorySync: { ...get().agentMemorySync, loading: true } });
        try {
          keep(memoryFromRemote(await fetchAgentMemoryAsUser()), "company");
        } catch (e) {
          // revoked in the dashboard: signed out now; either way the cached copy stays in use
          const signedOut = await get().handleSignedOut(e);
          set({
            agentMemorySync: {
              ...get().agentMemorySync,
              source: "cache",
              loading: false,
              error: signedOut ? null : refusalMessage(e),
            },
          });
        } finally {
          refreshing = null;
        }
        return get().agentMemory;
      })();
      return refreshing;
    },

    addAgentMemory: async (input, proposed = false) => {
      const problem = memoryProblem(input);
      if (problem) throw new Error(`Memória não gravada: ${problem}`);
      return await saving(async () => {
        if (!isTauri()) {
          const { memory, result } = addLocalMemory(get().agentMemory, input, proposed);
          if (memory !== get().agentMemory) keep(memory, "local");
          return result;
        }
        return await asCompany(() => addAgentMemoryAsUser({ ...input, proposed }));
      });
    },

    approveAgentMemory: (id) =>
      saving(async () => {
        if (!isTauri()) {
          const next = approveLocalMemory(get().agentMemory, id);
          if (next !== get().agentMemory) keep(next, "local");
          return;
        }
        await asCompany(() => approveAgentMemoryAsUser(id));
      }),

    removeAgentMemory: (id) =>
      saving(async () => {
        if (!isTauri()) {
          const next = removeLocalMemory(get().agentMemory, id);
          if (next !== get().agentMemory) keep(next, "local");
          return;
        }
        await asCompany(() => removeAgentMemoryAsUser(id));
      }),

    rememberSymbol: async (measurementId) => {
      // the crop is rendered before the change starts: a second click in between is dropped
      if (remembering || get().agentMemorySync.saving) return;
      remembering = true;
      try {
        await rememberSymbolOf(measurementId);
      } finally {
        remembering = false;
      }
    },
  };

  async function rememberSymbolOf(measurementId: string): Promise<void> {
    const { project } = get();
    const m = project.measurements.find((x) => x.id === measurementId);
    const item = m && project.items.find((i) => i.id === m.itemId);
    const renderer = session.renderer;
    const size = m ? useDoc.getState().sizes[m.page] : undefined;
    if (!m || !item || !renderer || !size || m.drawingId !== project.activeDrawingId) return;
    try {
      const image = await cropSymbol(renderer, m.page, m.points[0], size);
      if (!image) throw new Error("o recorte ficou grande demais para a memória");
      await get().addAgentMemory({
        kind: "simbolo",
        text: item.name,
        target: item.name,
        image,
        scope: project.client,
        source: project.name,
      });
      set({
        status: `Símbolo de ${item.name} guardado na memória da IA${project.client ? ` (${project.client})` : ""}`,
      });
    } catch (e) {
      set({ status: `Símbolo não foi guardado: ${errorMessage(e)}` });
    }
  }
};
