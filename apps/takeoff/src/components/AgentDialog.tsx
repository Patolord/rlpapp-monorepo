import clsx from "clsx";
import { Copy, Power, PowerOff, RefreshCw } from "lucide-react";
import { useState } from "react";
import { isTauri } from "../lib/platform";
import { useStore } from "../store";
import { AgentMemoryPanel } from "./AgentMemoryPanel";
import { Dialog } from "./Dialog";
import { Button } from "./ui";

type Tab = "conexao" | "memoria";

function CopyBlock({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const setStatus = useStore((s) => s.setStatus);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-neutral-500">
        <span>{label}</span>
        <button
          type="button"
          onClick={() =>
            void navigator.clipboard
              .writeText(value)
              .then(() => setStatus(`${label}: copiado`))
              .catch(() => setStatus("Não foi possível copiar"))
          }
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-neutral-300 hover:bg-neutral-800"
        >
          <Copy size={12} /> Copiar
        </button>
      </div>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-neutral-950 p-2 font-mono text-[11px] text-neutral-200 ring-1 ring-neutral-800">
        {value}
      </pre>
      {hint && <p className="mt-1 whitespace-normal text-[11px] text-neutral-500">{hint}</p>}
    </div>
  );
}

function Connection() {
  const server = useStore((s) => s.agentServer);
  const port = useStore((s) => s.agentPort);
  const { startAgent, stopAgent, renewAgentToken, setAgentPort } = useStore.getState();
  const native = isTauri();
  const on = server.status === "on" && server.url;

  return (
    <div className="flex flex-col gap-4 text-xs">
      <p className="whitespace-normal text-neutral-400">
        Com o agente ligado, um assistente de IA no seu computador (Claude Code, Claude Desktop ou
        outro cliente MCP) vê as plantas deste takeoff e marca ambientes, contagens e trechos. Tudo
        o que ele marca entra como sugestão, tracejado e com a etiqueta IA, para você aceitar,
        corrigir ou descartar. Ele não altera o que você desenhou, não mexe em preços, não salva o
        arquivo e não envia o orçamento.
      </p>

      {!native ? (
        <p className="whitespace-normal rounded-md bg-amber-500/10 p-2.5 text-amber-400 ring-1 ring-amber-500/40">
          Modo navegador (desenvolvimento): o agente conecta pelo servidor do Vite, sem token.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {on ? (
            <Button onClick={() => void stopAgent()}>
              <PowerOff size={14} /> Desligar
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={server.status === "starting"}
              onClick={() => void startAgent()}
            >
              <Power size={14} /> {server.status === "starting" ? "Ligando…" : "Ligar o agente"}
            </Button>
          )}
          <label className="flex items-center gap-1.5 text-neutral-400">
            Porta
            <input
              type="number"
              min={1024}
              max={65535}
              value={port}
              disabled={!!on}
              onChange={(e) => setAgentPort(Number(e.target.value))}
              className="num-input w-20"
              title="Porta local do agente. Troque só se outro programa já usa esta."
            />
          </label>
          <span
            className={clsx(
              "flex items-center gap-1.5",
              on ? "text-emerald-700" : "text-neutral-500",
            )}
          >
            <span
              className={clsx("h-1.5 w-1.5 rounded-full", on ? "bg-emerald-500" : "bg-neutral-600")}
            />
            {on ? "Ligado, só neste computador" : "Desligado"}
          </span>
        </div>
      )}

      {server.status === "error" && (
        <p className="whitespace-normal rounded-md bg-red-400/10 p-2.5 text-red-400 ring-1 ring-red-400/50">
          O agente não ligou: {server.error}
        </p>
      )}

      {on && server.url && (
        <>
          <CopyBlock label="Endereço (MCP, HTTP)" value={server.url} />
          {server.token ? (
            <>
              <CopyBlock
                label="Claude Code"
                value={`claude mcp add --transport http rlp-takeoff ${server.url} --header "Authorization: Bearer ${server.token}"`}
                hint="Rode uma vez no terminal. O token fica guardado no cofre de credenciais do sistema e continua o mesmo entre as aberturas do app."
              />
              <CopyBlock
                label="Outros clientes (JSON)"
                value={JSON.stringify(
                  {
                    mcpServers: {
                      "rlp-takeoff": {
                        type: "http",
                        url: server.url,
                        headers: { Authorization: `Bearer ${server.token}` },
                      },
                    },
                  },
                  null,
                  2,
                )}
              />
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => void renewAgentToken()}
                  title="Clientes configurados com o token atual param de funcionar"
                >
                  <RefreshCw size={14} /> Gerar novo token
                </Button>
                <span className="whitespace-normal text-[11px] text-neutral-500">
                  Quem tem o token marca neste takeoff: não o compartilhe.
                </span>
              </div>
            </>
          ) : (
            <CopyBlock
              label="Claude Code"
              value={`claude mcp add --transport http rlp-takeoff ${server.url}`}
            />
          )}
        </>
      )}
    </div>
  );
}

/**
 * "Agente de IA": the local MCP endpoint an AI assistant connects to (lib/agent/bridge.ts) and
 * the memory it reads before each takeoff.
 */
export function AgentDialog() {
  const open = useStore((s) => s.agentDialogOpen);
  const proposals = useStore(
    (s) => s.agentMemory.entries.filter((e) => e.status === "proposta").length,
  );
  const setOpen = useStore((s) => s.setAgentDialogOpen);
  const [tab, setTab] = useState<Tab>("conexao");
  if (!open) return null;
  const tabButton = (id: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={clsx(
        "rounded-md px-2.5 py-1 text-xs",
        tab === id
          ? "bg-neutral-700 text-neutral-100"
          : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200",
      )}
    >
      {label}
    </button>
  );
  return (
    <Dialog
      title="Agente de IA"
      onClose={() => setOpen(false)}
      className="w-[44rem]"
      headerExtra={
        <div role="tablist" className="flex items-center gap-1">
          {tabButton("conexao", "Conexão")}
          {tabButton("memoria", proposals > 0 ? `Memória (${proposals})` : "Memória")}
        </div>
      }
    >
      {tab === "conexao" ? <Connection /> : <AgentMemoryPanel />}
    </Dialog>
  );
}
