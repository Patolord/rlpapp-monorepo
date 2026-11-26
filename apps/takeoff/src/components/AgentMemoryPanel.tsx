import clsx from "clsx";
import { Check, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type MemoryEntry,
  type MemoryKind,
  memoryProblem,
  memoryScopes,
} from "../lib/agent/memory";
import { useStore } from "../store";
import { type AgentMemorySync, selectCanEditAgentMemory } from "../store/agentMemory";
import { Button } from "./ui";

const KIND_LABEL: Record<MemoryKind, string> = {
  nota: "Anotação",
  termo: "Termo",
  simbolo: "Símbolo",
};

const field =
  "h-8 rounded-md bg-neutral-800 px-2 text-xs text-neutral-100 ring-1 ring-neutral-700 outline-none focus:ring-orange-400 disabled:opacity-50";

/** Run a change to the memory; a refusal (signed out, offline, invalid) goes to the status bar. */
function attempt(change: Promise<unknown>, done?: string) {
  const { setStatus } = useStore.getState();
  void change
    .then(() => done && setStatus(done))
    .catch((e) => setStatus(e instanceof Error ? e.message : String(e)));
}

function Entry({ entry, editable }: { entry: MemoryEntry; editable: boolean }) {
  const { approveAgentMemory, removeAgentMemory } = useStore.getState();
  const proposal = entry.status === "proposta";
  return (
    <li className="flex items-start gap-2 rounded-md bg-neutral-800/60 px-2.5 py-2 ring-1 ring-neutral-800">
      {entry.image && (
        <img
          src={`data:image/png;base64,${entry.image}`}
          alt={`Símbolo: ${entry.text}`}
          className="h-14 w-14 shrink-0 rounded bg-white object-contain"
        />
      )}
      <div className="min-w-0 flex-1 text-xs">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
          <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-300 ring-1 ring-neutral-700">
            {KIND_LABEL[entry.kind]}
          </span>
          <span>{entry.scope || "Todos os projetos"}</span>
          {entry.createdBy && (
            <span>
              · {entry.origin === "agente" ? `IA de ${entry.createdBy}` : entry.createdBy}
            </span>
          )}
          {!entry.createdBy && entry.origin === "agente" && <span>· proposta pela IA</span>}
          {entry.source && <span className="truncate">· {entry.source}</span>}
        </div>
        <div className="mt-1 whitespace-normal text-neutral-100">
          {entry.kind === "nota" ? (
            entry.text
          ) : (
            <>
              <span className="font-medium">{entry.text}</span>
              {entry.target && entry.target !== entry.text && (
                <span className="text-neutral-400"> → {entry.target}</span>
              )}
            </>
          )}
        </div>
      </div>
      {proposal && (
        <Button
          variant="primary"
          disabled={!editable}
          onClick={() =>
            attempt(approveAgentMemory(entry.id), "Memória aprovada para toda a empresa")
          }
          title="A partir de agora os agentes de todos os usuários leem esta memória"
        >
          <Check size={14} /> Aprovar
        </Button>
      )}
      <button
        type="button"
        disabled={!editable}
        aria-label={proposal ? "Descartar a proposta" : "Apagar da memória"}
        title={proposal ? "Descartar a proposta" : "Apagar da memória (deixa de valer para todos)"}
        onClick={() => attempt(removeAgentMemory(entry.id))}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Trash2 size={14} />
      </button>
    </li>
  );
}

