import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { create } from "zustand";

export interface UpdateState {
  /** A newer version is available and ready to be installed. */
  available: { version: string; notes: string; date: string | null } | null;
  /** 0..1 while downloading, null otherwise. */
  progress: number | null;
  installing: boolean;
  error: string | null;
  checkedAt: string | null;
}

export const useUpdate = create<UpdateState>(() => ({
  available: null,
  progress: null,
  installing: false,
  error: null,
  checkedAt: null,
}));

let pending: Update | null = null;
const isTauri = () => "__TAURI_INTERNALS__" in window;

/** Ask the update endpoint for a newer version; silent when offline or outside Tauri. */
export async function checkForUpdate(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const update = await check({ timeout: 15_000 });
    useUpdate.setState({ checkedAt: new Date().toISOString(), error: null });
    if (!update) {
      pending = null;
      useUpdate.setState({ available: null });
      return false;
    }
    pending = update;
    useUpdate.setState({
      available: { version: update.version, notes: update.body ?? "", date: update.date ?? null },
    });
    return true;
  } catch (e) {
    useUpdate.setState({ error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

/** Download, install and restart into the new version. */
export async function installUpdate(): Promise<void> {
  if (!pending) return;
  useUpdate.setState({ installing: true, progress: 0, error: null });
  let total = 0;
  let got = 0;
  try {
    await pending.downloadAndInstall((ev) => {
      if (ev.event === "Started") total = ev.data.contentLength ?? 0;
      else if (ev.event === "Progress") {
        got += ev.data.chunkLength;
        useUpdate.setState({ progress: total ? Math.min(1, got / total) : null });
      } else if (ev.event === "Finished") useUpdate.setState({ progress: 1 });
    });
    await relaunch();
  } catch (e) {
    useUpdate.setState({
      installing: false,
      progress: null,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
