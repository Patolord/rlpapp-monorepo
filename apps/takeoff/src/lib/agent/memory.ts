/**
 * What the AI agent is told at the start of every takeoff: the model itself learns nothing, so
 * "memory" is data the app keeps and hands back (see memoryTools.ts). Three kinds:
 *
 * - "nota": a convention in free text ("nas plantas da construtora X o dreno não é escopo");
 * - "termo": a text found on drawings and what it stands for ("VE-01" → exaustor do catálogo);
 * - "simbolo": a crop of a drawing and what it shows, as a visual example.
 *
 * An entry applies everywhere (empty scope) or to one client / designer. The agent may only
 * propose entries: they stay "proposta" until the user approves them in the app. Pure model;
 * memoryStore.ts persists it per machine.
 */
import { foldName } from "../text";
import { newId } from "../types";

export type MemoryKind = "nota" | "termo" | "simbolo";
export const MEMORY_KINDS: readonly MemoryKind[] = ["nota", "termo", "simbolo"];

export interface MemoryEntry {
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
  /** "proposta" was suggested by the agent and waits for the user; only "ativa" is used. */
  status: "ativa" | "proposta";
  origin: "usuario" | "agente";
  /** Takeoff it was learned on (its name), informative. */
  source?: string;
  createdAt: number;
}

export interface AgentMemory {
  version: 1;
  entries: MemoryEntry[];
}

export const emptyMemory = (): AgentMemory => ({ version: 1, entries: [] });

/** Longest text kept per entry: a memory is a rule of thumb, not a document. */
export const MAX_MEMORY_TEXT = 600;
/** Largest symbol crop kept (base64 characters, ~150 kB of PNG). */
export const MAX_MEMORY_IMAGE = 200_000;

const clip = (s: unknown, max: number): string =>
  typeof s === "string" ? s.trim().slice(0, max) : "";

/** A stored memory file of any shape into the current model; junk entries are dropped. */
export function parseMemory(raw: unknown): AgentMemory {
  const list =
    raw && typeof raw === "object" && Array.isArray((raw as { entries?: unknown }).entries)
      ? (raw as { entries: unknown[] }).entries
      : [];
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
    const target = clip(e.target, 200);
    const source = clip(e.source, 200);
    entries.push({
      id,
      kind,
      scope: clip(e.scope, 120),
      text,
      ...(target ? { target } : {}),
      ...(image ? { image } : {}),
      status: e.status === "proposta" ? "proposta" : "ativa",
      origin: e.origin === "agente" ? "agente" : "usuario",
      ...(source ? { source } : {}),
      createdAt: typeof e.createdAt === "number" && Number.isFinite(e.createdAt) ? e.createdAt : 0,
    });
  }
  return { version: 1, entries };
}

export type NewMemoryEntry = Pick<MemoryEntry, "kind" | "text"> &
  Partial<Pick<MemoryEntry, "scope" | "target" | "image" | "source" | "status" | "origin">>;

/** Why an entry cannot be stored, or null when it can. */
export function memoryProblem(e: NewMemoryEntry): string | null {
  if (!e.text.trim()) return "o texto está vazio";
  if (e.text.trim().length > MAX_MEMORY_TEXT) {
    return `o texto passa de ${MAX_MEMORY_TEXT} caracteres`;
  }
  if (e.kind === "termo" && !e.target?.trim()) return "falta o item que o termo representa";
  if (e.kind === "simbolo" && !e.image) return "falta o recorte do símbolo";
  if (e.image && e.image.length > MAX_MEMORY_IMAGE) return "o recorte do símbolo é grande demais";
  return null;
}

const sameEntry = (a: MemoryEntry, b: NewMemoryEntry): boolean =>
  a.kind === b.kind &&
  a.kind !== "simbolo" &&
  foldName(a.scope) === foldName(b.scope?.trim() ?? "") &&
  foldName(a.text) === foldName(b.text.trim()) &&
  foldName(a.target ?? "") === foldName(b.target?.trim() ?? "");

/**
 * The memory with one more entry. A note or term already there (same kind, scope, text and
 * target) is not duplicated: the existing entry is returned, so an agent proposing the same
 * lesson on every takeoff does not pile it up.
 */
export function addMemory(
  memory: AgentMemory,
  entry: NewMemoryEntry,
  now = Date.now(),
): { memory: AgentMemory; entry: MemoryEntry; added: boolean } {
  const problem = memoryProblem(entry);
  if (problem) throw new Error(problem);
  const existing = memory.entries.find((e) => sameEntry(e, entry));
  if (existing) return { memory, entry: existing, added: false };
  const target = entry.target?.trim();
  const source = entry.source?.trim();
  const created: MemoryEntry = {
    id: newId(),
    kind: entry.kind,
    scope: entry.scope?.trim() ?? "",
    text: entry.text.trim(),
    ...(target ? { target } : {}),
    ...(entry.image ? { image: entry.image } : {}),
    status: entry.status ?? "ativa",
    origin: entry.origin ?? "usuario",
    ...(source ? { source } : {}),
    createdAt: now,
  };
  return {
    memory: { ...memory, entries: [...memory.entries, created] },
    entry: created,
    added: true,
  };
}

export const removeMemory = (memory: AgentMemory, id: string): AgentMemory => {
  const entries = memory.entries.filter((e) => e.id !== id);
  return entries.length === memory.entries.length ? memory : { ...memory, entries };
};

/** Approve a proposal: from then on the agent reads it. */
export const approveMemory = (memory: AgentMemory, id: string): AgentMemory =>
  memory.entries.some((e) => e.id === id && e.status === "proposta")
    ? {
        ...memory,
        entries: memory.entries.map((e) => (e.id === id ? { ...e, status: "ativa" } : e)),
      }
    : memory;

/**
 * The entries the agent reads on a takeoff: approved ones that apply everywhere or to one of
 * `scopes` (the takeoff's client, a designer the user named). Notes first, then terms, then
 * symbols; within a kind, the specific scope before the general one.
 */
export function memoryFor(memory: AgentMemory, scopes: readonly string[]): MemoryEntry[] {
  const want = new Set(scopes.map((s) => foldName(s.trim())).filter(Boolean));
  const order = (e: MemoryEntry) => MEMORY_KINDS.indexOf(e.kind) * 2 + (e.scope ? 0 : 1);
  return memory.entries
    .filter((e) => e.status === "ativa" && (!e.scope || want.has(foldName(e.scope))))
    .sort((a, b) => order(a) - order(b) || a.createdAt - b.createdAt);
}

/** Scopes in use, for the dialog's suggestions. */
export const memoryScopes = (memory: AgentMemory): string[] =>
  [...new Set(memory.entries.map((e) => e.scope).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
