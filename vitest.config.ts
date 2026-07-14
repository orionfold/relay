import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Next.js's `server-only` marker package isn't resolvable from vitest's
      // Node environment. Alias to its empty stub so server-only modules can
      // be imported and tested directly.
      "server-only": path.resolve(
        __dirname,
        "./node_modules/next/dist/compiled/server-only/empty.js"
      ),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
    // Server-dependent tests have their own node/single-fork configuration and
    // must not be collected by the default unit/integration command.
    exclude: ["src/__tests__/e2e/**"],
    coverage: {
      provider: "v8",
      // Vitest 4 otherwise reports only modules imported during the run, which
      // hides completely untested production files and inflates the headline.
      include: ["src/**/*.{ts,tsx}", "bin/**/*.ts"],
      reporter: ["text-summary", "json-summary", "html"],
      reportOnFailure: true,
      exclude: [
        "src/test/**",
        "src/**/__tests__/**",
        "**/*.d.ts",
        "src/app/layout.tsx",
        "src/app/error.tsx",
        "src/app/global-error.tsx",
      ],
    },
  },
});
