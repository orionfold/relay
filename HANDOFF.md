# Relay — HANDOFF

_Last updated: 2026-07-01 (pt: S3.5 — PLG-2b GROOMED: `features/feat-agency-pro-pack.md`
committed+pushed (`b4f4fb57`); all 4 open questions RESOLVED (standalone · $499/year +
orionfold.com/relay · agent-level batch · CRE-first) and 2 latent installer gaps folded in
as free D5 scope. Prior tail: S1–S3 = 0.16.0→0.18.0 ships — see git log + beacon recent.)_

## ▶️ NEXT SESSION (S4, 0.19.0) — BUILD `features/feat-agency-pro-pack.md` (PLG-2b)
- **Commit 1 — engine fixes 0a/0b** (free D5, own bisectable commit, smoke budget):
  (0a) `rewriteTableRefs` must also rewrite `blueprints[].trigger.table` (`install.ts:354`;
  dispatch matches the real UUID, `manifest-trigger-dispatch.ts:153`); (0b) `installPack`
  must register `manifest.schedules` as real schedule rows (`scheduleNextFire` reads the
  schedules DB).
- **Commit 2 — author `relay-agency-pro`** (standalone; chapters 1–4 + CRE deep; nonprofit =
  v0.2.0 first paid update): entitlement `product:orionfold-relay`, `price: "$499/year"`,
  `purchaseUrl: https://orionfold.com/relay/`. Month-end close = agent-level table iteration.
  Retire the temp premium-fixture protocol.
- **Full Naya-path Mode C staging run**: packed tarball → community first-run → Pro
  visible-locked → license add (real fixture) → ceremony → no-flag install → D4 proof.
  BOTH loopback and `--hostname 0.0.0.0` LAN.
- **Website relay** via `strategy/relay/_RELAY.md` (read/write only, never commit there):
  pricing perpetual-fallback copy, fulfilment email rewrite (ONE command + "keep this file"),
  gating-philosophy page (D5).
- **At `npm version 0.19.0`: bump the apiVersion window IN that commit** (standing caveat below).
- ICP P1s interleave as capacity allows (see below).

## Then (S5+) — PLG program queue (`_SPECS/plg-refine.md` = decision record D1–D7)
- **S5:** PLG-3 enterprise trust pack (no-phone-home one-liner, data-flow diagram, SBOM +
  provenance surfacing, security packet draft).
- **S6+:** PLG-4 growth loops — each operator-gated first (AskUserQuestion before build).
- **Anti-patterns fenced in spec §7:** no DB licensing, no CLI upsell banners, no online
  re-validation, no expiry that disables installed packs (D4 is shipped behavior AND a public
  promise — README, issue #14, and now the Settings remove-dialog copy, issue #15).

## Held issues #5/#6/#11/#12 — WAITING on customer retest (reactive)
Retest asks POSTED on 0.16.0 (2026-07-01); 0.17.0 + 0.18.0 also live. Prod build likely moots
the class. If they persist: repro cross-machine (NOT localhost) via Mode D. Triage: `bf204c24`.

## ICP smoke fixes (remaining; interleave from S4)
- **P1s:** `fix-workflow-model-preference-propagation` (smoke budget), `fix-dashboard-budget-vs-cost-labeling`,
  `fix-chat-spend-metering-diagnose` (repro 0-rows; code exists).
- **P2:** `fix-inbox-checkpoint-realtime`.

## Known caveats
- **apiVersion window bump is part of the VERSION-BUMP step, not post-release.** 0.18.0 shipped
  with the window still 0.17/0.16 (harmless — scaffolds declare current, window accepts) and was
  bumped after (`a02ae772`). Second consecutive near-miss; do it when `npm version` runs.
  Sites: `CURRENT_PLUGIN_API_VERSION` in `src/lib/plugins/sdk/types.ts` + previous-MINOR literal
  in `registry.ts`.
- **Pre-existing test failures (NOT regressions), 8:** `router.test.ts` (6),
  `run-cadence-heatmap`/`settings` validator (2); plus `src/__tests__/e2e/blueprint.test.ts`
  is environmental (needs running dev server).
- **`next` is PINNED exactly (16.2.4)** — artifact build must match customer runtime.
- **Next 16 emits `.next/node_modules` symlinks** — artifact ships a manifest + CLI relinks
  (junction on win32). See #10 spec.
- **Profiles are file-based, no `agent_profiles` table** (memory `profiles-are-file-based-not-db`).
- **CLI startup robustness** (memory `cli-startup-robustness`): startup writes non-fatal;
  the licensed-banner read is fail-open by the same rule.
- **Nav width cap:** groups cap at 4 children; Packs is the one tested exception (5th compose
  slot beside Apps, deliberate — `nav-items.test.ts`). Don't grow other groups past 4.

## Not-started backlog (pre-existing)
- **`chore-deprecated-transitive-deps`** (P3) — 7 `npm warn deprecated` on install. Spec written.
- **`feat-prepublish-tarball-smoke`** — largely SUPERSEDED (publish.yml packs + installs +
  smokes pre-publish). Review spec; likely close or narrow.
- **Optional:** npm Publishing → "require 2FA + disallow tokens" now OIDC works.
- **Micro-chore:** stale `pdfjs-dist` in `serverExternalPackages` (flagged in #10 grooming).

## Anchors
- **Strategy repo = read/write only** (memory `strategy-repo-readwrite-only`): edit, NEVER commit/push/merge.
- **Work directly on `main`** — no worktrees/branches unless operator asks (memory `work-on-main-no-worktrees`).
- **npm publishing via OIDC** (`.github/workflows/publish.yml` on `vX.Y.Z` tag; `docs/RELEASING.md`).
  Publish GATED by the npx prod smoke (incl. Case L license lifecycle).
- **Smoke-test budget** (CLAUDE.md): runtime-registry-adjacent changes need a real launch smoke.
- **gh issue/label writes are ALLOWLISTED** (memory `autonomous-session-permission-gates`).
- **Check git history for prior art**; **verify field reports before fixing** (memories).
- **Mode B protocol proven this session**: isolated `RELAY_DATA_DIR` scratch + playwright MCP +
  bundle to `output/staging/<date>/` (gitignored). Temporary premium fixture template for locked
  states — create under `templates/`, capture, DELETE before commit.

## Recently shipped (durable in git + memory)
- **0.18.0** (this session): PLG-2a graduation surface — /packs gallery (installed/free/
  premium-locked, D6) + name-based install + install API (bundled ids only) + license API +
  Settings→License (paste/upload ceremony, D4 copy) + `price`/`purchaseUrl` manifest fields;
  24 unit tests TDD; Mode B capture `output/staging/2026-07-01/`; D7 parity CLI↔UI verified;
  issue #15. Spec `features/feat-graduation-surface.md` (absorbed `fix-pack-install-discoverability`).
- Prior: **0.17.0** license lifecycle (PLG-1, #14) · **0.16.0** prod build for npx (#10) ·
  PLG program spec (`_SPECS/plg-refine.md`) — see `git log` + beacon `recent[]`.
