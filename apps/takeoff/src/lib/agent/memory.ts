/**
 * What the AI agent is told at the start of every takeoff: the model itself learns nothing, so
 * "memory" is data kept and handed back (see memoryTools.ts). It belongs to the company: the
 * backend stores it (`takeoffAgentMemory`) and every user of the app reads and teaches the same
 * memory. This file is the app's view of it: the list as last received (cached on disk for
 * offline use, see memoryStore.ts) and which entries apply to a takeoff. The kinds, limits and
 * validation are the shared ones (@rlpapp/shared/takeoff/agentMemory).
 *
 * - "nota": a convention in free text ("nas plantas da construtora X o dreno não é escopo");
 * - "termo": a text found on drawings and what it stands for ("VE-01" → exaustor do catálogo);
 * - "simbolo": a crop of a drawing and what it shows, as a visual example.
 *
 * An entry applies everywhere (empty scope) or to one client / designer. The agent may only
 * propose entries: they stay "proposta" until a person approves them in the app.
 */
import {
  AGENT_MEMORY_KINDS,
  type AgentMemoryInput,
  type AgentMemoryKind,
  type AgentMemoryOrigin,
  type AgentMemoryStatus,
  agentMemoryKey,
  agentMemoryProblem,
  cleanAgentMemoryInput,
  foldMemoryText,
  MAX_MEMORY_IMAGE,
  MAX_MEMORY_SCOPE,
  MAX_MEMORY_SOURCE,
  MAX_MEMORY_TARGET,
  MAX_MEMORY_TEXT,
} from "@rlpapp/shared/takeoff/agentMemory";
import { newId } from "../types";

export type MemoryKind = AgentMemoryKind;
export const MEMORY_KINDS = AGENT_MEMORY_KINDS;
export const memoryProblem = agentMemoryProblem;
export type { AgentMemoryInput };

export interface MemoryEntry {
  /** The backend's id of the entry (a local id in browser dev mode). */
  id: string;
  kind: MemoryKind;
  /** Client or designer the entry applies to; "" = every takeoff. */
  scope: string;
  /** nota: the convention. termo: the text as written on drawings. simbolo: what it shows. */
  text: string;
  /** termo / simbolo: the item it stands for (catalog material, kit or item name). */
  target?: string;
  /** simbolo: PNG crop of the drawing, base64 without the `data:` prefix. */
  image?: string;
  /** "proposta" was suggested by an agent and waits for a person; only "ativa" is used. */
  status: AgentMemoryStatus;
  origin: AgentMemoryOrigin;
  /** Takeoff it was learned on (its name), informative. */
  source?: string;
  createdAt: number;
  /** Who added it, or whose agent proposed it. */
  createdBy?: string;
}

export interface AgentMemory {
  version: 1;
  entries: MemoryEntry[];
  /** When the list last came from the company backend (ms epoch); null = never. */
  fetchedAt: number | null;
}

export const emptyMemory = (): AgentMemory => ({ version: 1, entries: [], fetchedAt: null });

const clip = (s: unknown, max: number): string =>
  typeof s === "string" ? s.trim().slice(0, max) : "";

/**
 * A list of entries of any provenance (the backend's answer, the cache file) into the model;
 * junk entries are dropped, so a file written by another version never breaks the app.
 */
export function parseMemoryEntries(list: unknown): MemoryEntry[] {
  if (!Array.isArray(list)) return [];
  const entries: MemoryEntry[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    const kind = MEMORY_KINDS.find((k) => k === e.kind);
    const text = clip(e.text, MAX_MEMORY_TEXT);
    const id = clip(e.id, 64);
    if (!kind || !text || !id || seen.has(id)) continue;
    const image =
      kind === "simbolo" && typeof e.image === "string" && e.image.length <= MAX_MEMORY_IMAGE
        ? e.image
        : undefined;
    // a symbol without its picture teaches nothing
    if (kind === "simbolo" && !image) continue;
    seen.add(id);
    const target = clip(e.target, MAX_MEMORY_TARGET);
    const source = clip(e.source, MAX_MEMORY_SOURCE);
    const createdBy = clip(e.createdBy, 120);
    entries.push({
      id,
      kind,
      scope: clip(e.scope, MAX_MEMORY_SCOPE),
      text,
      ...(target ? { target } : {}),
      ...(image ? { image } : {}),
      status: e.status === "proposta" ? "proposta" : "ativa",
      origin: e.origin === "agente" ? "agente" : "usuario",
      ...(source ? { source } : {}),
      createdAt: typeof e.createdAt === "number" && Number.isFinite(e.createdAt) ? e.createdAt : 0,
      ...(createdBy ? { createdBy } : {}),
    });
  }
  return entries;
}

