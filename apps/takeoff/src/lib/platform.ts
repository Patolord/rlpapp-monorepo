/** Platform-aware names for modifier keys, so hints read ⌘/⌥ on a Mac and Ctrl/Alt elsewhere. */
export const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

export const MOD = IS_MAC ? "⌘" : "Ctrl";
export const ALT = IS_MAC ? "⌥" : "Alt";

/** "Ctrl+K" or "⌘K" style shortcut label. */
export const mod = (key: string) => (IS_MAC ? `${MOD}${key}` : `${MOD}+${key}`);
