import { defineConfig } from "tsup";
import { readFileSync } from "fs";
import { resolve } from "path";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig({
  entry: {
    cli: "bin/cli.ts",
    "relay-host": "bin/relay-host.ts",
  },
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  splitting: false,
  banner: { js: "#!/usr/bin/env node" },
  external: [...Object.keys(pkg.dependencies || {})],
  // Next.js resolves `server-only` as a compile-time client-boundary marker.
  // The CLI is also a trusted server runtime, but esbuild does not know that
  // virtual module. Alias only the CLI bundle to an empty marker so the source
  // keeps its accidental-client-import guard without adding a runtime package.
  esbuildOptions(options) {
    options.alias = {
      ...options.alias,
      "server-only": resolve("scripts/shims/server-only.mjs"),
    };
  },
  // Embed the core version at build time so the bundled CLI never has to
  // rediscover it via a fragile runtime package.json lookup (see
  // relayCoreVersion() in src/lib/packs/install.ts). Undefined in dev/test/
  // Next.js builds, where install.ts falls back to the runtime lookup.
  define: { __RELAY_CORE_VERSION__: JSON.stringify(pkg.version) },
});
