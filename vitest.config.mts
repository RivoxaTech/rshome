import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Component tests (.test.tsx) opt into a DOM with a `// @vitest-environment jsdom` docblock
    // at the top of the file; everything else (incl. DB integration suites) stays on the default
    // "node" environment, so jsdom never shadows real browser APIs those tests might otherwise
    // rely on accidentally.
    setupFiles: ["./vitest.setup.ts"],
    // The integration suites share one test database and wipe it at the start: one file at a time.
    fileParallelism: false,
    // The checkout integration tests run real transactions, including a deliberate lock wait.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
