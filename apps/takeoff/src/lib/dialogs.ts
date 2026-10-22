import { ask } from "@tauri-apps/plugin-dialog";

const isTauri = () => "__TAURI_INTERNALS__" in window;

/**
 * Yes/no question. Inside the app it is a native dialog (window.confirm is unreliable in the
 * WebView and missing on macOS); in the browser dev mode it falls back to window.confirm.
 */
export async function confirmDialog(message: string, title = "RLP Takeoff"): Promise<boolean> {
  if (!isTauri()) return window.confirm(message);
  return ask(message, { title, kind: "warning", okLabel: "Continuar", cancelLabel: "Cancelar" });
}
