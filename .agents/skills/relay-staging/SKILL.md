---
name: relay-staging
description: >
  Drive the permanent fresh-install staging environment — a customer-identical
  `npx orionfold-relay` first-run against an isolated data dir. Use when the user
  mentions staging, fresh-install testing, customer-experience simulation, "spin
  up staging", "launch the staging instance", tear down staging, isolated
  data-dir launch, reproducing a customer report, or seeding/clearing staging
  scenarios. Also triggers on "relay-staging", "staging harness", "customer
  first-run", "PLG-S", "simulate a customer install", or any request to stand up
  a clean isolated Relay instance the operator can watch. This is the SUBSTRATE
  the staging-cli-run / staging-browser-smoke / staging-evaluate skills ride on;
  invoke it first to prepare a running instance. Do NOT use for dogfooding from a
  git worktree (use worktree-production) or for the ephemeral CI smoke.
---

# Relay Staging

Stand up a **customer-identical** Relay instance from a packed tarball, in an
isolated data dir, that the operator (or Codex) can launch, poke, watch,
and tear down. It reproduces a real `npx orionfold-relay` first-run — scratch
data dir, no `.env.local`, no dev-mode gate, the real prebuilt-artifact path, the
real "Community Edition" banner — except `RELAY_STAGING=true` unlocks seed/clear
so scenarios can be reset.

This is the **npx-customer complement** to `worktree-production` (which dogfoods
from a git worktree). A customer never has the repo's `.git`; this harness
launches from an empty non-git scratch dir so the `no_git` gate
(`src/lib/instance/detect.ts`) gives real fresh-customer behavior for free.

## The one driver

Everything routes through **`scripts/staging.mjs`** (verbs below). It shares its
launch/CLI primitives with the CI smoke via **`scripts/lib/harness.mjs`**, so the
operator harness and `scripts/npx-prod-smoke.mjs` can never drift.

```bash
node scripts/staging.mjs setup      # npm pack → install into ~/relay-staging/run/
node scripts/staging.mjs launch     # start on :3199, hold open, print the URL
node scripts/staging.mjs status     # is an instance up?
node scripts/staging.mjs teardown   # stop + wipe + assert ~/.relay untouched
```

## Role boundaries

| Task | Use this skill | Use instead |
|------|---------------|-------------|
| Spin up / tear down a fresh-install staging instance | Yes | — |
| Seed/clear/reset a staging scenario | Yes | — |
| Record the CLI first-run + fulfilment as a GIF | Ride this, then | `staging-cli-run` |
| Browser walkthrough (J0–J6) of the running instance | Ride this, then | `staging-browser-smoke` |
| Evaluate a captured bundle → dogfooding backlog | No | `staging-evaluate` |
| Dogfood from a git worktree | No | `worktree-production` |
| The ephemeral CI publish-gate smoke | No | `scripts/npx-prod-smoke.mjs` |
| Fix a bug found while staging | Decision tree below | Fix on `main`, never on the captured artifact |

## Prerequisites (checked by `setup`)

- **A prebuilt artifact for the CURRENT version.** The `file://` mirror is
  per-version: `dist-artifacts/relay-next-build-<version>.tgz` (+ `.sha256`).
  `setup` refuses and tells you to build it if missing:
  ```bash
  npm run build && node scripts/build-prebuilt-artifact.mjs
  ```
  Build it once per version bump; the mirror is reused across staging runs.

## Modes

### 1. Setup Mode

Pack the working tree and install it into the persistent scratch dir.

```bash
node scripts/staging.mjs setup
```

- Runs `npm run build:cli` + `npm pack`, then `npm install <tarball>` into
  `~/relay-staging/run/` (an empty non-git folder — the `no_git` fresh-customer
  substrate). Records install state in `~/relay-staging/state.json`.
- **Refuses** if an instance is already running (teardown first).

### 2. Launch Mode

Start the installed CLI and **hold it open** for the operator/skills to drive.

```bash
node scripts/staging.mjs launch
```

- Launches `dist/cli.js --no-open --port 3199 --data-dir ~/.relay-staging` with
  `RELAY_STAGING=true` and `RELAY_BUILD_ARTIFACT_URL=file://<mirror>`.
- Polls `http://127.0.0.1:3199/` to HTTP 200 (prod first-run may extract the
  artifact — generous timeout), asserts the fresh-customer fidelity checklist,
  then **detaches** so the server outlives the launch command.
- Server log tails at `~/relay-staging/server.log`.
- **Cross-origin arm (customer LAN topology):** to reproduce the Alpine-VM →
  Windows-over-LAN class (memory `customer-triage-field-reports-2026-07`), the
  operator can add `--hostname 0.0.0.0` — but this S1 driver defaults to
  loopback; add the flag by hand in `scripts/staging.mjs` launch args only when a
  report requires it, and never leave it on for routine runs.

