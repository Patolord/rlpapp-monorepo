import { Check, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  type MemoryEntry,
  type MemoryKind,
  memoryProblem,
  memoryScopes,
} from "../lib/agent/memory";
import { useStore } from "../store";
import { Button } from "./ui";

const KIND_LABEL: Record<MemoryKind, string> = {
  nota: "Anotação",
  termo: "Termo",
  simbolo: "Símbolo",
};

const field =
  "h-8 rounded-md bg-neutral-800 px-2 text-xs text-neutral-100 ring-1 ring-neutral-700 outline-none focus:ring-orange-400";

function Entry({ entry }: { entry: MemoryEntry }) {
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
          {entry.origin === "agente" && <span>· proposta pela IA</span>}
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
          onClick={() => approveAgentMemory(entry.id)}
          title="A partir de agora o agente lê esta memória"
        >
          <Check size={14} /> Aprovar
        </Button>
      )}
      <button
        type="button"
        aria-label={proposal ? "Descartar a proposta" : "Apagar da memória"}
        title={proposal ? "Descartar a proposta" : "Apagar da memória"}
        onClick={() => removeAgentMemory(entry.id)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
      >
        <Trash2 size={14} />
      </button>
    </li>
  );
}

/**
 * What the AI agent is told at the start of every takeoff (lib/agent/memory.ts): the entries in
 * use, the proposals the agent made and the form to teach it a convention or a term. Symbol
 * examples are added from the drawing ("Lembrar símbolo" on a selected count mark).
 */
export function AgentMemoryPanel() {
  const memory = useStore((s) => s.agentMemory);
  const client = useStore((s) => s.project.client);
  const { addAgentMemory, setStatus } = useStore.getState();
  const [kind, setKind] = useState<"nota" | "termo">("nota");
  const [text, setText] = useState("");
  const [target, setTarget] = useState("");
  const [scope, setScope] = useState("");
  const proposals = memory.entries.filter((e) => e.status === "proposta");
  const active = memory.entries.filter((e) => e.status === "ativa");
  const scopes = [...new Set([...(client ? [client] : []), ...memoryScopes(memory)])];
  const draft = { kind, text, target: kind === "termo" ? target : undefined, scope };
  const problem = text.trim() ? memoryProblem(draft) : null;

  const add = () => {
    if (!text.trim() || problem) return;
    void addAgentMemory(draft).then(() => {
      setText("");
      setTarget("");
      setStatus("Memória da IA atualizada");
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="whitespace-normal text-xs text-neutral-400">
        O agente lê estas anotações antes de cada levantamento. Elas ficam neste computador. O que a
        IA propõe só passa a valer depois de aprovado aqui.
      </p>

      {proposals.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700">
            Propostas da IA ({proposals.length})
          </h3>
          <ul className="flex flex-col gap-1.5">
            {proposals.map((e) => (
              <Entry key={e.id} entry={e} />
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
            onChange={(e) => setKind(e.target.value as "nota" | "termo")}
            aria-label="Tipo de memória"
            className={field}
          >
            <option value="nota">Anotação (regra em texto)</option>
            <option value="termo">Termo (texto da planta → item)</option>
          </select>
          <input
            value={scope}
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
              onChange={(e) => setTarget(e.target.value)}
              placeholder="Item que representa (material, kit)"
              aria-label="Item que o termo representa"
              className={`${field} min-w-[12rem] flex-1`}
            />
          )}
          <Button type="submit" variant="primary" disabled={!text.trim() || !!problem}>
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
            Nada ainda. Escreva acima uma convenção das plantas que você recebe, ou selecione uma
            contagem na planta e use Lembrar símbolo.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {active.map((e) => (
              <Entry key={e.id} entry={e} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
