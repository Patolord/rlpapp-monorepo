/**
 * Adapts the shared `AGENT_TOOLS` registry (used by the local MCP server) into
 * Vercel AI SDK v7 `tool()` definitions so every tool added to `AGENT_TOOLS`
 * works identically in both the built-in agent and external MCP clients.
 */

import { type JSONSchema7, jsonSchema, type ToolSet, tool } from "ai";
import type { AgentContext } from "../context";
import { AGENT_TOOLS } from "../tools";
import { type AgentTool, ToolError, type ToolResult } from "../toolTypes";

export interface ToolActivityHooks {
  onToolStart?: (event: { toolName: string; label: string; args: Record<string, unknown> }) => void;
  onToolFinish?: (event: {
    toolName: string;
    label: string;
    isError: boolean;
    summary: string;
  }) => void;
}

/** Friendly Portuguese one-liner shown in the chat panel while a tool runs. */
export function formatToolStartLabel(toolName: string, args: Record<string, unknown>): string {
  const page = typeof args.page === "number" ? args.page : null;
  const name = typeof args.name === "string" ? args.name.trim() : "";
  const query = typeof args.query === "string" ? args.query.trim() : "";

  switch (toolName) {
    case "get_memory":
      return "Lendo a memória da empresa…";
    case "propose_memory":
      return "Propondo uma lição na memória…";
    case "get_takeoff":
      return "Lendo o estado do takeoff…";
    case "list_markings":
      return page ? `Listando marcações da página ${page}…` : "Listando marcações…";
    case "view_page":
      return page ? `Visualizando a página ${page}…` : "Visualizando a planta…";
    case "read_text":
      return page ? `Lendo textos da página ${page}…` : "Lendo textos da planta…";
    case "detect_room":
      return "Detectando contorno do ambiente…";
    case "find_similar":
      return "Procurando símbolos semelhantes…";
    case "measure":
      return "Medindo distância na planta…";
    case "search_catalog":
      return query ? `Buscando "${query}" no catálogo…` : "Buscando no catálogo…";
    case "list_kits":
      return "Consultando kits da empresa…";
    case "set_scale":
      return page ? `Definindo escala da página ${page}…` : "Definindo escala…";
    case "create_item":
      return name ? `Criando item "${name}"…` : "Criando item no orçamento…";
    case "create_location":
      return name ? `Criando ambiente "${name}"…` : "Criando ambiente…";
    case "add_markings":
      return "Adicionando marcações sugeridas…";
    case "add_kit_run":
      return "Aplicando kit na planta…";
    case "remove_suggestions":
      return "Removendo sugestões anteriores…";
    case "review_takeoff":
      return "Revisando cobertura e inventário…";
    default:
      return `Executando ${toolName}…`;
  }
}

/** Short Portuguese summary after a tool finishes (never embeds base64 images). */
export function formatToolFinishSummary(
  toolName: string,
  args: Record<string, unknown>,
  result: ToolResult,
): string {
  if (result.isError) {
    const errText = result.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join(" ")
      .trim();
    return errText ? `Aviso: ${errText.slice(0, 140)}` : `Falha em ${toolName}`;
  }
  const page = typeof args.page === "number" ? args.page : null;
  const name = typeof args.name === "string" ? args.name.trim() : "";
  switch (toolName) {
    case "get_memory":
      return "Memória carregada";
    case "propose_memory":
      return "Lição proposta na memória";
    case "get_takeoff":
      return "Resumo do takeoff lido";
    case "view_page":
      return page ? `Página ${page} analisada` : "Planta analisada";
    case "read_text":
      return page ? `Textos da página ${page} lidos` : "Textos lidos";
    case "set_scale":
      return page ? `Escala da página ${page} definida` : "Escala definida";
    case "create_location":
      return name ? `Ambiente "${name}" sugerido` : "Ambiente sugerido";
    case "create_item":
      return name ? `Item "${name}" pronto` : "Item criado";
    case "add_markings": {
      const shapes = Array.isArray(args.shapes) ? args.shapes.length : null;
      return shapes
        ? `${shapes} ${shapes === 1 ? "marcação sugerida" : "marcações sugeridas"}`
        : "Marcações sugeridas";
    }
    case "add_kit_run":
      return "Trecho de kit sugerido";
    case "find_similar":
      return "Símbolos semelhantes buscados";
    case "search_catalog":
      return "Catálogo consultado";
    case "list_kits":
      return "Kits consultados";
    case "review_takeoff":
      return "Revisão concluída";
    default:
      return `${toolName} concluído`;
  }
}

/**
 * Converts a `ToolResult` from `AgentTool.run()` into an AI SDK v7
 * `LanguageModelV4ToolResultOutput`. Images stay base64 strings (never
 * `Uint8Array` / `Buffer`, which is absent in browser/webview runtimes).
 */
export function toolResultToModelOutput(result: ToolResult) {
  const texts = result.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text);

  if (result.isError) {
    return {
      type: "error-text" as const,
      value: texts.join("\n") || "Tool execution failed.",
    };
  }

  const hasImages = result.content.some((c) => c.type === "image");
  if (!hasImages) {
    return {
      type: "text" as const,
      value: texts.join("\n"),
    };
  }

  return {
    type: "content" as const,
    value: result.content.map((part) => {
      if (part.type === "text") {
        return { type: "text" as const, text: part.text };
      }
      return {
        type: "file" as const,
        mediaType: part.mimeType,
        data: {
          type: "data" as const,
          data: part.data,
        },
      };
    }),
  };
}

function adaptSingleTool(agentTool: AgentTool, ctx: AgentContext, hooks?: ToolActivityHooks) {
  return tool({
    description: agentTool.description,
    inputSchema: jsonSchema<Record<string, unknown>>(
      agentTool.inputSchema as unknown as JSONSchema7,
    ),
    execute: async (args): Promise<ToolResult> => {
      const safeArgs = args && typeof args === "object" ? args : {};
      const label = formatToolStartLabel(agentTool.name, safeArgs);
      hooks?.onToolStart?.({ toolName: agentTool.name, label, args: safeArgs });
      let result: ToolResult;
      try {
        result = await agentTool.run(safeArgs, ctx);
      } catch (err) {
        if (err instanceof ToolError) {
          result = { content: [{ type: "text", text: err.message }], isError: true };
        } else {
          const message = err instanceof Error ? err.message : String(err);
          result = { content: [{ type: "text", text: message }], isError: true };
        }
      }
      hooks?.onToolFinish?.({
        toolName: agentTool.name,
        label,
        isError: Boolean(result.isError),
        summary: formatToolFinishSummary(agentTool.name, safeArgs, result),
      });
      return result;
    },
    toModelOutput: ({ output }) => toolResultToModelOutput(output),
  });
}

/** Build the complete AI SDK `ToolSet` from `AGENT_TOOLS` (or a custom list in tests). */
export function buildAiSdkTools(
  ctx: AgentContext,
  hooks?: ToolActivityHooks,
  tools: readonly AgentTool[] = AGENT_TOOLS,
): ToolSet {
  const out: ToolSet = {};
  for (const agentTool of tools) {
    out[agentTool.name] = adaptSingleTool(agentTool, ctx, hooks);
  }
  return out;
}
