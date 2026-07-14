import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/e2e/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 30_000,
    sequence: {
      concurrent: false,
    },
    pool: "forks",
    // Vitest 4 replaced poolOptions.forks.singleFork with this equivalent.
    maxWorkers: 1,
    isolate: false,
  },
});
