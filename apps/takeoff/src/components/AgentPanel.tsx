import {
  findTakeoffAgentModel,
  formatUsdFromCents,
  formatUsdFromMicroUsd,
  usdCentsToMicroUsd,
} from "@rlpapp/shared/takeoff/agentModels";
import clsx from "clsx";
import {
  AlertCircle,
  BookOpen,
  Check,
  Loader2,
  LogIn,
  RefreshCw,
  SendHorizontal,
  Sparkles,
  Square,
  Trash2,
  WifiOff,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TranscriptMessage, TranscriptToolItem } from "../lib/agent/llm/transcript";
import { useDoc } from "../lib/session";
import { useStore } from "../store";
import { Button } from "./ui";

const STARTER_PROMPTS = [
  "Verifique a escala e liste os ambientes desta página",
  "Conte os equipamentos e difusores desta página",
  "Revise as marcações e aponte o que ainda falta",
];

function ToolActivityRow({ item }: { item: TranscriptToolItem }) {
  return (
    <div className="flex items-start gap-1.5 text-[11px] leading-snug text-neutral-400">
      {item.status === "running" ? (
        <Loader2 size={12} className="mt-0.5 shrink-0 animate-spin text-violet-400" />
      ) : item.status === "error" ? (
        <AlertCircle size={12} className="mt-0.5 shrink-0 text-amber-400" />
      ) : (
        <Check size={12} className="mt-0.5 shrink-0 text-emerald-400" />
      )}
      <span className={clsx("min-w-0", item.status === "error" && "text-amber-300/90")}>
        {item.status === "running" ? item.label : (item.summary ?? item.label)}
      </span>
    </div>
  );
}

function MessageBubble({
  message,
  isStreaming,
}: {
  message: TranscriptMessage;
  isStreaming: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] whitespace-pre-wrap break-words rounded-lg bg-orange-500/15 px-3 py-2 text-xs text-neutral-100 ring-1 ring-orange-400/30">
          {message.text}
        </div>
      </div>
    );
  }

  const tools = message.tools ?? [];
  return (
    <div className="flex flex-col gap-1.5">
      {tools.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border border-neutral-800 bg-neutral-950/70 px-2.5 py-2">
          {tools.map((t) => (
            <ToolActivityRow key={t.id} item={t} />
          ))}
        </div>
      )}
      {message.text ? (
        <div className="whitespace-pre-wrap break-words rounded-lg bg-neutral-800/70 px-3 py-2 text-xs leading-relaxed text-neutral-100 ring-1 ring-neutral-700/60">
          {message.text}
        </div>
      ) : isStreaming ? (
        <div className="flex items-center gap-1.5 px-1 text-[11px] text-neutral-400">
          <Loader2 size={12} className="animate-spin text-violet-400" />
          Analisando a planta…
        </div>
      ) : null}
    </div>
  );
}

/**
 * Built-in AI assistant side panel. Runs the local tool loop against the open
 * PDF and Zustand store while routing model calls through the company proxy.
 */