Reach the running instance at **http://127.0.0.1:3199/**. Seed/clear are open
(the smoke proves `RELAY_STAGING=true` opens them on the prod build; without it
they 404 — that's the customer-shaped default):

```bash
curl -X POST http://127.0.0.1:3199/api/data/seed    # 200 in staging
curl -X POST http://127.0.0.1:3199/api/data/clear   # 200 in staging
```

### 3. Teardown Mode

Stop the instance and wipe the environment clean.

```bash
node scripts/staging.mjs teardown
```

- SIGTERM (then SIGKILL) the held-open server by PID.
- Wipes `~/.relay-staging`, the scratch install, and the packed `.tgz`.
- **Asserts `~/.relay/relay.db` CONTENT (sha256) is unchanged** across the run
  (R4). A breach throws loudly — it means the staging instance wrote *data* into
  the DEFAULT data dir, which must be investigated before trusting any capture.
  The check hashes content, not mtime, on purpose: the installed CLI's
  module-load legacy migration (`migrateLegacyData` opens `~/.relay/relay.db`)
  and the operator's own concurrent dev server can bump the default DB's mtime
  without staging writing a single row — neither is an isolation breach.

### 4. Scenario Mode (seed/clear fixtures)

Reset the running instance to a known state between captures. Scenarios:

| Scenario | How |
|----------|-----|
| fresh-empty | `clear` (or relaunch against a wiped `~/.relay-staging`) |
| seeded-sample | `POST /api/data/seed` |
| post-clear | `POST /api/data/clear` |
| pack-installed | `relay pack add relay-agency-pro` (needs a license — see below) |
| licensed | `relay license add <minted-or-fixture>.json` |

License source for `pack-installed`/`licensed` scenarios: the **offline dev-key
signer** (`src/lib/licensing/__tests__/sign-helper.ts` → `of-license-dev-2026-06`,
trusted in prod `verify.ts`) mints a valid license with zero external deps. The
real prod-signed fixture
(`src/lib/licensing/__tests__/fixtures/of-relay-verify-20260701.license.json`) is
available for an occasional prod-trust-anchor run. (Wiring the signer into a
scenario verb is `staging-cli-run`'s job — S2.)

## Isolation invariants (R1–R5) — the harness enforces these

- **R1 · Always `--data-dir ~/.relay-staging`; never touch `~/.relay`.** The
  driver hard-codes the isolated dir and never passes `--reset` against the
  default. **Never** run destructive flows against `~/.relay`.
- **R2 · Always launch from an empty non-git cwd** (`~/relay-staging/run/`) so
  the `no_git` gate yields fresh-customer behavior (no dev-mode `.env.local`
  override, no bootstrap).
- **R3 · Pin the version/build under test.** The `file://` mirror is per-version;
  `state.json` records the installed version for reproducibility.
- **R4 · Assert `~/.relay/relay.db` CONTENT (sha256) unchanged after every run.**
  Teardown captures the content fingerprint at launch and fails loudly on any
  content change — the regression guard against accidental default-dir *data*
  writes. (Content, not mtime: legacy migration + a concurrent operator dev
  server can touch the default DB's mtime without a staging write.)
- **R5 · Cost containment.** Prefer local Ollama ($0) for any agent-executing
  step in the higher skills; paid providers gate behind an explicit flag so
  autonomous runs don't spend tokens by default.

## Fresh-customer fidelity checklist (asserted at launch)

Scratch data dir · no `.env.local` · no `RELAY_DEV_MODE`/`RELAY_INSTANCE_MODE`
(zeroed by `harness.launchCli`) · empty non-git cwd · correct banner mode label.
A dev-mode marker in the server log is a fidelity breach and fails the launch.

## Decision Tree: Bug Found While Staging

```
Found a problem while staging a customer run
        │
        ├─ Is it a real product defect (repros on the packed tarball)?
        │   ├─ Yes → capture it (log/screens), fix on MAIN, rebuild the
        │   │         artifact, re-setup, re-verify. Never edit the installed
        │   │         tarball or the captured bundle to "fix" it.
        │   └─ No  → it's a harness/scenario artifact → note it, keep going.
        │
        ├─ Was it a field observation (customer report, walkthrough note)?
        │   └─ Treat as UNVERIFIED until code-verified (staging-evaluate / D8).
        │      Do not groom it into a spec before checking file:line against code.
        │
        └─ Does the fix touch runtime-registry-adjacent code (catalog/runtime/
           engine)?
            └─ Yes → AGENTS.md smoke budget applies: re-run the real launch
                     smoke, not just unit tests, before trusting the fix.
```

**Key discipline:** fixes land on `main` and flow to staging by rebuilding the
artifact + re-running `setup`. Never patch the captured artifact or the bundle —
a "fix" that only exists in a captured run is a lie about what customers get.

## Instrumentation is harness-side ONLY

All capture stays in local `output/staging/` and `~/relay-staging/`. **Nothing
phones home; nothing ships in the product** (the plg-refine §7 no-telemetry
fence). This harness never adds product telemetry.
