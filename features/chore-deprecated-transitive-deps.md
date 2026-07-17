---
title: Clean up deprecated transitive dependencies (npm install warnings)
status: accepted
priority: P3
milestone: post-mvp
source: customer install log (issue #1 npx output)
dependencies: []
---

# Clean up deprecated transitive dependencies (npm install warnings)

## Description

`npx orionfold-relay` / `npm install` prints a wall of `npm warn deprecated`
lines (surfaced in customer issue #1's install log). They are cosmetically
alarming for new users — the first thing Harun saw before the crash — and one
(`glob@7`) is flagged for known security vulnerabilities.

**All 9 are transitive, not direct deps** (reverified 2026-07-16 — none appear in
`package.json` dependencies/devDependencies). So they can't be bumped directly;
they resolve only when the upstream packages that pull them in update, or by
forcing versions via npm `overrides`.

Deprecated packages observed:

| Package | Note |
|---|---|
| `glob@7.2.3` | **Security** — old glob has publicized vulns; upstreams should be on glob@10+ |
| `rimraf@2.7.1` | Unsupported pre-v4 |
| `inflight@1.0.6` | Leaks memory; author points to `lru-cache` |
| `uuid@8.3.2` | uuid@10 and below unsupported |
| `lodash.isequal@4.5.0` | Superseded by `node:util` `isDeepStrictEqual` |
| `fstream@1.0.12` | No longer supported |
| `prebuild-install@7.1.3` | Unmaintained (native-addon prebuild fetcher) |
| `@esbuild-kit/esm-loader@2.6.5` | Drizzle Kit development-only loader, merged into `tsx` |
| `@esbuild-kit/core-utils@3.3.2` | Drizzle Kit development-only helper, merged into `tsx` |

## Technical Approach

1. **Attribute each warning** — `npm why <pkg>` to find the direct dependency
   pulling it in. Group by owning direct dep (several likely trace to
   `better-sqlite3`'s native-addon toolchain — `prebuild-install`, `fstream`,
   `rimraf` — and to older CLI/tooling deps).
2. **Prefer upstream bumps** — if bumping a direct dep to its latest already
   pulls a modern `glob`/`rimraf`/`uuid`, do that. Cheapest, no override debt.
3. **Use `overrides` only where upstream is stale** — pin `glob`, `rimraf`,
   `uuid` to modern majors via `package.json` `overrides` when the owning dep
   won't update. Verify each override doesn't break the consumer (esp. native
   addons — `better-sqlite3` rebuild must still succeed).
4. **Prioritize `glob@7`** (the only security-flagged one) if doing a partial
   pass; the rest are noise-reduction.

## Acceptance Criteria

- [x] Every remaining deprecated package is attributed to an upstream owner;
      unsafe major overrides are rejected and guarded as bounded debt.
- [x] `npm install` on a clean checkout prints exactly the accepted deprecation
      warnings (the nine above are currently upstream-owned and guarded as
      unfixable, with a note explaining why).
- [x] `npm run build:cli` + full test suite green after the safe updates.
- [x] `better-sqlite3` native Linux load and real PDF parse succeed in the G-080
      artifact; `pdfjs-dist` stays owned by `pdf-parse` and explicitly external.

## Scope Boundaries

**Included:** attribute + reduce the 7 deprecated transitive warnings above,
via upstream bumps and/or `overrides`.

**Excluded:** a full dependency-freshness audit / major-version upgrade sweep of
all direct deps (separate, larger effort). Only the deprecation warnings here.

## Notes

- Low risk, low urgency (P3) — no functional bug, purely install-time hygiene +
  one security-flagged transitive. Good "clean checkout" or first-impression
  polish item. See memory [[cli-startup-robustness]] for the issue #1 context
  where these first surfaced.

## Acceptance receipt — 2026-07-16

G-034 was absorbed and accepted by G-080. Safe upstream updates reduced the
initial clean-install advisory set from 25 (including 3 critical) to 8 moderate
overall / 4 moderate in production. The remaining production paths are the
Next-owned PostCSS advisory and ExcelJS-owned UUID advisory; npm's forced fixes
would install breaking historical Next/ExcelJS versions and were rejected.

`config/install-dependency-debt.json` freezes the exact nine deprecations and
owners. `npm ci`, `npm ls --depth=0`, the debt guard, native/PDF artifact tests,
TypeScript, CLI build, 3,590-test suite, and the full G-080 Docker smoke passed.
