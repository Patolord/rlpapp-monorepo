import { MEMORY_TOOLS } from "./memoryTools";
import { READ_TOOLS } from "./readTools";
import type { AgentTool } from "./toolTypes";
import { WRITE_TOOLS } from "./writeTools";

/** Every tool the app offers to an AI agent, in the order a takeoff uses them. */
export const AGENT_TOOLS: readonly AgentTool[] = [...MEMORY_TOOLS, ...READ_TOOLS, ...WRITE_TOOLS];
