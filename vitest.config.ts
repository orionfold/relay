import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";
import path from "path";

import {
  BROWSER_TEST_INCLUDE,
  DEFAULT_TEST_INCLUDE,
  DOM_TEST_INCLUDE,
  E2E_TEST_INCLUDE,
} from "./scripts/test-projects.mjs";

const harnessOptions = {
  globalSetup: ["./src/test/global-setup.ts"],
  setupFiles: ["./src/test/setup.ts"],
  // vi.stubEnv/vi.stubGlobal are test-local by default. The setup file
  // reasserts the worker data directory before each test module loads.
  unstubEnvs: true,
  unstubGlobals: true,
};

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
    projects: [
      {
        extends: true,
        test: {
          ...harnessOptions,
          name: "node",
          environment: "node",
          include: DEFAULT_TEST_INCLUDE,
          // React/hook tests own jsdom. Browser-state fixtures and
          // server-dependent E2E each have an explicit project/config.
          exclude: [...DOM_TEST_INCLUDE, ...BROWSER_TEST_INCLUDE, ...E2E_TEST_INCLUDE],
        },
      },
      {
        extends: true,
        test: {
          ...harnessOptions,
          name: "jsdom",
          environment: "jsdom",
          include: DOM_TEST_INCLUDE,
          exclude: [...BROWSER_TEST_INCLUDE, ...E2E_TEST_INCLUDE],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          globals: true,
          include: BROWSER_TEST_INCLUDE,
          setupFiles: ["./src/test/browser-setup.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
            viewport: { width: 1280, height: 800 },
            screenshotFailures: false,
          },
        },
      },
    ],
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
