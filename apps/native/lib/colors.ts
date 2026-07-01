// Keep these values in sync with `tailwind.config.js` so the imperative
// background (used by Container/Stack) matches the `bg-background` utility.
export const COLORS = {
  light: {
    background: "#d3e3f0",
    foreground: "#0a0a0f",
  },
  dark: {
    background: "#121924",
    foreground: "#fafafa",
  },
} as const;
