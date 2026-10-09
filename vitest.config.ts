import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  // The components import through the same "@/" alias as the app.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    globals: true,
    reporters: ["default"],
  },
  // Next keeps `jsx: "preserve"` in tsconfig; esbuild needs the automatic
  // runtime so the component tests (*.test.tsx, jsdom via docblock) can run.
  esbuild: { jsx: "automatic" },
});
