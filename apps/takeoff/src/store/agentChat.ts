import {
  type AgentStatus,
  fetchAgentStatusAsUser,
  finishAgentRunAsUser,
  refusalMessage,
  reportAgentReviewStatsAsUser,
  startAgentRunAsUser,
} from "../lib/account/convex";
import { appContext } from "../lib/agent/appContext";
import { runTakeoffAgentTurn } from "../lib/agent/llm/run";
import {
  type AgentTranscript,
  emptyTranscript,
  loadAgentTranscript,
  saveAgentTranscript,
  type TranscriptMessage,
  type TranscriptToolItem,
} from "../lib/agent/llm/transcript";
import { aiStats } from "../lib/aiReview";
import type { Slice } from "./shared";

export interface AgentChatSlice {
  agentPanelOpen: boolean;
  agentStatus: AgentStatus | null;
  agentStatusLoading: boolean;
  agentStatusError: string | null;
  agentTranscript: AgentTranscript;
  agentRunning: boolean;
  agentCurrentRunId: string | null;
  agentError: string | null;

  setAgentPanelOpen(open: boolean): void;
  refreshAgentStatus(): Promise<void>;
  loadAgentTranscriptForProject(projectId: string): Promise<void>;
  sendAgentMessage(prompt: string): Promise<void>;
  stopAgentRun(): void;
  clearAgentConversation(): Promise<void>;
  syncAgentReviewStats(): void;
}

let activeAbortController: AbortController | null = null;
let msgSeq = 0;
const nextId = (prefix: string) => `${prefix}_${Date.now()}_${++msgSeq}`;

export function transcriptKeyOf(projectId: string | undefined): string {
  return projectId?.trim() || "unsaved";
}

function friendlyAgentError(err: unknown): string {
  const msg = refusalMessage(err);
  if (/Limite mensal da empresa/i.test(msg)) return msg;
  if (/Seu limite mensal/i.test(msg)) return msg;
  if (/desativado pela empresa/i.test(msg)) return msg;
  if (/401|UNAUTHENTICATED|Sessão inválida/i.test(msg)) {
    return "Sua sessão expirou. Clique em Entrar no topo e tente novamente.";
  }
  if (/403|FORBIDDEN|Permissão/i.test(msg)) {
    return "Sua conta não tem permissão para usar o agente de IA.";
  }
  if (/429/i.test(msg)) {
    return "Muitas chamadas simultâneas ou limite atingido. Aguarde um instante e tente novamente.";
  }
  return msg || "Ocorreu um erro ao conversar com o agente de IA.";
}

