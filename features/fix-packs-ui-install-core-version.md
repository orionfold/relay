---
title: Fix — /packs UI install rejects every pack (relay-core resolves to 0.0.0 in the Next.js server)
status: planned
priority: P0
milestone: mvp
source: staging full-suite walkthrough 2026-07-02 finding [J7-4] (output/staging/2026-07-02-full-suite/FINDINGS.md)
dependencies: []
---

# Fix: /packs UI "Install" is DOA on npx (core version 0.0.0 in the Next.js runtime)

## Description

On a real `npx orionfold-relay` install, clicking **Install** (or **Install with
license**) on the `/packs` gallery rejects EVERY pack — free and premium — before
the license gate even runs:

```
Pack relay-agency-pro@0.2.0 requires relay-core >=0.18.0, but this install is 0.0.0.
(HTTP 422, code: pack_invalid)
```

The headline PLG conversion surface (#20 gallery) is non-functional end to end. A
customer can only install a pack by dropping to the CLI (`relay pack add ...`),
which resolves the version correctly.

## Root cause (verified at code, staging 0.23.0)

`relayCoreVersion()` (`src/lib/packs/install.ts:31`) resolves the version in three
steps:

1. **Build-time define** — returns `__RELAY_CORE_VERSION__` if present.
2. **getAppRoot fallback** — walks up to `package.json` and reads `version`.
3. **Conservative default** — returns `"0.0.0"`.

The define is injected by **`tsup.config.ts`** (`define: { __RELAY_CORE_VERSION__:
JSON.stringify(pkg.version) }`) — but tsup only builds the **CLI bundle**
(`dist/cli.js`). The pack-install API route runs inside the **Next.js server**
(the prebuilt artifact), and:

- `next.config.ts` has **no** `define` / `DefinePlugin` for the version.
- Confirmed: the identifier is **absent** from `.next/server` chunks (never
  substituted there).
- So in the Next.js runtime, path 1 is skipped, path 2's `getAppRoot` fails on the
  flattened prod `node_modules` layout, and path 3 returns `"0.0.0"`.

The prior fix `fix-pack-core-version-resolution.md` fixed the **CLI** path only; the
**Next.js server** path was never covered. This is why CLI install works and UI
install fails.

## Technical Approach

Make the Next.js server resolve the real version too. Options, in order of
preference:

1. **Inject the define into the Next.js build.** Add to `next.config.ts` a webpack
   `DefinePlugin` (or Turbopack `define`) that replaces `__RELAY_CORE_VERSION__`
   with `JSON.stringify(pkg.version)`, mirroring `tsup.config.ts`. Single source of
   truth: read `pkg.version` once. This makes path 1 succeed in the server exactly
   as it does in the CLI.
2. **Fallback hardening (belt-and-suspenders):** make `getAppRoot`/the path-2 lookup
   resolve `orionfold-relay/package.json` from the installed package location even on
   the flattened `.next` layout (resolve relative to a known server module, not
   `process.cwd()` / `import.meta.dirname` depth math). Keep this as a secondary so a
   dropped define never silently reintroduces `0.0.0`.

Prefer (1) as the fix; add (2) as insurance. Do NOT hardcode the version in
`next.config` — read it from `package.json`.

## Verification (MUST be a real launch smoke, not unit tests)

Per CLAUDE.md smoke budget (this is runtime-adjacent) and the staging discipline:

1. `npm run build && node scripts/build-prebuilt-artifact.mjs` (rebuild the
   per-build artifact — memory `staging-artifact-rebuild-before-verify`).
2. `node scripts/staging.mjs setup && launch`.
3. Hit the exact UI path: `POST /api/packs/install {"id":"relay-agency"}` → expect a
   real install (HTTP 2xx), NOT `0.0.0` 422.
4. Then `{"id":"relay-agency-pro"}` WITHOUT a license → expect the **named
   license-required refusal** (402/license path), NOT the version error — i.e. the
   gate is now reachable.
5. Add the license, retry → installs store-consult.
6. Assert `relayCoreVersion()` returns `0.23.0` in the server (log or a debug route).

## Acceptance Criteria

- [ ] `POST /api/packs/install` in the prebuilt Next.js server reports the real
      core version (e.g. `0.23.0`), never `0.0.0`.
- [ ] Free pack installs from the `/packs` UI button end to end on a packed tarball.
- [ ] Premium pack UI install surfaces the **license-required** path (not the version
      error) when unlicensed, and installs when licensed.
- [ ] CLI install path still works (no regression).
- [ ] Real-launch staging smoke green on both loopback and `--hostname 0.0.0.0`.

## Scope Boundaries

**Included:** the Next.js version-define injection (+ optional getAppRoot hardening),
the staging smoke.
**Excluded:** [J7-11] blueprint cache staleness (separate spec
`fix-pack-install-blueprint-cache.md`, though this fix removes its main trigger by
making UI install — a same-process reload — the normal path). No changes to the pack
format, license verifier, or gallery UI.

## References

- Finding: `output/staging/2026-07-02-full-suite/FINDINGS.md` [J7-4].
- Prior CLI-only fix: `features/fix-pack-core-version-resolution.md`.
- Code: `src/lib/packs/install.ts:31` (`relayCoreVersion`), `tsup.config.ts` (define),
  `next.config.ts` (missing define).
