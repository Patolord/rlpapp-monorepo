import {
  connectDevBridge,
  DEFAULT_AGENT_PORT,
  resetAgentToken,
  startAgentServer,
  stopAgentServer,
} from "../lib/agent/bridge";
import { acceptAi, rejectAi } from "../lib/aiReview";
import { isTauri } from "../lib/platform";
import { locationOf } from "../lib/types";
import { errorMessage, readPref, type Slice, writePref } from "./shared";

export interface AgentServerState {
  status: "off" | "starting" | "on" | "error";
  /** MCP endpoint a client connects to, while on. */
  url: string | null;
  /** Bearer token the client sends; null in browser dev mode. */
  token: string | null;
  error: string | null;
}

/**
 * The AI agent: the local MCP server it connects through and the review of what it marked
 * (lib/agent, lib/aiReview). Its memory is in store/agentMemory.ts.
 */
export interface AgentSlice {
  agentServer: AgentServerState;
  /** Loopback port of the MCP server (remembered per machine). */
  agentPort: number;
  /** "Agente de IA" dialog: connection and memory. */
  agentDialogOpen: boolean;

  setAgentDialogOpen(open: boolean): void;
  setAgentPort(port: number): void;
  /** At launch: the cached memory, and the server brought back when it was left on. */
  restoreAgent(): Promise<void>;
  startAgent(): Promise<void>;
  stopAgent(): Promise<void>;
  /** A new token; clients configured with the old one stop working. */
  renewAgentToken(): Promise<void>;

  /** Accept pending AI suggestions: the given ones (with their kit groups), or all of them. */
  acceptAiSuggestions(ids?: string[]): void;
  /** Discard pending AI suggestions: the given ones (with their kit groups), or all of them. */
  rejectAiSuggestions(ids?: string[]): void;
}

const OFF: AgentServerState = { status: "off", url: null, token: null, error: null };

export const createAgentSlice: Slice<AgentSlice> = (set, get) => {
  return {
    agentServer: OFF,
    agentPort: readPref("agentPort", DEFAULT_AGENT_PORT),
    agentDialogOpen: false,

    setAgentDialogOpen: (agentDialogOpen) => set({ agentDialogOpen }),

    setAgentPort: (port) => {
      const agentPort = Math.min(65535, Math.max(1024, Math.round(port) || DEFAULT_AGENT_PORT));
      writePref("agentPort", agentPort);
      set({ agentPort });
    },

    restoreAgent: async () => {
      await get().loadAgentMemoryCache();
      if (!isTauri()) {
        const dev = connectDevBridge();
        if (dev) set({ agentServer: { status: "on", url: dev.url, token: null, error: null } });
        return;
      }
      if (readPref("agentEnabled", false)) await get().startAgent();
    },

    startAgent: async () => {
      if (get().agentServer.status === "starting") return;
      set({ agentServer: { ...OFF, status: "starting" } });
      try {
        const { url, token } = await startAgentServer(get().agentPort);
        writePref("agentEnabled", true);
        set({ agentServer: { status: "on", url, token, error: null } });
      } catch (e) {
        set({ agentServer: { ...OFF, status: "error", error: errorMessage(e) } });
      }
    },

    stopAgent: async () => {
      writePref("agentEnabled", false);
      try {
        await stopAgentServer();
      } finally {
        set({ agentServer: OFF });
      }
    },

    renewAgentToken: async () => {
      try {
        const token = await resetAgentToken();
        const { agentServer } = get();
        // the listener checks the token it was started with: restart it with the new one
        if (agentServer.status === "on") await get().startAgent();
        else set({ agentServer: { ...agentServer, token } });
        set({ status: "Novo token gerado: atualize a configuração do agente" });
      } catch (e) {
        set({ status: `Token não foi trocado: ${errorMessage(e)}` });
      }
    },

    acceptAiSuggestions: (ids) => {
      const before = get().project;
      get().commit((p) => acceptAi(p, ids));
      if (get().project !== before) set({ status: "Sugestões da IA aceitas" });
    },

    rejectAiSuggestions: (ids) => {
      const before = get().project;
      get().commit((p) => rejectAi(p, ids));
      if (get().project === before) return;
      const gone = new Set(
        [...before.measurements, ...before.zones]
          .map((x) => x.id)
          .filter(
            (id) =>
              !get().project.measurements.some((m) => m.id === id) &&
              !get().project.zones.some((z) => z.id === id),
          ),
      );
      // the location filter goes with its location, as when markings are deleted by hand
      const { zoneFilter, project } = get();
      set({
        selection: get().selection.filter((id) => !gone.has(id)),
        zoneFilter: zoneFilter && !locationOf(project, zoneFilter) ? null : zoneFilter,
        status: `${gone.size} ${gone.size === 1 ? "sugestão da IA descartada" : "sugestões da IA descartadas"}`,
      });
    },
  };
};