export const createAgentChatSlice: Slice<AgentChatSlice> = (set, get) => {
  const updateAssistantMessage = (
    assistantId: string,
    updater: (msg: TranscriptMessage) => TranscriptMessage,
  ) => {
    set((s) => ({
      agentTranscript: {
        ...s.agentTranscript,
        messages: s.agentTranscript.messages.map((m) => (m.id === assistantId ? updater(m) : m)),
        updatedAt: Date.now(),
      },
    }));
  };

  return {
    agentPanelOpen: false,
    agentStatus: null,
    agentStatusLoading: false,
    agentStatusError: null,
    agentTranscript: emptyTranscript("default"),
    agentRunning: false,
    agentCurrentRunId: null,
    agentError: null,

    setAgentPanelOpen: (agentPanelOpen) => {
      set({ agentPanelOpen });
      if (agentPanelOpen) {
        const { account, project, agentTranscript } = get();
        const key = transcriptKeyOf(project.id);
        if (agentTranscript.projectId !== key) {
          void get().loadAgentTranscriptForProject(key);
        }
        if (account.status === "signedIn" && !account.offline) {
          void get().refreshAgentStatus();
        }
      }
    },

    refreshAgentStatus: async () => {
      const { account } = get();
      if (account.status !== "signedIn" || account.offline) {
        set({ agentStatus: null, agentStatusLoading: false, agentStatusError: null });
        return;
      }
      set({ agentStatusLoading: true, agentStatusError: null });
      try {
        const agentStatus = await fetchAgentStatusAsUser();
        set({ agentStatus, agentStatusLoading: false, agentStatusError: null });
      } catch (e) {
        if (await get().handleSignedOut(e)) {
          set({ agentStatus: null, agentStatusLoading: false, agentStatusError: null });
          return;
        }
        set({ agentStatusLoading: false, agentStatusError: refusalMessage(e) });
      }
    },

    loadAgentTranscriptForProject: async (projectId) => {
      const key = transcriptKeyOf(projectId);
      const loaded = await loadAgentTranscript(key);
      // Only apply if the user is still on the same project.
      if (transcriptKeyOf(get().project.id) === key) {
        set({ agentTranscript: loaded, agentError: null });
      }
    },

    sendAgentMessage: async (rawPrompt) => {
      const prompt = rawPrompt.trim();
      if (!prompt || get().agentRunning) return;

      const { account, project } = get();
      if (account.status !== "signedIn") {
        set({ agentError: "Entre com a sua conta da empresa para usar o agente de IA." });
        return;
      }
      if (account.offline) {
        set({ agentError: "Sem conexão com a internet para conversar com o agente de IA." });
        return;
      }

      const projectKey = transcriptKeyOf(project.id);
      // Ensure transcript belongs to current takeoff before appending.
      if (get().agentTranscript.projectId !== projectKey) {
        await get().loadAgentTranscriptForProject(projectKey);
      }

      set({ agentRunning: true, agentError: null });

      let runMeta: Awaited<ReturnType<typeof startAgentRunAsUser>>;
      try {
        runMeta = await startAgentRunAsUser({
          takeoffName: project.name,
          takeoffExternalId: project.id,
          promptPreview: prompt.slice(0, 200),
        });
      } catch (e) {
        if (await get().handleSignedOut(e)) {
          set({ agentRunning: false, agentStatus: null });
          return;
        }
        set({ agentRunning: false, agentError: friendlyAgentError(e) });
        void get().refreshAgentStatus();
        return;
      }

      const historyBefore = get().agentTranscript.messages;
      const userMessage: TranscriptMessage = {
        id: nextId("u"),
        role: "user",
        text: prompt,
        createdAt: Date.now(),
      };
      const assistantId = nextId("a");
      const assistantMessage: TranscriptMessage = {
        id: assistantId,
        role: "assistant",
        text: "",
        tools: [],
        createdAt: Date.now(),
      };

      set((s) => ({
        agentCurrentRunId: runMeta.runId,
        agentTranscript: {
          ...s.agentTranscript,
          projectId: projectKey,
          lastRunId: runMeta.runId,
          messages: [...s.agentTranscript.messages, userMessage, assistantMessage],
          updatedAt: Date.now(),
        },
      }));

      const abortController = new AbortController();
      activeAbortController = abortController;

      let finalStatus: "completed" | "aborted" | "error" = "completed";
      let errorMessage: string | undefined;

      try {
        const result = await runTakeoffAgentTurn({
          history: historyBefore,
          prompt,
          ctx: appContext,
          modelId: runMeta.model,
          maxTurns: runMeta.maxTurnsPerRun,
          maxTokensPerTurn: runMeta.maxTokensPerTurn,
          instructionsExtra: runMeta.instructionsExtra,
          runId: runMeta.runId,
          abortSignal: abortController.signal,
          onTextDelta: (delta) => {
            updateAssistantMessage(assistantId, (m) => ({
              ...m,
              text: m.text + delta,
            }));
          },
          onToolStart: ({ toolName, label }) => {
            const item: TranscriptToolItem = {
              id: nextId("t"),
              toolName,
              label,
              status: "running",
            };
            updateAssistantMessage(assistantId, (m) => ({
              ...m,
              tools: [...(m.tools ?? []), item],
            }));
          },
          onToolFinish: ({ toolName, isError, summary }) => {
            updateAssistantMessage(assistantId, (m) => {
              const tools = [...(m.tools ?? [])];
              // Complete the latest running entry for this toolName.
              for (let i = tools.length - 1; i >= 0; i--) {
                if (tools[i].toolName === toolName && tools[i].status === "running") {
                  tools[i] = {
                    ...tools[i],
                    status: isError ? "error" : "done",
                    summary,
                  };
                  break;
                }
              }
              return { ...m, tools };
            });
          },
        });

        if (result.aborted) {
          finalStatus = "aborted";
        }
      } catch (e) {
        finalStatus = "error";
        errorMessage = friendlyAgentError(e);
        set({ agentError: errorMessage });
      } finally {
        if (activeAbortController === abortController) {
          activeAbortController = null;
        }
        // Close out any dangling running tool badges on abort/error.
        updateAssistantMessage(assistantId, (m) => {
          const tools = m.tools?.map((t) =>
            t.status === "running"
              ? {
                  ...t,
                  status: (finalStatus === "error" ? "error" : "done") as "done" | "error",
                  summary:
                    t.summary ??
                    (finalStatus === "aborted" ? "Interrompido pelo usuário" : undefined),
                }
              : t,
          );
          return { ...m, ...(tools && tools.length > 0 ? { tools } : {}) };
        });

        set({ agentRunning: false, agentCurrentRunId: null });
        void saveAgentTranscript(get().agentTranscript);

        const stats = aiStats(get().project);
        const hasAnyAi = stats.pending + stats.accepted + stats.edited + stats.rejected > 0;
        void Promise.all([
          finishAgentRunAsUser({
            runId: runMeta.runId,
            status: finalStatus,
            errorMessage,
          }),
          hasAnyAi
            ? reportAgentReviewStatsAsUser({ runId: runMeta.runId, reviewStats: stats })
            : Promise.resolve(null),
        ])
          .catch(() => undefined)
          .finally(() => {
            void get().refreshAgentStatus();
          });
      }
    },

    stopAgentRun: () => {
      activeAbortController?.abort();
    },

    clearAgentConversation: async () => {
      if (get().agentRunning) return;
      const fresh = emptyTranscript(transcriptKeyOf(get().project.id));
      set({ agentTranscript: fresh, agentError: null });
      await saveAgentTranscript(fresh);
    },

    syncAgentReviewStats: () => {
      const { account, agentTranscript, project } = get();
      if (account.status !== "signedIn" || account.offline) return;
      if (!agentTranscript.lastRunId) return;
      void reportAgentReviewStatsAsUser({
        runId: agentTranscript.lastRunId,
        reviewStats: aiStats(project),
      }).catch(() => undefined);
    },
  };
};
