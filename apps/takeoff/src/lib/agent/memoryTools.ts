/**
 * The agent's memory (see memory.ts): what the company has taught it about its drawings, read at
 * the start of a takeoff, and the lessons it proposes back, which wait for the user's approval.
 */
import { oneOf, optStr, str } from "./args";
import { memoryFor } from "./memory";
import { type AgentTool, json, type ToolContent, ToolError } from "./toolTypes";

/** Symbol examples sent per call: each is a picture in the model's context. */
const MAX_SYMBOLS = 12;

const getMemory: AgentTool = {
  name: "get_memory",
  title: "Memória",
  description:
    "What the company has taught about its drawings, to read before starting a takeoff: notes (conventions in free text, e.g. what is out of scope), terms (a text found on drawings and the item it stands for) and symbol examples (a crop of a drawing and what it shows). Entries apply to every takeoff or to one scope (a client or a designer); the takeoff's client is included automatically, and scope adds another (e.g. the designer named in the title block). Follow these over your own assumptions.",
  inputSchema: {
    type: "object",
    properties: {
      scope: { type: "string", description: "Extra client or designer whose entries to include." },
    },
  },
  readOnly: true,
  async run(args, ctx) {
    const project = ctx.project();
    const extra = optStr(args, "scope");
    const scopes = [project.client, ...(extra ? [extra] : [])].filter(Boolean);
    const entries = memoryFor(ctx.memory(), scopes);
    const symbols = entries.filter((e) => e.kind === "simbolo" && e.image);
    const shown = symbols.slice(0, MAX_SYMBOLS);
    const content: ToolContent[] = [
      {
        type: "text",
        text: JSON.stringify({
          scopes,
          notes: entries
            .filter((e) => e.kind === "nota")
            .map((e) => ({ text: e.text, ...(e.scope ? { scope: e.scope } : {}) })),
          terms: entries
            .filter((e) => e.kind === "termo")
            .map((e) => ({
              on_drawing: e.text,
              stands_for: e.target ?? "",
              ...(e.scope ? { scope: e.scope } : {}),
            })),
          symbols: shown.map((e, i) => ({
            picture: i + 1,
            shows: e.text,
            ...(e.target ? { item: e.target } : {}),
            ...(e.scope ? { scope: e.scope } : {}),
          })),
          ...(symbols.length > shown.length
            ? { symbols_omitted: symbols.length - shown.length }
            : {}),
        }),
      },
    ];
    for (const e of shown) {
      content.push({ type: "image", data: e.image ?? "", mimeType: "image/png" });
    }
    return { content };
  },
};

const proposeMemory: AgentTool = {
  name: "propose_memory",
  title: "Propor memória",
  description:
    'Propose a lesson for future takeoffs, when the user corrects you or you work out a convention worth keeping: a note (kind "nota", a rule in one or two sentences in Portuguese) or a term (kind "termo": text as written on drawings, and target, the catalog material, kit or item it stands for). Set scope to the client or designer it applies to, or leave it out when it holds for every drawing. It is stored as a proposal: the user approves it in the app before it is used. Propose only what would change how the next takeoff is done, not facts about this one.',
  inputSchema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["nota", "termo"] },
      text: {
        type: "string",
        description: "nota: the rule. termo: the text as written on drawings.",
      },
      target: { type: "string", description: "termo only: what it stands for." },
      scope: {
        type: "string",
        description: "Client or designer it applies to. Omit for every drawing.",
      },
    },
    required: ["kind", "text"],
  },
  readOnly: false,
  async run(args, ctx) {
    const kind = oneOf(args, "kind", ["nota", "termo"] as const);
    const target = optStr(args, "target");
    if (kind === "termo" && !target) {
      throw new ToolError('A term needs "target": the item the text stands for.');
    }
    try {
      const entry = await ctx.proposeMemory({
        kind,
        text: str(args, "text"),
        target: kind === "termo" ? target : undefined,
        scope: optStr(args, "scope") ?? "",
        source: ctx.project().name,
        status: "proposta",
        origin: "agente",
      });
      ctx.notify("IA: propôs uma memória (aprove em Agente de IA › Memória)");
      return json({
        id: entry.id,
        status: entry.status,
        note:
          entry.status === "ativa"
            ? "This lesson was already in memory."
            : "Stored as a proposal; it is used once the user approves it.",
      });
    } catch (e) {
      throw new ToolError(`Not stored: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

export const MEMORY_TOOLS: AgentTool[] = [getMemory, proposeMemory];
