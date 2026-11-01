/** @type {import('tailwindcss').Config} */
// Keep these values in sync with `lib/theme.ts` (the source of truth) so
// className-based legacy screens and the token-based components share one palette.
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./App.{js,jsx,ts,tsx}",
    "../../packages/ui/src/native/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        border: "#D6DEEC",
        input: "#D6DEEC",
        ring: "#155DFC",
        background: "#F6F9FD",
        foreground: "#1B2A5E",
        primary: {
          DEFAULT: "#155DFC",
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "#EEF3FA",
          foreground: "#1B2A5E",
        },
        destructive: {
          DEFAULT: "#C8402E",
          foreground: "#FFFFFF",
        },
        muted: {
          DEFAULT: "#EEF3FA",
          foreground: "#4A5A8A",
        },
        accent: {
          DEFAULT: "#EFF6FF",
          foreground: "#1B2A5E",
        },
        card: {
          DEFAULT: "#FFFFFF",
          foreground: "#1B2A5E",
        },
      },
      borderRadius: {
        lg: "16px",
        md: "12px",
        sm: "10px",
      },
    },
  },
  plugins: [],
};
