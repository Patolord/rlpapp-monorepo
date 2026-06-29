/** @type {import('tailwindcss').Config} */
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
        border: "#e5e5e5",
        input: "#e5e5e5",
        ring: "#1a1a2e",
        background: "#d3e3f0",
        foreground: "#0a0a0f",
        primary: {
          DEFAULT: "#1a1a2e",
          foreground: "#fafafa",
        },
        secondary: {
          DEFAULT: "#f4f4f5",
          foreground: "#1a1a2e",
        },
        destructive: {
          DEFAULT: "#ef4444",
          foreground: "#fafafa",
        },
        muted: {
          DEFAULT: "#f4f4f5",
          foreground: "#737373",
        },
        accent: {
          DEFAULT: "#f4f4f5",
          foreground: "#1a1a2e",
        },
        card: {
          DEFAULT: "#ffffff",
          foreground: "#0a0a0f",
        },
      },
    },
  },
  plugins: [],
};