/** Where the list on screen came from and whether it can be changed, in the user's words. */
function sourceLine(sync: AgentMemorySync, editable: boolean, fetchedAt: number | null): string {
  if (sync.source === "local") {
    return "Modo navegador (desenvolvimento): memória só deste navegador.";
  }
  const when = fetchedAt
    ? new Date(fetchedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : null;
  if (!editable) {
    return when
      ? `Cópia de ${when}. Entre com a conta da empresa para atualizar e alterar.`
      : "Entre com a conta da empresa para ver e alterar a memória.";
  }
  if (sync.error) {
    return `Sem resposta do servidor (${sync.error}).${when ? ` Mostrando a cópia de ${when}.` : ""}`;
  }
  return when ? `Atualizada em ${when}.` : "";
}

/**
 * What the AI agent is told at the start of every takeoff (lib/agent/memory.ts): the entries in
 * use, the proposals agents made and the form to teach a convention or a term. It is the
 * company's memory, the same for every user of the app; this machine keeps a copy for offline
 * use. Symbol examples are added from the drawing ("Lembrar símbolo" on a selected count mark).
 */
export function AgentMemoryPanel() {
  const memory = useStore((s) => s.agentMemory);
  const sync = useStore((s) => s.agentMemorySync);
  const editable = useStore(selectCanEditAgentMemory);
  const client = useStore((s) => s.project.client);
  const { addAgentMemory, refreshAgentMemory } = useStore.getState();
  const [kind, setKind] = useState<"nota" | "termo">("nota");
  const [text, setText] = useState("");
  const [target, setTarget] = useState("");
  const [scope, setScope] = useState("");
  // others teach it too: bring the list up to date whenever the panel opens
  useEffect(() => {
    void useStore.getState().refreshAgentMemory();
  }, []);
  const proposals = memory.entries.filter((e) => e.status === "proposta");
  const active = memory.entries.filter((e) => e.status === "ativa");
  const scopes = [...new Set([...(client ? [client] : []), ...memoryScopes(memory)])];
  const draft = { kind, text, target: kind === "termo" ? target : undefined, scope };
  const problem = text.trim() ? memoryProblem(draft) : null;
  const warn = !!sync.error || (!editable && sync.source !== "local");

  const add = () => {
    if (!text.trim() || problem || !editable) return;
    void addAgentMemory(draft)
      .then(() => {
        setText("");
        setTarget("");
        useStore.getState().setStatus("Memória da IA atualizada para toda a empresa");
      })
      .catch((e) => useStore.getState().setStatus(e instanceof Error ? e.message : String(e)));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 whitespace-normal text-xs text-neutral-400">
          Os agentes leem esta memória antes de cada levantamento. Ela é da empresa: o que você
          ensina aqui vale para todos os usuários do RLP Takeoff. O que uma IA propõe só passa a
          valer depois de aprovado por uma pessoa.{" "}
          <span className={clsx(warn && "text-amber-300")}>
            {sourceLine(sync, editable, memory.fetchedAt)}
          </span>
        </p>
        {sync.source !== "local" && (
          <Button
            disabled={!editable || sync.loading}
            onClick={() => void refreshAgentMemory()}
            title="Buscar a memória da empresa agora"
          >
            <RefreshCw size={14} className={clsx(sync.loading && "animate-spin")} /> Atualizar
          </Button>
        )}
      </div>

      {proposals.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700">
            Propostas da IA ({proposals.length})
          </h3>
          <ul className="flex flex-col gap-1.5">
            {proposals.map((e) => (
              <Entry key={e.id} entry={e} editable={editable} />
            ))}
          </ul>
        </section>
      )}

      <form
        className="flex flex-col gap-2 rounded-md p-2.5 ring-1 ring-neutral-800"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={kind}
            disabled={!editable}
            onChange={(e) => setKind(e.target.value as "nota" | "termo")}
            aria-label="Tipo de memória"
            className={field}
          >
            <option value="nota">Anotação (regra em texto)</option>
            <option value="termo">Termo (texto da planta → item)</option>
          </select>
          <input
            value={scope}
            disabled={!editable}
            onChange={(e) => setScope(e.target.value)}
            list="agent-memory-scopes"
            placeholder="Cliente ou projetista (vazio = todos)"
            aria-label="Cliente ou projetista a que se aplica"
            className={`${field} min-w-[14rem] flex-1`}
          />
          <datalist id="agent-memory-scopes">
            {scopes.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={text}
            disabled={!editable}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              kind === "nota"
                ? "Ex.: o dreno aparece na planta mas não é escopo"
                : "Texto como aparece na planta (ex.: VE-01)"
            }
            aria-label={kind === "nota" ? "Anotação" : "Texto como aparece na planta"}
            className={`${field} min-w-[16rem] flex-1`}
          />
          {kind === "termo" && (
            <input
              value={target}
              disabled={!editable}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="Item que representa (material, kit)"
              aria-label="Item que o termo representa"
              className={`${field} min-w-[12rem] flex-1`}
            />
          )}
          <Button type="submit" variant="primary" disabled={!editable || !text.trim() || !!problem}>
            <Plus size={14} /> Adicionar
          </Button>
        </div>
        {problem && <span className="text-[11px] text-amber-400">Falta algo: {problem}.</span>}
      </form>

      <section>
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          Em uso ({active.length})
        </h3>
        {active.length === 0 ? (
          <p className="whitespace-normal text-xs text-neutral-500">
            Nada ainda. Escreva acima uma convenção das plantas que a empresa recebe, ou selecione
            uma contagem na planta e use Lembrar símbolo.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {active.map((e) => (
              <Entry key={e.id} entry={e} editable={editable} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
