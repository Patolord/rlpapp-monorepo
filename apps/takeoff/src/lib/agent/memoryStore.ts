/**
 * Where the agent's memory lives: one JSON file per machine, in the app data folder beside the
 * catalog (localStorage in browser dev mode). Sharing it with the whole company through the
 * backend is the next step; the model (memory.ts) already carries what that needs.
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../platform";
import { type AgentMemory, emptyMemory, parseMemory } from "./memory";

const LS_KEY = "takeoff.agentMemory";

export async function loadAgentMemory(): Promise<AgentMemory> {
  try {
    let text: string | null = null;
    if (isTauri()) {
      const path = await invoke<string>("agent_memory_path");
      if (await invoke<boolean>("file_exists", { path })) {
        text = await invoke<string>("read_text", { path });
      }
    } else {
      text = localStorage.getItem(LS_KEY);
    }
    return text ? parseMemory(JSON.parse(text)) : emptyMemory();
  } catch (e) {
    console.warn("agent memory could not be read", e);
    return emptyMemory();
  }
}

export async function saveAgentMemory(memory: AgentMemory): Promise<void> {
  const contents = JSON.stringify(memory, null, 2);
  if (isTauri()) {
    const path = await invoke<string>("agent_memory_path");
    await invoke("write_text", { path, contents });
  } else {
    localStorage.setItem(LS_KEY, contents);
  }
}
