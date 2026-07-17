import { readFileSync } from "node:fs";
import {
  PHASE_PRODUCTION_BUILD,
  PHASE_DEVELOPMENT_SERVER,
} from "next/constants.js";

// When the operator opts into LAN binding (`--hostname` to a non-loopback host,
// see bin/cli.ts), the CLI sets RELAY_ALLOW_LAN_ORIGINS=true. In dev mode Next
// otherwise blocks cross-origin requests to /_next/* dev assets from the LAN
// client's IP — which silently breaks the whole app over the network (issue
// #13). The client IP is unknowable at config-load time (the bind host is
// 0.0.0.0 = "all interfaces"), and Next's matcher explicitly rejects a bare
// "*"/"**" catch-all, so we allow every RFC1918 private-network range instead.
// This matches the "trusted network" assumption the --hostname warning already
// states, while still blocking public origins. (Prod `next start` has no such
// gate; this only affects the dev-mode npx path.)
const RFC1918_DEV_ORIGINS = [
  "10.*.*.*",
  "192.168.*.*",
  // 172.16.0.0/12 — Next's matcher globs per-octet, so enumerate 16–31.
  ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`),
];
const allowLanDevOrigins = process.env.RELAY_ALLOW_LAN_ORIGINS === "true";
const isRelayOciBuild = process.env.RELAY_OCI_BUILD === "true";

// Build-time core version, mirroring tsup's `define` (tsup.config.ts). tsup
// only builds the CLI bundle (dist/cli.js), so WITHOUT this the Next.js server
// leaves `__RELAY_CORE_VERSION__` undefined — relayCoreVersion() then falls to
// its "0.0.0" default and every /packs UI install is rejected with
// `requires relay-core >=X, but this install is 0.0.0` (fix-packs-ui-install-
// core-version). We inject it via `compiler.defineServer` below, which Next
// applies to BOTH bundlers (webpack for `next build`, Turbopack for `next dev`)
// so the server resolves the real version exactly as the shipped CLI does.
// `defineServer` (not `define`) because relayCoreVersion() is server-only —
// keeps the value out of client bundles. Single source of truth: pkg.version.
//
// NOTE: pass the RAW version string, NOT `JSON.stringify(...)`. Next's
// `compiler.define` takes literal values and quotes them itself, unlike tsup's
// `define` which takes JS-source text. Stringifying here would inject the
// double-quoted `"0.23.0"`, which fails `semver.valid()` and silently falls
// back to the "0.0.0" default — reintroducing the exact bug this fixes.
const CORE_VERSION_DEFINE = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8")
).version;

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(isRelayOciBuild
    ? {
        output: "standalone",
        // Page-data workers import server modules that bootstrap SQLite. One
        // build-only worker prevents independent processes from racing the
        // same temporary database; runtime concurrency is unaffected.
        experimental: { cpus: 1 },
      }
    : {}),
  serverExternalPackages: ["better-sqlite3", "pdf-parse", "pdfjs-dist"],
  devIndicators: false,
  allowedDevOrigins: allowLanDevOrigins
    ? ["127.0.0.1", ...RFC1918_DEV_ORIGINS]
    : ["127.0.0.1"],
  // The in-app kindle reader was removed; the book lives at ainative.business.
  // Redirect legacy /book links (and any chapter-anchored deep links) there.
  async redirects() {
    return [
      {
        source: "/book/:path*",
        destination: "https://ainative.business/book",
        permanent: true,
      },
      {
        source: "/book",
        destination: "https://ainative.business/book",
        permanent: true,
      },
    ];
  },
};

// Phase-aware export. `compiler.defineServer` is a COMPILE-TIME directive — it
// only does anything while a bundler runs (build + dev). At runtime `next start`
// re-reads this config but never recompiles, so the define is inert there AND
// Next's config validator emits a spurious "defineServer.__RELAY_CORE_VERSION__
// is missing, expected boolean" warning (a false positive from its union-error
// flattener — the string value is valid; see next/dist/shared/lib/zod.js). That
// warning would land in every customer's prod server log. So we attach
// defineServer ONLY in the build/dev phases, keeping the shipped `next start`
// path warning-free while the version is already baked into `.next`.
export default function config(phase) {
  if (
    phase === PHASE_PRODUCTION_BUILD ||
    phase === PHASE_DEVELOPMENT_SERVER
  ) {
    return {
      ...nextConfig,
      compiler: {
        ...nextConfig.compiler,
        defineServer: {
          __RELAY_CORE_VERSION__: CORE_VERSION_DEFINE,
        },
      },
    };
  }
  return nextConfig;
}
