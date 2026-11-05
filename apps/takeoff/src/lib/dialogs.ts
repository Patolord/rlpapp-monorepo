import { ask, message } from "@tauri-apps/plugin-dialog";
import { isTauri } from "./platform";

/**
 * Yes/no question. Inside the app it is a native dialog (window.confirm is unreliable in the
 * WebView and missing on macOS); in the browser dev mode it falls back to window.confirm.
 */
export async function confirmDialog(message: string, title = "RLP Takeoff"): Promise<boolean> {
  if (!isTauri()) return window.confirm(message);
  return ask(message, { title, kind: "warning", okLabel: "Continuar", cancelLabel: "Cancelar" });
}

export type Choice = "yes" | "no" | "cancel";

/**
 * Question with three answers (two actions and Cancel), native inside the app. The dialog
 * plugin answers with the button's label for custom buttons on some platforms and with
 * Yes/No/Cancel on others, so both are accepted.
 */
export async function chooseDialog(
  text: string,
  labels: { yes: string; no: string; cancel: string },
  title = "RLP Takeoff",
): Promise<Choice> {
  if (!isTauri()) {
    if (window.confirm(`${text}\n\nOK: ${labels.yes}`)) return "yes";
    return window.confirm(`${labels.no}?`) ? "no" : "cancel";
  }
  const r = await message(text, { title, kind: "warning", buttons: labels });
  if (r === "Yes" || r === labels.yes) return "yes";
  if (r === "No" || r === labels.no) return "no";
  return "cancel";
}
