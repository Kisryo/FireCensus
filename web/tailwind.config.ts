import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        space: "#0B0F1A",
        panel: "#111827",
        line: "#1F2A44",
        fire: "#FF6B35",
        sat: "#4FC3F7",
        aqua: "#FFB74D",
        snpp: "#4FC3F7",
        noaa20: "#64B5F6",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
