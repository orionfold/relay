---
title: Fix — installed-pack blueprints invisible to the server (stale in-process blueprint cache)
status: done
priority: P1
milestone: mvp
source: staging full-suite walkthrough 2026-07-02 finding [J7-11] (output/staging/2026-07-02-full-suite/FINDINGS.md)
dependencies: [fix-packs-ui-install-core-version]
---

# Fix: server blueprint cache goes stale after an out-of-process pack install

## Description

After installing Agency Pro, all six chapters fail at runtime:

```
[manifest-trigger-dispatch] dispatch failed for app=relay-agency-pro
blueprint=relay-agency-pro--intake-pipeline: Error: Blueprint "..." not found
```

Proven live: dropping a row into the `intake` table fires the manifest trigger
(correctly — engine fix 0a works, the trigger points at the real table UUID), but
dispatch cannot resolve the blueprint. `GET /api/blueprints` returns 15 built-ins
and **0** Agency Pro blueprints, even though all 6 files are on disk and valid.

## Root cause (verified at code, staging 0.23.0)

NOT a directory mismatch (an earlier hypothesis, disproven): the registry scan dir
and the install write dir are the SAME (`getAinativeBlueprintsDir()`, registry.ts:14
and install.ts:111). The 6 files parse cleanly (valid ids + steps), so they are not
schema-skipped.

The cause is a **module-level in-process cache**:

- `blueprintCache` (registry.ts:16) is populated once by `loadAll()` and reused.
- `reloadBlueprints()` (registry.ts:82) nulls the cache; install calls it
  (install.ts:107, 122) — **but only in the process that runs the install.**
- In the staging run the pack was installed via the **CLI** (a separate process),
  forced because the UI install is broken ([J7-4]). The CLI invalidated its own
  cache; the running **Next.js server** never did, so its cache still holds the
  pre-install map.
- Definitive check: a fresh scan of the install dir sees all 6 agency-pro blueprints.
  Only the long-lived server process is stale.

**Relationship to [J7-4]:** the normal path is a **UI** install, which runs
`reloadBlueprints()` IN the server process — so once [J7-4] is fixed, UI-installed
packs get a fresh cache automatically and this bug does not fire. The residual real
defect is that an **out-of-process install** (CLI, or any external file drop) leaves
the server cache stale with no way to refresh it.

## Technical Approach

Fix the residual out-of-process case so the server picks up externally-installed
blueprints without a manual restart:

1. **Server reload trigger (preferred):** expose an internal reload the CLI can hit
   after a successful install — either
   - a small authenticated `POST /api/blueprints/reload` the CLI calls when a server
     is running on the same data dir, OR
   - a sentinel/mtime the registry checks (a cheap `stat` on the blueprints dir on
     each `getBlueprints()`; if the dir mtime changed since the cache was built,
     `reloadBlueprints()`). The mtime check is self-healing and needs no CLI change.
2. **Prefer the mtime/self-healing check** — it covers CLI installs, manual file
   drops, and future out-of-process writers with one guard, and has no cross-process
   coupling. Keep the cost negligible (one `statSync` per registry read, or debounce).

Do NOT remove the cache (it matters for hot paths); just make it detect external
staleness.

## Verification (real launch smoke)

1. Rebuild artifact + staging setup/launch (memory
   `staging-artifact-rebuild-before-verify`).
2. With the server running, install a pack via **CLI** (the out-of-process case).
3. `GET /api/blueprints` → the pack's blueprints now appear WITHOUT restarting the
   server.
4. Drop a row into the pack's trigger table (`intake`) → the blueprint dispatches and
   a task/run spawns (no "not found").
5. Cockpit: the ledger `runs.blueprint` panel resolves (fixes [J7-9], same root).
6. Regression: UI install (post-[J7-4]) still works same-process.

## Acceptance Criteria

- [ ] After an out-of-process (CLI) install against a running server, the server
      resolves the new blueprints without a restart.
- [ ] `intake` row-insert dispatches `relay-agency-pro--intake-pipeline` (spawns a
      run), and `grants` row-insert dispatches `grant-pipeline-deep`.
- [ ] The Agency Pro ledger cockpit no longer shows "No monthly-close blueprint
      configured" ([J7-9]).
- [ ] Cache still serves hot reads without a per-call full re-scan (mtime guard only).
- [ ] Real-launch staging smoke green.

## Scope Boundaries

**Included:** the staleness guard (mtime/self-heal or reload endpoint) in the
blueprint registry, plus verifying the manifest-trigger-dispatch chapters run.
**Excluded:** [J7-4] core-version fix (its own P0 spec, and the primary trigger for
this bug on the UI path). No change to blueprint schema, trigger dispatch logic, or
the ledger view kit.

## Resolution (shipped 2026-07-03, staging-verified on 0.23.0)

Implemented the **mtime self-heal guard** (spec's preferred option) in
`registry.ts`. `ensureLoaded()` now captures the user-blueprints-dir mtime when
it builds the cache and, on each subsequent read, `statSync`s the dir; if the
mtime moved (a file added/removed by any process), it drops and rebuilds the
cache. One cheap stat per read, no cross-process coupling — self-heals CLI
installs, manual file drops, and any future out-of-process writer.

**Regression guard I had to add alongside it:** Kind-5 **plugin** blueprints live
only in memory (injected by `mergePluginBlueprints`, sourced from plugin bundle
dirs, never from the user dir). A naive cache rebuild from disk drops them. So
`pluginBlueprints` now retains the full blueprint objects (was: ids only) and
`ensureLoaded()` re-applies them after every disk rebuild. Covered by a new test
`__tests__/cache-self-heal.test.ts` (self-heal on add/remove + plugin-blueprints
survive a disk-triggered reload).

**Staging smoke (real prebuilt artifact):** baseline `GET /api/blueprints` = 15
builtins, 0 agency-pro; installed `relay-agency-pro` via **CLI (out-of-process)`;
re-queried WITHOUT restart → 21 total, all 6 agency-pro blueprints visible;
`relay-agency-pro--intake-pipeline` resolves by id (the exact dispatch lookup that
threw "Blueprint not found"); server log clean of not-found/dispatch errors; R4
isolation held.

**NOTE — separate CLI bug surfaced during this verification** (worth its own
spec): `relay pack add` / `license add` / `plugin` subcommands short-circuit in
`bin/cli.ts` (lines ~193-217) BEFORE `program.parse()` applies `--data-dir` to
`RELAY_DATA_DIR` (lines ~223-226), so **`--data-dir` is silently ignored by those
verbs**. They honor the `RELAY_DATA_DIR` env var (that's how the smoke targeted
the staging dir), but a customer running `relay pack add --data-dir X` after
launching the server on a custom data-dir installs into the wrong place. Not in
scope here; flagged for grooming.

## References

- Finding: `output/staging/2026-07-02-full-suite/FINDINGS.md` [J7-11], [J7-9].
- Code: `src/lib/workflows/blueprints/registry.ts` (mtime self-heal +
  plugin-blueprint retention), `src/lib/packs/install.ts:107,122` (in-proc reload).
- Test: `src/lib/workflows/blueprints/__tests__/cache-self-heal.test.ts`.
- Engine-fix-0a precedent (trigger rewrite, WORKS): `features/feat-agency-pro-pack.md`.
