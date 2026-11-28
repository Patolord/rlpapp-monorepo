/**
 * Local transcript persistence per takeoff (`project.id`).
 *
 * Stored in the app data folder (next to `agent-memory.json` in Tauri) or in
 * `localStorage` in browser dev mode — never inside `*.takeoff.json` project
 * files, and never containing raw base64 images. Keeps conversations resumable
 * across reloads or crashes while keeping disk footprint tiny.
 */

import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../../platform";

export interface TranscriptToolItem {
  id: string;
  toolName: string;
  label: string;
  status: "running" | "done" | "error";
  summary?: string;
}

export interface TranscriptMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools?: TranscriptToolItem[];
  createdAt: number;
}

export interface AgentTranscript {
  version: 1;
  projectId: string;
  lastRunId: string | null;
  messages: TranscriptMessage[];
  updatedAt: number;
}

const MAX_TRANSCRIPT_MESSAGES = 80;
const MAX_TRANSCRIPT_TEXT_LEN = 24_000;
const LS_PREFIX = "takeoff.agentTranscript.";

export function emptyTranscript(projectId: string): AgentTranscript {
  return {
    version: 1,
    projectId,
    lastRunId: null,
    messages: [],
    updatedAt: Date.now(),
  };
}

function safeProjectKey(projectId: string): string {
  const cleaned = projectId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return cleaned || "default";
}

function clipText(value: unknown, max = MAX_TRANSCRIPT_TEXT_LEN): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/** Parses any stored JSON into a valid `AgentTranscript`, dropping malformed items. */
export function parseTranscript(raw: unknown, projectId: string): AgentTranscript {
  if (!raw || typeof raw !== "object") return emptyTranscript(projectId);
  const obj = raw as Record<string, unknown>;
  const rawMessages = Array.isArray(obj.messages) ? obj.messages : [];
  const messages: TranscriptMessage[] = [];

  for (const item of rawMessages) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    if (m.role !== "user" && m.role !== "assistant") continue;
    const id = clipText(m.id, 64).trim();
    if (!id) continue;
    const text = clipText(m.text);
    const tools: TranscriptToolItem[] = [];
    if (Array.isArray(m.tools)) {
      for (const rawTool of m.tools) {
        if (!rawTool || typeof rawTool !== "object") continue;
        const t = rawTool as Record<string, unknown>;
        const tid = clipText(t.id, 64).trim();
        const toolName = clipText(t.toolName, 64).trim();
        const label = clipText(t.label, 200).trim();
        if (!tid || !toolName || !label) continue;
        // Persisted "running" entries after a reload/crash become "done" or "error".
        const status = t.status === "error" ? "error" : "done";
        const summary = clipText(t.summary, 240).trim() || undefined;
        tools.push({ id: tid, toolName, label, status, ...(summary ? { summary } : {}) });
      }
    }
    messages.push({
      id,
      role: m.role,
      text,
      ...(tools.length > 0 ? { tools } : {}),
      createdAt: typeof m.createdAt === "number" && Number.isFinite(m.createdAt) ? m.createdAt : 0,
    });
  }

  return {
    version: 1,
    projectId,
    lastRunId: typeof obj.lastRunId === "string" && obj.lastRunId ? obj.lastRunId : null,
    messages: messages.slice(-MAX_TRANSCRIPT_MESSAGES),
    updatedAt:
      typeof obj.updatedAt === "number" && Number.isFinite(obj.updatedAt) ? obj.updatedAt : 0,
  };
}

/**
 * Derives a transcript file path in Tauri's app data directory next to
 * `agent_memory_path` so we reuse existing Rust file commands with zero new
 * native IPC surface.
 */
async function transcriptFilePath(projectId: string): Promise<string> {
  const memoryPath = await invoke<string>("agent_memory_path");
  const sep = memoryPath.includes("\\") ? "\\" : "/";
  const idx = memoryPath.lastIndexOf(sep);
  const dir = idx >= 0 ? memoryPath.slice(0, idx) : ".";
  return `${dir}${sep}agent-transcript-${safeProjectKey(projectId)}.json`;
}

export async function loadAgentTranscript(projectId: string): Promise<AgentTranscript> {
  try {
    let text: string | null = null;
    if (isTauri()) {
      const path = await transcriptFilePath(projectId);
      if (await invoke<boolean>("file_exists", { path })) {
        text = await invoke<string>("read_text", { path });
      }
    } else if (typeof localStorage !== "undefined") {
      text = localStorage.getItem(`${LS_PREFIX}${safeProjectKey(projectId)}`);
    }
    return text ? parseTranscript(JSON.parse(text), projectId) : emptyTranscript(projectId);
  } catch (e) {
    console.warn("agent transcript could not be read", e);
    return emptyTranscript(projectId);
  }
}

export async function saveAgentTranscript(transcript: AgentTranscript): Promise<void> {
  const bounded: AgentTranscript = {
    ...transcript,
    version: 1,
    messages: transcript.messages.slice(-MAX_TRANSCRIPT_MESSAGES),
    updatedAt: Date.now(),
  };
  const contents = JSON.stringify(bounded);
  try {
    if (isTauri()) {
      const path = await transcriptFilePath(transcript.projectId);
      await invoke("write_text", { path, contents });
    } else if (typeof localStorage !== "undefined") {
      localStorage.setItem(`${LS_PREFIX}${safeProjectKey(transcript.projectId)}`, contents);
    }
  } catch (e) {
    console.warn("agent transcript could not be saved", e);
  }
}
