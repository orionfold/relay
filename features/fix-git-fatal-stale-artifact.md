# fix: `fatal: not a git repository` still leaks on first-run — stale published artifact + latent unhardened sites

**Status:** proposed · **Priority:** P2 (MED) · **Milestone:** 0.26.0
**Source:** staging Mode B run 2026-07-04, bundle `output/staging/2026-07-04-operator-walkthrough/` (finding BUG-1, **root cause CORRECTED** vs the raw finding, verified against HEAD `dd39bea7`)
**Dependencies:** none. NOT runtime-registry-adjacent (environment/instance libs, not the catalog/runtime/engine).

## Description (verified mechanism, not the raw symptom)

On a fresh `npx orionfold-relay@latest` (0.25.1) in a non-git cwd, the boot console prints a raw `fatal: not a git repository (or any of the parent directories): .git` right after the banner — the first thing a customer sees reads as "broken software" even though the exit code is caught.

**The raw finding's cited cause was WRONG** (`git-manager.ts:16-27` reached via `sync-engine.ts:136 → isGitRepo()`): that chain is **dead code** — `executeSync` in `sync-engine.ts` has zero callers. Forensic trace of every boot-path git invocation found:

- **The genuine boot git path is hardened + gated:** `bin/cli.ts:452` spawns Next with `stdio:"inherit"` → `src/instrumentation-node.ts:26-27` `ensureInstance()` (unconditional for a customer) → `src/lib/instance/bootstrap.ts:288` short-circuits `if (!hasGitDir(cwd)) return {skipped:"no_git"}` BEFORE any git call. Every git call that does run (`src/lib/instance/git-ops.ts:16-19` `run()`) sets `stdio:["ignore","pipe","pipe"]` and is try/caught.
- `src/lib/environment/workspace-context.ts:37-46` is hardened (fix commit `5ca08b0d`) but is reached only by **client polling** (`/api/telemetry`, `/api/workspace/context`), not boot.
- **No source-tree site both runs unconditionally at boot AND lacks a stderr pipe.**

**Most plausible field leak: a stale prebuilt `.next` artifact.** `bin/cli.ts:391-410` downloads a CI-built `.next` from the GitHub Release and runs `next start` against it. If that published bundle was built from a commit **before** `5ca08b0d` (the source-only fix), the customer runs OLD server code where the boot/telemetry git call still inherits stderr — HEAD source looks clean while the shipped runtime leaks (memory `staging-artifact-rebuild-before-verify`: field runtime ≠ source tree).

**Two latent unhardened sites remain** (neither currently on the boot path, but both a hazard if re-reached):
- `src/lib/environment/git-manager.ts:18` — `git()` helper, no `stdio` (dead-code-gated today).
- `src/lib/chat/files/search.ts:36-44` — `git ls-files`, no `stdio` (fires on chat file-search only).

## Repro

`npx orionfold-relay@latest` in a non-git dir; watch the boot console for the `fatal:` line. To distinguish stale-artifact vs source: `grep -r 'stdio' .next/…` in the downloaded bundle, or confirm the served JS hardens the telemetry git call.

## Proposed fix

1. **Confirm the shipped 0.25.1 `.next` Release asset was built AFTER `5ca08b0d`.** If not, rebuild + republish the artifact (this is the actual fix for the field symptom) and add a release-gate check that the published bundle post-dates the fix.
2. **Defense-in-depth:** add `stdio:["ignore","pipe","pipe"]` to `git-manager.ts:18` and `search.ts:36` so no latent path can ever leak the stderr line, mirroring `workspace-context.ts:46` / `git-ops.ts:19`. Cheap, contained.

## Resolution (2026-07-04, S38)

**Item 1 — artifact is NOT stale; no rebuild needed.** Verified:
- `5ca08b0d` (fix) dates 2026-07-03 18:02 local and **is an ancestor of tag `v0.25.1`** (2026-07-03 22:14).
- The published `relay-next-build-0.25.1.tgz` Release asset was created **2026-07-04 06:18Z** — after the fix.
- **The proposed "release-gate check" is structurally unnecessary:** `publish.yml` triggers on the `vX.Y.Z` tag, `actions/checkout@v5` checks out that exact tagged commit, then runs `build-prebuilt-artifact.mjs`. The artifact is *always* built from the tagged source by construction — a stale pre-fix bundle can't be published for a tag containing the fix. A gate here could never fail.
- **Most plausible real cause of the operator's observation:** a **pre-0.25.1 run** (0.25.1, which carries the fix, only published 06:18Z 2026-07-04).

**Item 2 — DONE.** Hardened both latent sites with `stdio:["ignore","pipe","pipe"]`:
- `src/lib/environment/git-manager.ts:18` (dead-code-gated `git()` helper).
- `src/lib/chat/files/search.ts:36` (`git ls-files` on chat file-search).
Unit-covered: `src/lib/environment/__tests__/git-manager.test.ts` (new) + a stderr-pipe assertion in `src/lib/chat/files/__tests__/search.test.ts`. No source site now inherits git stderr.

## Verification

Real non-git-cwd boot against the (rebuilt) published artifact — assert the `fatal:` line does NOT appear. Unit-cover the two hardened helpers by asserting `stdio` is set. This is a packaged-artifact symptom: a unit test alone cannot catch it (the fix left the source clean while the artifact leaked), so the release-artifact check is the real gate.