/** A stored memory file of any shape into the current model. */
export function parseMemory(raw: unknown): AgentMemory {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    version: 1,
    entries: parseMemoryEntries(r.entries),
    fetchedAt: typeof r.fetchedAt === "number" && Number.isFinite(r.fetchedAt) ? r.fetchedAt : null,
  };
}

/** The company's memory as just received from the backend. */
export const memoryFromRemote = (entries: unknown, now = Date.now()): AgentMemory => ({
  version: 1,
  entries: parseMemoryEntries(entries),
  fetchedAt: now,
});

/** What storing an entry answers: its id, its state and whether it is new. */
export interface MemoryAdded {
  id: string;
  status: AgentMemoryStatus;
  added: boolean;
}

// ---------------------------------------------------------------------------
// Memory kept on this machine only: browser dev mode, where there is no company account. It
// follows the backend's rules (model/procurement/takeoffAgentMemory.ts), so the tools and the
// dialog behave the same there.
// ---------------------------------------------------------------------------

export function addLocalMemory(
  memory: AgentMemory,
  input: AgentMemoryInput,
  proposed: boolean,
  now = Date.now(),
): { memory: AgentMemory; result: MemoryAdded } {
  const problem = agentMemoryProblem(input);
  if (problem) throw new Error(`Memória não gravada: ${problem}`);
  const clean = cleanAgentMemoryInput(input);
  const key = agentMemoryKey(clean);
  const same = key === null ? undefined : memory.entries.find((e) => agentMemoryKey(e) === key);
  if (same) {
    if (same.status === "proposta" && !proposed) {
      return {
        memory: approveLocalMemory(memory, same.id),
        result: { id: same.id, status: "ativa", added: false },
      };
    }
    return { memory, result: { id: same.id, status: same.status, added: false } };
  }
  const created: MemoryEntry = {
    id: newId(),
    ...clean,
    status: proposed ? "proposta" : "ativa",
    origin: proposed ? "agente" : "usuario",
    createdAt: now,
  };
  return {
    memory: { ...memory, entries: [...memory.entries, created] },
    result: { id: created.id, status: created.status, added: true },
  };
}

export const removeLocalMemory = (memory: AgentMemory, id: string): AgentMemory => {
  const entries = memory.entries.filter((e) => e.id !== id);
  return entries.length === memory.entries.length ? memory : { ...memory, entries };
};

export const approveLocalMemory = (memory: AgentMemory, id: string): AgentMemory =>
  memory.entries.some((e) => e.id === id && e.status === "proposta")
    ? {
        ...memory,
        entries: memory.entries.map((e) => (e.id === id ? { ...e, status: "ativa" } : e)),
      }
    : memory;

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * The entries the agent reads on a takeoff: approved ones that apply everywhere or to one of
 * `scopes` (the takeoff's client, a designer the user named). Notes first, then terms, then
 * symbols; within a kind, the specific scope before the general one.
 */
export function memoryFor(memory: AgentMemory, scopes: readonly string[]): MemoryEntry[] {
  const want = new Set(scopes.map(foldMemoryText).filter(Boolean));
  const order = (e: MemoryEntry) => MEMORY_KINDS.indexOf(e.kind) * 2 + (e.scope ? 0 : 1);
  return memory.entries
    .filter((e) => e.status === "ativa" && (!e.scope || want.has(foldMemoryText(e.scope))))
    .sort((a, b) => order(a) - order(b) || a.createdAt - b.createdAt);
}

/** Scopes in use, for the dialog's suggestions. */
export const memoryScopes = (memory: AgentMemory): string[] =>
  [...new Set(memory.entries.map((e) => e.scope).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
