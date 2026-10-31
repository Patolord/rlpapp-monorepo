/** Platform-aware names for modifier keys, so hints read ⌘/⌥ on a Mac and Ctrl/Alt elsewhere. */
export const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

export const MOD = IS_MAC ? "⌘" : "Ctrl";
export const ALT = IS_MAC ? "⌥" : "Alt";

/** "Ctrl+K" or "⌘K" style shortcut label. */
export const mod = (key: string) => (IS_MAC ? `${MOD}${key}` : `${MOD}+${key}`);

/** Running inside the Tauri window (native dialogs, file IO through Rust) rather than a browser tab. */
export const isTauri = (): boolean => "__TAURI_INTERNALS__" in window;

/** The key event is aimed at a text field, where the app's single-key shortcuts must stay quiet. */
export function isEditableTarget(e: Event): boolean {
  const t = e.target as HTMLElement | null;
  return (
    !!t &&
    (t.tagName === "INPUT" ||
      t.tagName === "TEXTAREA" ||
      t.tagName === "SELECT" ||
      t.isContentEditable)
  );
}
