/**
 * Memory of the AI agent of the RLP Takeoff desktop app: what the company has taught it about
 * its drawings, read by the agent at the start of every takeoff. The model learns nothing by
 * itself, so this is data the company keeps and hands back. It is shared by everyone who uses
 * the app: the backend stores it (`takeoffAgentMemory`), the app caches it for offline use.
 * The kinds, the size limits and the validation live here because the app and the backend must
 * agree on them.
 *
 * - "nota": a convention in free text ("nas plantas da construtora X o dreno não é escopo");
 * - "termo": a text found on drawings and what it stands for ("VE-01" → exaustor do catálogo);
 * - "simbolo": a crop of a drawing and what it shows, as a visual example.
 */

export type AgentMemoryKind = "nota" | "termo" | "simbolo";
export const AGENT_MEMORY_KINDS: readonly AgentMemoryKind[] = ["nota", "termo", "simbolo"];

/** "proposta" was suggested by the agent and waits for a person; only "ativa" is used. */
export type AgentMemoryStatus = "ativa" | "proposta";
export type AgentMemoryOrigin = "usuario" | "agente";

/** Longest text of an entry: a memory is a rule of thumb, not a document. */
export const MAX_MEMORY_TEXT = 600;
export const MAX_MEMORY_SCOPE = 120;
export const MAX_MEMORY_TARGET = 200;
export const MAX_MEMORY_SOURCE = 200;
/** Largest symbol crop (base64 characters, about 30 kB of PNG). */
export const MAX_MEMORY_IMAGE = 40_000;
/** Entries a company may keep: every one is read by the agent on every takeoff. */
export const MAX_MEMORY_ENTRIES = 400;
/** Symbol examples a company may keep: each is a picture sent with the list. */
export const MAX_MEMORY_SYMBOLS = 100;

/** What a person or the agent supplies to create an entry. */
export interface AgentMemoryInput {
  kind: AgentMemoryKind;
  /** nota: the convention. termo: the text as written on drawings. simbolo: what it shows. */
  text: string;
  /** Client or designer the entry applies to; empty = every takeoff. */
  scope?: string;
  /** termo / simbolo: the item it stands for (catalog material, kit or item name). */
  target?: string;
  /** simbolo: PNG crop of the drawing, base64 without the `data:` prefix. */
  image?: string;
  /** Takeoff it was learned on (its name), informative. */
  source?: string;
}

/** Accent- and case-insensitive key of a text (same as the app's foldName). */
export const foldMemoryText = (s: string): string =>
  s
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Why an entry cannot be stored (a message in Portuguese for the form), or null when it can. */
export function agentMemoryProblem(input: AgentMemoryInput): string | null {
  const text = input.text.trim();
  if (!text) return "o texto está vazio";
  if (text.length > MAX_MEMORY_TEXT) return `o texto passa de ${MAX_MEMORY_TEXT} caracteres`;
  if ((input.scope?.trim().length ?? 0) > MAX_MEMORY_SCOPE) {
    return `o cliente ou projetista passa de ${MAX_MEMORY_SCOPE} caracteres`;
  }
  if ((input.target?.trim().length ?? 0) > MAX_MEMORY_TARGET) {
    return `o item passa de ${MAX_MEMORY_TARGET} caracteres`;
  }
  if (input.kind === "termo" && !input.target?.trim()) return "falta o item que o termo representa";
  if (input.kind === "simbolo") {
    if (!input.image) return "falta o recorte do símbolo";
    if (input.image.length > MAX_MEMORY_IMAGE) return "o recorte do símbolo é grande demais";
    if (!BASE64.test(input.image)) return "o recorte do símbolo não é uma imagem válida";
  } else if (input.image) {
    return "só um símbolo leva recorte";
  }
  return null;
}

/**
 * Key under which two notes or terms are the same lesson (same kind, scope, text and target,
 * accents and case aside), so proposing it again does not pile it up. Symbols have none: two
 * crops of the same item are two examples.
 */
export function agentMemoryKey(input: AgentMemoryInput): string | null {
  if (input.kind === "simbolo") return null;
  return [
    input.kind,
    foldMemoryText(input.scope ?? ""),
    foldMemoryText(input.text),
    foldMemoryText(input.target ?? ""),
  ].join("|");
}

/** The input trimmed, with empty optional fields dropped. Validate with `agentMemoryProblem` first. */
export function cleanAgentMemoryInput(input: AgentMemoryInput): Required<
  Pick<AgentMemoryInput, "kind" | "text" | "scope">
> &
  Pick<AgentMemoryInput, "target" | "image" | "source"> {
  const target = input.target?.trim();
  const source = input.source?.trim().slice(0, MAX_MEMORY_SOURCE);
  return {
    kind: input.kind,
    text: input.text.trim(),
    scope: input.scope?.trim() ?? "",
    ...(target && input.kind !== "nota" ? { target } : {}),
    ...(input.image && input.kind === "simbolo" ? { image: input.image } : {}),
    ...(source ? { source } : {}),
  };
}
