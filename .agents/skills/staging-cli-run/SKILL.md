---
name: staging-cli-run
description: >
  Record the Relay CLI first-run + free→paid fulfilment journey (Mode A + C) as
  a GIF and grep-able logs, against the isolated staging install. Use when the
  user mentions recording the CLI first-run, capturing the fulfilment/activation
  ceremony, a "cli-first-run GIF", Mode A or Mode C capture, the D4 perpetual-
  fallback proof, minting a staging license, or producing a terminal recording
  of `relay license add` → `relay pack add`. Also triggers on "staging-cli-run",
  "record the CLI", "fulfilment GIF", "D4 proof", or any request to capture the
  license-activation + pack-install ceremony as a reviewable artifact. This RIDES
  on the `relay-staging` substrate — invoke that skill's `setup` first (the
  install must exist). Do NOT use for the browser walkthrough (use
  staging-browser-smoke) or for evaluating a captured bundle (use
  staging-evaluate).
---

# Relay Staging — CLI Run (Mode A + C)

Capture a customer's **CLI first-run and free→paid fulfilment** as two twinned
artifacts: a recorded **GIF** an operator watches, and grep-able **text logs +
a D4 proof** a skill or CI asserts against. Both come from the *same* command
sequence, so the pretty artifact and the checked artifact can never diverge.

The ceremony is the real activation journey: mint a license → `relay license
add` (offline Ed25519 verify) → `relay pack add relay-agency-pro` with **no
`--license-url`** (store-consult proof) → `relay license remove` (D4 revert) →
`relay pack list` shows the pack **still installed** — the D4 promise that your
packs are yours forever, held even after the license is gone.

This is the **repeatable, skill-driven** version of what the 2026-07-02 bundle
did by hand: a hand-authored `naya-license.json` and manually-typed commands.
S2 scripts the signer (deterministic, byte-identical across runs) and the
recording, so one command regenerates the whole bundle.

## The one driver

Everything routes through the same **`scripts/staging.mjs`** as the substrate —
the new **`cli-run`** verb. It reuses `harness.runCliCommand` for the headless
capture, so the ceremony can never drift from the CI smoke's CLI invocation.

```bash
# Prereqs: relay-staging `setup` has run (install exists); VHS is installed.
node scripts/staging.mjs cli-run
```

Output lands in a dated bundle **`output/staging/<date>/`**:

| File | What |
|------|------|
| `cli-first-run.gif` | the recorded ceremony (VHS) — the visual artifact |
| `mode-c-fulfilment.log` / `cli-first-run.log` | grep-able transcript of the same sequence |
| `D4-proof-summary.txt` | the 6 D4 checks, each OK/FAIL; the verb throws if any FAIL |
| `naya-license.json` | the minted staging license (deterministic) |
| `run-ceremony.sh` / `_cli-first-run.tape` | the generated recording assets (resolved paths) |

## Prerequisites

- **A completed `relay-staging setup`.** `cli-run` reads `~/relay-staging/state.json`
  for the install path and drives the installed `dist/cli.js`. It does **not**
  need the server up (the ceremony is pure CLI), so `launch` is optional here —
  but `setup` is required. Run it first via the `relay-staging` skill.
- **VHS installed** (records the terminal GIF; pulls `ttyd` + uses `ffmpeg`):
  ```bash
  brew install vhs
  ```
  If VHS is missing, install it before `cli-run` — the verb shells out to `vhs`.
  VHS occasionally loses the `ttyd` bind on first attempt; the verb **retries
  once** on that race, so a transient `ERR_CONNECTION_REFUSED` self-heals.

## What the verb does (step by step)

1. **Mint** the deterministic Naya-Studio license into the bundle via
   `scripts/staging/sign-staging-license.mts` (reuses `signEnvelope` +
   `of-license-dev-2026-06`, the committed dev key `verify.ts` trusts).
   Timestamps are fixed, so re-runs are byte-identical.
2. **Headless ceremony** through `runCliCommand` → writes the transcript logs +
   evaluates the 6 D4 checks into `D4-proof-summary.txt`.
3. **Record** the GIF: generate `run-ceremony.sh` (the same sequence, for a human
   to watch) + a resolved `_cli-first-run.tape`, then run `vhs`.
4. **Assert** the GIF exists and is non-trivial (> 10 KB), and the R4 isolation
   invariant (`~/.relay` content unchanged). Throws on any D4 FAIL.

## Fidelity contract

The ceremony invokes the installed CLI at
`<scratchDir>/node_modules/orionfold-relay/dist/cli.js` with `RELAY_DATA_DIR`
pointed at `~/.relay-staging` and `RELAY_DEV_MODE`/`RELAY_INSTANCE_MODE` zeroed
(`CUSTOMER_ENV` + `harness.runCliCommand`). It **never** types a globally-linked
dev `relay` binary — that would record dev-gated behavior, a fidelity breach of
the exact class the substrate's `assertFidelity` guards for the server. The GIF
shows what a real customer sees.

## Isolation invariants (inherited from the substrate)

- **R1 · `~/.relay-staging` only; never `~/.relay`.** The ceremony sets
  `RELAY_DATA_DIR=~/.relay-staging`; the verb content-fingerprints `~/.relay`
  before and after and fails loudly on any change (memory
  `staging-isolation-check-content-not-mtime` — content, never mtime).
- **R3 · Pin the version under test.** The minted license + logs are stamped
  with `state.version`; the bundle is dated.
- Deterministic license = stable GIF + stable proof across reruns.

## Rebuild-before-verify

If you changed product `src/` since the last `setup`, the installed tarball is
stale. Rebuild + re-setup before trusting a capture (memory
`staging-artifact-rebuild-before-verify`):

```bash
npm run build:cli                      # the CLI the ceremony drives
# (only if you also relaunch the server: npm run build && node scripts/build-prebuilt-artifact.mjs)
node scripts/staging.mjs teardown && node scripts/staging.mjs setup
```

## Instrumentation is harness-side ONLY

All capture stays in local `output/staging/`. **Nothing phones home; nothing
ships in the product** (the plg-refine §7 no-telemetry fence). This skill adds
no product telemetry — the signer is the committed test-only dev key, and the
recording is a local GIF.
