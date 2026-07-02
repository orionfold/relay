# Relay — HANDOFF

_Last updated: 2026-07-02 (pt: S6 wrap — 0.21.0 SHIPPED: pack-update workflow + Agency Pro
v0.2.0 nonprofit chapter, the first paid update (issue #18); Website later-6/later-7 closed
later-4/later-5 (license-terms link + MSA lane + Security & trust row live on /relay/).
Prior tail: S1–S5 = 0.16.0→0.20.0 — see git log + beacon recent.)_

## ▶️ NEXT SESSION (S7) — PLG-4: renewal value-recap (RULED 2026-07-02, unblocked)
Operator gate passed: **build the renewal value-recap loop** (`license status` local reminder +
Website email relay; honest now that v0.2.0 exists). **Reverse trial KILLED** — re-lock = D4
violation, recorded in plg-refine §4/§5; do not resurface. Spec GROOMED:
`features/feat-renewal-value-recap.md` (2026-07-02) — next step: implement it.
ICP P1s interleave as capacity allows (below).
- **Relay channel: CLEAR** — Website later-6/later-7 landed EVERYTHING (license-terms link,
  PO/MSA lane w/ manav@orionfold.com, plus the Security & trust row on /relay/); checked
  2026-07-02, nothing owed back. Standing obligation: flag on _RELAY if any `docs/trust/*`
  URL ever moves (storefront links them as canonical).
- **Anti-patterns stay fenced (plg-refine §7):** no DB licensing, no CLI upsell banners, no
  online re-validation, no expiry that disables installed packs (D4 = shipped behavior AND
  public promise — README, issues #14–#18, orionfold.com/promise/; now enforced at the
  UPDATE gate too, proven by agency-pro-update.test.ts).

## Held issues #5/#6/#11/#12 — WAITING on customer retest (reactive)
Retest asks POSTED on 0.16.0 (2026-07-01); 0.17–0.20 also live. Prod build likely moots the
class. If they persist: repro cross-machine (NOT localhost) via Mode D. Triage: `bf204c24`.

## ICP smoke fixes (remaining; interleave)
- **P1s:** `fix-workflow-model-preference-propagation` (smoke budget), `fix-dashboard-budget-vs-cost-labeling`,
  `fix-chat-spend-metering-diagnose` (repro 0-rows; code exists).
- **P2:** `fix-inbox-checkpoint-realtime`.

## Known caveats
- **apiVersion window**: bumped IN the release commit again (0.20 window in `77613a6c`);
  tests derive from `CURRENT_PLUGIN_API_VERSION`; the one manual site = `examples/*/plugin.yaml`
  (under `src/lib/plugins/examples/`), and the plugin suite fails loudly if missed.
- **Manual `git tag` is LIGHTWEIGHT and `--follow-tags` skips it** → CI never fires. Push the
  tag explicitly or use `git tag -a` (memory `release-and-issue-conventions`; hit on 0.20.0).
- **docs/index.md + docs/features|journeys|use-cases are GITIGNORED** (generated corpus,
  local-only). Public docs = README + SECURITY.md + docs/trust/ + docs/RELEASING.md +
  docs/plugin-security.md. Trust-doc claims must stay code-true — data-flow.md documents the
  full egress inventory; re-verify before adding any new outbound call.
- **Pre-existing test failures (NOT regressions), 8:** `router.test.ts` (6),
  `run-cadence-heatmap`/`settings` validator (2); plus `src/__tests__/e2e/blueprint.test.ts`
  is environmental (needs running dev server).
- **`next` is PINNED exactly (16.2.4)** — artifact build must match customer runtime.
- **Next 16 emits `.next/node_modules` symlinks** — artifact ships a manifest + CLI relinks
  (junction on win32). See #10 spec.
- **Profiles are file-based, no `agent_profiles` table** (memory `profiles-are-file-based-not-db`).
- **CLI startup robustness** (memory `cli-startup-robustness`): startup writes non-fatal;
  licensed-banner read fail-open by the same rule.
- **Nav width cap:** groups cap at 4 children; Packs is the one tested exception.
- **Blueprint/profile content must pass its Zod schema** — the registry skips invalid files
  with only a console.warn (→ "Blueprint not found" at first trigger). The agency-pro test
  suite schema-validates all shipped content; do the same for any future pack.

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
  Publish GATED by the npx prod smoke (Case L exercises the REAL relay-agency-pro). Every
  release now also attaches a **CycloneDX SBOM** to the GitHub Release.
- **Smoke-test budget** (CLAUDE.md): runtime-registry-adjacent changes need a real launch smoke.
- **gh issue/label writes are ALLOWLISTED** (memory `autonomous-session-permission-gates`).
- **Check git history for prior art**; **verify field reports before fixing** (memories).

## Recently shipped (durable in git + memory)
- **0.21.0** (this session): pack-update workflow (install-state sidecar, `pack update` verb,
  backup-then-overwrite, list//packs/API surfaces) + Agency Pro v0.2.0 nonprofit deep chapter
  — the first paid update; D4 enforced at the update gate, proven vs the real prod license
  fixture; issue #18. NOTE: publish gate caught the stale Case L counts (by design) — the
  smoke's template literals are now commented as bump-on-chapter-growth.
- Prior: **0.20.0** enterprise trust pack (#17) · **0.19.0** relay-agency-pro first premium
  pack (#16) · **0.18.0** graduation surface (#15) · **0.17.0** license lifecycle (#14) ·
  **0.16.0** prod build for npx (#10) — see `git log` + beacon `recent[]`.