export function AgentPanel() {
  const open = useStore((s) => s.agentPanelOpen);
  const account = useStore((s) => s.account);
  const agentStatus = useStore((s) => s.agentStatus);
  const agentStatusLoading = useStore((s) => s.agentStatusLoading);
  const agentStatusError = useStore((s) => s.agentStatusError);
  const transcript = useStore((s) => s.agentTranscript);
  const running = useStore((s) => s.agentRunning);
  const agentError = useStore((s) => s.agentError);
  const proposals = useStore(
    (s) => s.agentMemory.entries.filter((e) => e.status === "proposta").length,
  );
  const numPages = useDoc((s) => s.numPages);

  const {
    setAgentPanelOpen,
    setAgentDialogOpen,
    refreshAgentStatus,
    sendAgentMessage,
    stopAgentRun,
    clearAgentConversation,
    signIn,
  } = useStore.getState();

  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollSignature = `${open}:${transcript.messages.length}:${transcript.messages.at(-1)?.text.length ?? 0}:${transcript.messages.at(-1)?.tools?.length ?? 0}`;

  useEffect(() => {
    if (!scrollSignature.startsWith("true:")) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [scrollSignature]);

  if (!open) return null;

  const modelMeta = agentStatus ? findTakeoffAgentModel(agentStatus.model) : undefined;
  const companyOverBudget =
    agentStatus !== null &&
    agentStatus.companyBudgetUsdCents > 0 &&
    agentStatus.companyUsedMicroUsd >= usdCentsToMicroUsd(agentStatus.companyBudgetUsdCents);
  const userOverBudget =
    agentStatus !== null &&
    agentStatus.userBudgetUsdCents > 0 &&
    agentStatus.userUsedMicroUsd >= usdCentsToMicroUsd(agentStatus.userBudgetUsdCents);

  const canSend =
    account.status === "signedIn" &&
    !account.offline &&
    Boolean(agentStatus?.hasPermission && agentStatus.enabled) &&
    !companyOverBudget &&
    !userOverBudget;

  const submit = (text = draft) => {
    const clean = text.trim();
    if (!clean || !canSend || running) return;
    setDraft("");
    void sendAgentMessage(clean);
  };

  return (
    <aside
      aria-label="Agente de IA"
      className="flex w-[22rem] shrink-0 flex-col border-l border-neutral-800 bg-neutral-900 text-neutral-100"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-neutral-800 px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Sparkles size={15} className="shrink-0 text-violet-400" />
          <span className="truncate text-xs font-semibold">Agente de IA</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAgentDialogOpen(true)}
            title="Memória da empresa e configurações avançadas (MCP)"
            className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            <BookOpen size={13} />
            Memória
            {proposals > 0 && (
              <span className="rounded bg-violet-500/20 px-1 font-mono text-[10px] text-violet-300">
                {proposals}
              </span>
            )}
          </button>
          <button
            type="button"
            disabled={running || transcript.messages.length === 0}
            onClick={() => void clearAgentConversation()}
            title="Limpar conversa deste takeoff"
            aria-label="Limpar conversa"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-30"
          >
            <Trash2 size={13} />
          </button>
          <button
            type="button"
            onClick={() => setAgentPanelOpen(false)}
            title="Fechar painel de IA"
            aria-label="Fechar painel de IA"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Status strip (model + monthly budget) */}
      {account.status === "signedIn" && !account.offline && agentStatus && (
        <div className="flex items-center justify-between gap-2 border-b border-neutral-800/80 bg-neutral-950/50 px-3 py-1.5 text-[11px] text-neutral-400">
          <span className="truncate font-medium text-neutral-300">
            {modelMeta?.label ?? agentStatus.model}
          </span>
          <span
            className="shrink-0 font-mono"
            title={`Seu uso no mês (${agentStatus.month}): ${formatUsdFromMicroUsd(agentStatus.userUsedMicroUsd)} de ${formatUsdFromCents(agentStatus.userBudgetUsdCents)} · Empresa: ${formatUsdFromMicroUsd(agentStatus.companyUsedMicroUsd)} de ${formatUsdFromCents(agentStatus.companyBudgetUsdCents)}`}
          >
            {formatUsdFromMicroUsd(agentStatus.userUsedMicroUsd)} /{" "}
            {formatUsdFromCents(agentStatus.userBudgetUsdCents)}
          </span>
        </div>
      )}

      {/* Body */}
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {account.status !== "signedIn" ? (
          <div className="my-auto flex flex-col items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950/60 p-4 text-center text-xs">
            <LogIn size={20} className="text-neutral-400" />
            <p className="text-neutral-300">
              Entre com a sua conta da RLP para usar o agente de IA diretamente nas plantas.
            </p>
            <Button
              variant="primary"
              disabled={account.status === "signingIn"}
              onClick={() => void signIn()}
            >
              {account.status === "signingIn" ? "Conectando…" : "Entrar com conta da empresa"}
            </Button>
          </div>
        ) : account.offline ? (
          <div className="my-auto flex flex-col items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/60 p-4 text-center text-xs text-neutral-400">
            <WifiOff size={20} className="text-amber-400" />
            <p>Sem conexão com o servidor. O agente de IA precisa de internet para responder.</p>
          </div>
        ) : agentStatusLoading && !agentStatus ? (
          <div className="my-auto flex items-center justify-center gap-2 text-xs text-neutral-400">
            <Loader2 size={14} className="animate-spin" />
            Carregando configuração da IA…
          </div>
        ) : agentStatusError && !agentStatus ? (
          <div className="my-auto flex flex-col items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-center text-xs text-red-300">
            <p>Não foi possível carregar o status da IA: {agentStatusError}</p>
            <Button onClick={() => void refreshAgentStatus()}>
              <RefreshCw size={13} /> Tentar novamente
            </Button>
          </div>
        ) : agentStatus && !agentStatus.hasPermission ? (
          <div className="my-auto flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-950/60 p-4 text-xs text-neutral-300">
            <p className="font-medium text-neutral-100">Acesso não liberado</p>
            <p className="text-neutral-400">
              Sua conta precisa da permissão <span className="font-mono">takeoff.agente</span> para
              usar a IA embutida. Peça a liberação a um administrador no painel web.
            </p>
          </div>
        ) : agentStatus && !agentStatus.enabled ? (
          <div className="my-auto flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-950/60 p-4 text-xs text-neutral-300">
            <p className="font-medium text-neutral-100">Agente de IA desativado</p>
            <p className="text-neutral-400">
              O agente está desativado nas configurações da empresa. Um administrador pode ativá-lo
              em <span className="text-neutral-200">App Takeoff → IA</span> no painel web.
            </p>
          </div>
        ) : companyOverBudget || userOverBudget ? (
          <div className="my-auto flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200">
            <p className="font-medium">Limite mensal atingido</p>
            <p className="text-amber-200/80">
              {companyOverBudget
                ? `O limite mensal da empresa (${formatUsdFromCents(agentStatus.companyBudgetUsdCents)}) foi atingido neste mês.`
                : `Seu limite mensal (${formatUsdFromCents(agentStatus.userBudgetUsdCents)}) foi atingido neste mês.`}
            </p>
          </div>
        ) : transcript.messages.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs leading-relaxed text-neutral-400">
              Peça para ler escalas, criar ambientes, contar equipamentos ou revisar o levantamento.
              Tudo entra como sugestão tracejada para você aceitar, editar ou descartar.
            </p>
            {numPages > 0 ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                  Sugestões para começar
                </span>
                {STARTER_PROMPTS.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    disabled={!canSend || running}
                    onClick={() => submit(starter)}
                    className="rounded-md border border-neutral-800 bg-neutral-950/60 px-2.5 py-2 text-left text-xs text-neutral-300 transition hover:border-violet-500/40 hover:bg-neutral-800/80 hover:text-neutral-100 disabled:opacity-40"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-neutral-800 bg-neutral-950/50 p-2.5 text-[11px] text-neutral-400">
                Abra um PDF para o agente conseguir visualizar e marcar a planta.
              </p>
            )}
          </div>
        ) : (
          transcript.messages.map((m, idx) => (
            <MessageBubble
              key={m.id}
              message={m}
              isStreaming={running && idx === transcript.messages.length - 1}
            />
          ))
        )}

        {agentError && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-300">
            {agentError}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-neutral-800 p-2.5">
        <div className="flex items-end gap-1.5 rounded-lg border border-neutral-700 bg-neutral-950 p-1.5 focus-within:border-violet-500/60">
          <textarea
            rows={2}
            value={draft}
            disabled={!canSend || running}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={
              canSend
                ? "Peça algo sobre esta planta… (Enter envia)"
                : "Agente indisponível no momento"
            }
            className="max-h-32 min-h-[2.75rem] min-w-0 flex-1 resize-none bg-transparent px-1.5 py-1 text-xs text-neutral-100 placeholder:text-neutral-500 focus:outline-none disabled:opacity-50"
          />
          {running ? (
            <button
              type="button"
              onClick={stopAgentRun}
              title="Interromper agente"
              aria-label="Interromper agente"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-500/20 text-red-300 ring-1 ring-red-500/40 hover:bg-red-500/30"
            >
              <Square size={13} className="fill-current" />
            </button>
          ) : (
            <button
              type="button"
              disabled={!canSend || !draft.trim()}
              onClick={() => submit()}
              title="Enviar mensagem"
              aria-label="Enviar mensagem"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-600 text-white hover:bg-violet-500 disabled:bg-neutral-800 disabled:text-neutral-500"
            >
              <SendHorizontal size={14} />
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[10px] text-neutral-500">
          Marcações da IA entram como sugestão — revise antes de aprovar.
        </p>
      </div>
    </aside>
  );
}
