import { defineConfig } from "tsup";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig({
  entry: ["bin/cli.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  splitting: false,
  banner: { js: "#!/usr/bin/env node" },
  external: [...Object.keys(pkg.dependencies || {})],
  // Embed the core version at build time so the bundled CLI never has to
  // rediscover it via a fragile runtime package.json lookup (see
  // relayCoreVersion() in src/lib/packs/install.ts). Undefined in dev/test/
  // Next.js builds, where install.ts falls back to the runtime lookup.
  define: { __RELAY_CORE_VERSION__: JSON.stringify(pkg.version) },
});
