/**
 * Shape of the tools the app offers to an AI agent over MCP (see protocol.ts). A tool is a name,
 * a description the model reads, a JSON Schema of its arguments and a function over the
 * `AgentContext` (context.ts), so the tools run against the real app or a fake in tests.
 */
import type { AgentContext } from "./context";

export type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
}

/** The subset of JSON Schema the tool definitions use. */
export interface JsonSchema {
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean";
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: readonly (string | number)[];
  minimum?: number;
  maximum?: number;
  minItems?: number;
  additionalProperties?: boolean;
}

export interface AgentTool {
  name: string;
  /** Short human name shown by MCP clients. */
  title: string;
  description: string;
  inputSchema: JsonSchema & { type: "object" };
  /** True when the tool never changes the takeoff (MCP `readOnlyHint`). */
  readOnly: boolean;
  run(args: Record<string, unknown>, ctx: AgentContext): Promise<ToolResult>;
}

/**
 * A failure the model can act on (a bad argument, a room that does not close): it goes back as
 * a tool result with `isError`, not as a protocol error.
 */
export class ToolError extends Error {}

export const text = (value: string): ToolResult => ({ content: [{ type: "text", text: value }] });

/** A JSON tool result; numbers are kept short so coordinates do not flood the context. */
export const json = (value: unknown): ToolResult => text(JSON.stringify(value));

/** Round to one decimal: page coordinates are PDF points, a tenth of a point is ~0.035 mm. */
export const r1 = (v: number): number => Math.round(v * 10) / 10;
