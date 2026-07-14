---
title: License lifecycle core — persist, verb, banner, ceremony (PLG-1)
status: shipped
priority: P1
milestone: mvp
source: _SPECS/2026-07-01-200629_plg-refine.md §5 PLG-1 (program decision record D1–D7)
dependencies: [feat-ship-production-build-for-npx]
---

# License lifecycle core (PLG-1): persist on redemption, `relay license` verb, licensed banner, activation ceremony

## Description

The fulfilment spine is shipped and proven e2e (Stripe → Website issuer → signed
`orionfold.license/v1` → offline Ed25519 verify), but the license is verified once
at pack install and then **discarded** (`src/lib/packs/install.ts:127-139`). There
is no persisted credential, no `relay license` noun, and the startup banner calls
every user — paid or not — "Community Edition" (`bin/cli.ts:381`). Of 8 surveyed
runtime-gated products, zero discard the license after one verification; a
dedicated verb (`nx register`-style) and a persistent quiet identity are the norm.

This feature adds the missing primitive: a file-based license store under the
data dir, a `relay license add|status|remove` verb, store-consult fallback in
premium pack install, a licensed startup banner, an activation ceremony, and the
public perpetual-fallback commitment (D4) in README.

**Operator decisions (gated 2026-07-01, final):**
- **Banner identity:** `Licensed to <name → email>` — `issued_to.org` first if
  ever present, then `name`, then `email`. Fulfilment always captures email,
  usually name (Stripe Checkout billing name), never org (verified in Website
  `stripe-webhook/index.ts:210,311,353`).
- **D4 public wording (verbatim, README + ceremony):** "Your packs are yours
  forever. Renewal gets you the year's new and updated packs + priority support."
- **Ships as 0.17.0.**

## User Story

As a paying customer (Naya), I want to redeem my license once and have Relay
remember it — greeting me as a licensee, unlocking my entitled packs without
re-supplying proof — so that paying feels like something changed.

## Technical Approach

### 1. License store — `src/lib/licensing/store.ts` (new, D1/D7)

The single source of truth for "am I licensed?". File-based, consistent with
profiles (no DB tables — the 2026 license table was deliberately dropped,
migration `0026_drop_license`).

- Location: `join(getAinativeDataDir(), "licenses")` (respects `RELAY_DATA_DIR`
  / `--data-dir` like everything else); files named `<license_id>.license.json`,
  written mode `0600`, atomic temp-rename write.
