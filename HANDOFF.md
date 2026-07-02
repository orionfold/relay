# Relay — HANDOFF

_Last updated: 2026-07-01 (pt: S1 DONE — 0.16.0 SHIPPED: production build for npx (#10) live on
npm + GitHub Release artifact verified e2e from a real install. Prior tail: PLG program specced,
backlog PLG-first — see git + Recently shipped.)_

## ⚠️ OPERATOR FIRST — two actions the session couldn't take (permission-gated)
1. **Post the v0.16.0 issue updates** — drafted, ready-to-run commands in
   `output/issue-comments-0.16.0.md`: close #7/#8/#10 (+`shipped` label), retest asks on
   #5/#6/#11/#12 (per plan: ask on 0.16.0, not 0.15.5). External writes were classifier-blocked.
2. `rm -rf ~/.relay-isolated` (6.4M throwaway test DB) — delete was classifier-blocked.

## ▶️ NEXT SESSION (S2, 0.17.x) — groom + implement `feat-license-lifecycle` (PLG-1, `_SPECS/plg-refine.md`)
- Persist license on redemption (`~/.relay/licenses/`), `relay license add|status|remove`,
  banner reads store (now at `bin/cli.ts` ~line 384, inside the 6.5 insertion zone), activation
  ceremony, pack-list premium marks, README free-vs-paid.
- PLG-S slice: re-gate `/api/data/seed` + `/api/data/clear` on `RELAY_STAGING=true` (both
  NODE_ENV-gated today → **now actually vanish in prod builds since 0.16.0 ships prod mode**);
  acceptance = fulfilment simulation (Mode C) in staging.
- **Staging recipe v1 EXISTS now**: `scripts/npx-prod-smoke.mjs` (pack → clean-dir install →
  prod launch, 3 cases). Extend it for the fulfilment sim rather than building new harness.
- Gate during grooming (AskUserQuestion): D4 perpetual-fallback public wording + banner wording.
- Smoke budget applies (CLAUDE.md). Version note: 0.16.0 is taken by #10; PLG-1 lands 0.17.x
  (or 0.16.x patches if operator prefers — decide at grooming).

## Then (S3–S6) — PLG program queue (`_SPECS/plg-refine.md` = decision record D1–D7)
- **S3:** PLG-2a — `/packs` gallery + Settings→License page; absorbs
  `fix-pack-install-discoverability`. `/frontend-designer` flag. Browser-walkthrough capture.
- **S4:** PLG-2b — author FIRST premium pack + Naya-path staging run with real-license fixture;
  Website relay (pricing copy, email rewrite, gating-philosophy page).
- **S5:** PLG-3 enterprise trust pack (no-phone-home one-liner, data-flow diagram, SBOM +
  provenance surfacing — emitted per `publish.yml` OIDC; security packet draft).
- **S6+:** PLG-4 growth loops — each operator-gated first.
- **Anti-patterns fenced in spec §7:** no DB licensing, no CLI upsell banners, no online
  re-validation, no expiry that disables installed packs.

## Held issues #5/#6/#11/#12 — WAITING on customer retest of **0.16.0** (reactive)
0.16.0 (prod build, no dev-origin gate) likely moots the class — retest asks drafted (see
OPERATOR FIRST). If issues persist on 0.16.0: repro cross-machine (NOT localhost), watch
pending/blocked `/_next/*` + `/api/*`, check hydration. Triage detail: commit `bf204c24`.

## ICP smoke fixes (remaining; interleave from S4 per spec §6)
- **P1s:** `fix-workflow-model-preference-propagation` (smoke budget), `fix-dashboard-budget-vs-cost-labeling`,
  `fix-chat-spend-metering-diagnose` (repro 0-rows; code exists). (`fix-pack-install-discoverability`
  → absorbed into PLG-2.)
- **P2:** `fix-inbox-checkpoint-realtime`.

## Known caveats
- **Pre-existing test failures (NOT regressions):** `router.test.ts` (6), `api-version-window.test.ts` (2),
  `run-cadence-heatmap`/`settings` validator (2); plus `src/__tests__/e2e/blueprint.test.ts` is
  environmental (needs running dev server). Verified identical before/after 0.16.0 work.
- **`next` is now PINNED exactly (16.2.4)** — artifact build must match customer runtime. Bump the
  pin deliberately with Next upgrades; release smoke covers it. (Was `^16`; changed in #10.)
- **Next 16 emits `.next/node_modules` symlinks** required at runtime by hashed name; artifact
  ships a manifest + CLI relinks (junction on win32). See spec Implementation notes + TDR-worthy.
- **Profiles are file-based, no `agent_profiles` table** (memory `profiles-are-file-based-not-db`).
- **CLI startup robustness** (memory `cli-startup-robustness`): startup writes non-fatal; bind flags.

## Not-started backlog (pre-existing)
- **`chore-deprecated-transitive-deps`** (P3) — 7 `npm warn deprecated` on install. Spec written.
- **`feat-prepublish-tarball-smoke`** — largely SUPERSEDED: publish.yml now packs + installs +
  smokes the tarball pre-publish. Review the spec; likely close or narrow.
- **`/relay/` free-vs-paid boundary not in README** — README predates licensing.
- **Optional:** npm Publishing → "require 2FA + disallow tokens" now OIDC works.
- **Micro-chore:** stale `pdfjs-dist` in `serverExternalPackages` (not a dep; flagged in #10 grooming).

## Anchors
- **Strategy repo = read/write only** (memory `strategy-repo-readwrite-only`): edit, NEVER commit/push/merge.
- **Work directly on `main`** — no worktrees/branches unless operator asks (memory `work-on-main-no-worktrees`).
- **npm publishing via OIDC** (`.github/workflows/publish.yml` on `vX.Y.Z` tag; `docs/RELEASING.md`).
  Publish is now GATED by the npx prod smoke (artifact build + clean install + 3 launch cases).
- **Smoke-test budget** (CLAUDE.md): runtime-registry-adjacent changes need a real launch smoke.
- **Check git history for prior art** (memory `check-git-history-for-prior-art`).
- **Verify field reports before fixing** (memories `verify-walkthrough-findings-before-grooming`,
  `customer-triage-field-reports-2026-07`): code-verify mechanisms + ask run topology first.

## Recently shipped (durable in git + memory)
- **0.16.0** (this session): production build for npx (#10) — `dd11b0d2` + tag `1400741d`;
  download-on-first-run (`src/lib/desktop/prebuilt-download.ts`, 21 tests TDD), artifact CI
  (`build-prebuilt-artifact.mjs` + publish.yml gates), e2e smoke (`npx-prod-smoke.mjs`), next
  pinned 16.2.4, `.next/node_modules` manifest+relink (Windows-safe). Verified from real npm
  install: downloads GitHub Release artifact, `Mode: production`, / + /chat 200.
- Prior session: PLG program specced (`_SPECS/plg-refine.md`) · backlog PLG-first ·
  discoverability spec absorbed into PLG-2 · #10 groomed · specs committed `68c2f52c`.
- Prior: **0.15.5** (#13 `55ab07a0`, #9+#4 `23845a97`, `bf204c24`) · 0.15.4 compose P0
  (`b0c1dae6`) · #1 WSL (0.15.2) · `--hostname` (0.15.3).
