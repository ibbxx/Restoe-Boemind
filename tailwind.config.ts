import type { Config } from "tailwindcss";

/**
 * Enterprise procurement UI tokens: dense tables, muted surfaces, one accent.
 * Desktop-first (PRD §24 / Phase 3 §19).
 */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        rbi: {
          navy: "#071b4d",
          blue: "#0d2b72",
          red: "#ed1c24",
          redDark: "#c9141b",
          cream: "#f7f8fb",
        },
        ink: {
          900: "#0f172a",
          800: "#1e293b",
          700: "#334155",
          600: "#475569",
          500: "#64748b",
          400: "#94a3b8",
          300: "#cbd5e1",
          200: "#e2e8f0",
          100: "#f1f5f9",
          50: "#f8fafc",
        },
        accent: {
          700: "#1d4ed8",
          600: "#2563eb",
          500: "#3b82f6",
          100: "#dbeafe",
          50: "#eff6ff",
        },
        positive: { 700: "#15803d", 100: "#dcfce7", 50: "#f0fdf4" },
        negative: { 700: "#b91c1c", 100: "#fee2e2", 50: "#fef2f2" },
        caution: { 700: "#b45309", 100: "#fef3c7", 50: "#fffbeb" },
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.06), 0 1px 3px 0 rgb(15 23 42 / 0.04)",
      },
    },
  },
  plugins: [],
} satisfies Config;