- API (all named errors, `LicenseStoreError`):
  - `saveLicense(envelope)` — verify **signature + term** (steps 1–2; no
    entitlement requirement at save — that's the pack gate's job), then persist.
    Returns the parsed identity summary for the ceremony.
  - `listLicenses(now?)` — every persisted envelope with validity **re-verified
    at read time** (signature + term), plus parsed identity/term/seats/
    entitlements. Invalid/corrupt files are listed with their failure reason,
    never silently skipped (Principle #1).
  - `findEntitledLicense(entitlement, now?)` — first persisted license passing
    the full 3-step gate for `entitlement`; used by `installPack` fallback.
  - `removeLicense(licenseId)`.
  - `getLicensedIdentity()` — banner read (D3): label from the newest **valid**
    license's `issued_to` (`org → name → email`), or `null`. **Fail-open:** any
    store/parse/fs error returns `null` (Community banner), never throws —
    startup-robustness lesson (memory `cli-startup-robustness`).

### 2. `relay license` verb — `src/lib/licensing/cli.ts` (new, D2)

Mirror the `packs/cli.ts` pattern exactly: testable `runLicenseCommand(argv, io)`
dispatcher, dynamic imports only (TDR-032 — nothing licensing-related enters the
CLI's static startup graph), exit codes 0/1, all output through injected io.

- `license add <url-or-path>` — `loadLicense` (path/`file://`/http already
  supported by `load.ts`) → `saveLicense` → **activation ceremony**: thank-you,
  licensed-to identity, license ID, entitlements unlocked, storage path, and the
  D4 sentence (verbatim wording above).
- `license status` — `listLicenses()` table: license ID, licensed-to, term
  (issued → expires), seats, entitlements, validity. Warn (not block) when
  expiry ≤ 30 days: renewal framing per D4. With no licenses: point at
  `license add`. Exit 0 either way — status is informational.
- `license remove <id>` — delete from store; note that installed packs stay
  installed (D4).
- Wire in `bin/cli.ts` beside `isPackSubcommand` (`bin/cli.ts:165,189-201`):
  `isLicenseSubcommand` short-circuit before `program.parse()`, dynamic import.
  Add to the CLI help text block (`bin/cli.ts:132-134` region).

### 3. Pack-install integration — `src/lib/packs/install.ts` (D1/D2)

In the existing 2b license gate (`install.ts:127-139`):
- `--license-url` supplied → load as today, and on a **successful**
  `assertEntitled` persist to the store (fire the ceremony on first save).
- No `--license-url` → **consult the store** (`findEntitledLicense`) before
  refusing. A persisted license unlocks all its entitled packs with no flag.
- `PackLicenseError("missing")` message updated to mention both paths:
  `relay license add` (preferred) and `--license-url` (sugar).

### 4. Banner — `bin/cli.ts:381` (D3)

Replace the hardcoded line with a fail-open store read (dynamic import, kept
out of the static graph):

```
Orionfold Relay 0.17.0 — Licensed to Naya Patel     ← any valid persisted license
Orionfold Relay 0.17.0 — Community Edition          ← none, or ANY store error
```

### 5. Pack-list premium marks — `pack list` (D6, CLI slice)

- Add optional `entitlement` passthrough into the dropped app manifest at
  install (additive optional field on `AppManifest`; written by `writeManifest`,
  read by `listApps`).
- `runList` marks entitlement-carrying installed packs `[premium]`.
- The visible-but-locked gallery of *not-yet-installed* premium packs is PLG-2
  (`/packs` route) — out of scope here (no premium pack exists yet to show).

### 6. Staging re-gate — seed/clear routes (PLG-S slice)

`src/app/api/data/seed/route.ts:5` and `clear/route.ts:5` currently 404 on
`NODE_ENV === "production"` — but staging runs the prod build (post-#10).
Re-gate both: **allow when `NODE_ENV !== "production"` OR
`RELAY_STAGING === "true"`; else 404.** Dev behavior unchanged; customer prod
installs keep the 404 (they never set `RELAY_STAGING`); the staging harness
sets it explicitly. Pass `RELAY_STAGING` through the CLI's spawned-server env
(`bin/cli.ts` spawn env block) so the harness can set it on the CLI process.

### 7. Docs + release

- README: "Free vs Paid" section (D5 slice) — free engine boundary, premium
  packs, license lifecycle (`license add|status|remove`), the D4 wording
  verbatim, "never sends your data to Orionfold" one-liner with verifier source pointer.
- CHANGELOG 0.17.0 customer-voice entry (CI auto-creates the GitHub Release
  from it on tag; memory `release-and-issue-conventions`). Public `feature`
  issue as the customer-facing record.

## Acceptance Criteria (buy-simulation e2e — Mode C in staging)

Run against the packed tarball in the staging harness (extend
`scripts/npx-prod-smoke.mjs`; real fixture
`src/lib/licensing/__tests__/fixtures/of-relay-verify-20260701.license.json`):

- [x] `relay license add <fixture>` verifies offline, persists to
      `<data-dir>/licenses/OF-RELAY-VERIFY-20260701.license.json` (0600), and
      prints the activation ceremony (identity, ID, entitlements, path, D4 line).
- [x] `relay license status` shows identity, term, seats, entitlements,
      validity re-verified at read time.
- [x] A premium test-pack (fixture pack declaring
      `entitlement: product:orionfold-relay`) installs via `pack add` with **no**
      `--license-url` (store consult).
- [x] Next launch banner reads `Licensed to <fixture recipient>` (the fixture has
      email only); with a name-bearing fixture, the name wins (unit-tested
      precedence org → name → email).
- [x] `rm -rf <data-dir>/licenses` → banner reverts to Community Edition, the
      installed premium pack **stays installed and functional** (D4 proof).
- [x] `license remove <id>` mirrors the same D4 behavior (unit-tested; smoke
      exercises the rm-store variant).
- [x] `pack list` marks the installed premium pack `[premium]`.
- [x] Seed/clear: respond in dev (unchanged), respond in prod+`RELAY_STAGING=true`,
      404 in prod without it.
- [x] Store corruption (truncated JSON in licenses dir) → banner falls back to
      Community, `license status` names the bad file, nothing crashes (unit).
- [x] Unit tests for store/verb/gate fallback (34 new tests); **real-launch
      smoke** passed 2026-07-01 — `scripts/npx-prod-smoke.mjs` Case L against
      the installed 0.17.0 tarball in prod mode.

**Verification run — 2026-07-01:** full smoke A/B/L/C green from a clean tarball
install (`npm run build` → `build-prebuilt-artifact.mjs` → `npx-prod-smoke.mjs`).
Unit suite: 2370 passed; only the pre-known failure set (router 6,
api-version-window 2, heatmap/settings 2, blueprint e2e env) — identical
before/after.

## Scope Boundaries

**Included:** store, verb, banner, ceremony, install fallback, pack-list marks,
seed/clear re-gate, README boundary, 0.17.0 release train.

**Excluded (fenced):** `/packs` gallery + Settings→License UI (PLG-2); authoring
a real premium pack (PLG-2b); DB-backed licensing (deliberately reverted —
never reintroduce); seat *enforcement* (display only); online re-validation of
any kind; any expiry that re-locks installed content (D4 violation); startup
upsell/nag text; issuer-side changes (payload already carries everything).

## References

- Program spec: `_SPECS/2026-07-01-200629_plg-refine.md` §4 (D1–D7), §5 PLG-1, §7 anti-patterns.
- Verifier internals: `src/lib/licensing/{verify,gate,load,canonicalize}.ts`.
- Fulfilment capture facts: Website `supabase/functions/stripe-webhook/index.ts`
  + `_shared/license-payload.ts` (email always, name usually, org never).
- Prior art: memory `profiles-are-file-based-not-db`,
  `cli-startup-robustness`, `release-and-issue-conventions`.
