# Relay — HANDOFF

_Last updated: 2026-07-02 (pt: S7 wrap — 0.22.0 SHIPPED: renewal value-recap loop (PLG-4a) —
ruling + groom + build + ship in one session (issue #19); reverse trial KILLED (D4, recorded
plg-refine §4/§5); relay later-9/later-10 posted (Website owes the T-30 renewal email).
Prior tail: S1–S6 = 0.16.0→0.21.0 — see git log + beacon recent.)_

## ▶️ NEXT SESSION (S8) — remaining PLG-4 loops, each OPERATOR-GATED; ICP P1s interleave
Two loop candidates left, one per session, AskUserQuestion gate before any spec work:
- **Free registration key tier** (n8n-style email → key → community niceties) — plg-refine §4
  calls it a strong recommendation but brand-timing is the operator's call; needs Website
  issuer participation + a decision on which niceties gate.
- **Founding-supporter identity** — the $349 founding tier feels identical to $499; mostly
  Website/community surface, thin product code.
- **Reverse trial is DEAD** (ruled 2026-07-02): re-lock = the §7 anti-pattern "expiry that
  disables installed content" vs the public promise. Do not resurface in any form that
  writes premium content to the pack store.
- **Relay channel: later-9/later-10 OPEN (reactive)** — Website owes the T-30 renewal email
  (canonical copy posted on _RELAY, incl. the no-phone-home honesty constraint: recap release
  history, never installs). NEW standing obligation: flag each new pack `changelog:` line on
  _RELAY per release. Old standing obligation holds: flag if any `docs/trust/*` URL moves.
- **Anti-patterns stay fenced (plg-refine §7):** no DB licensing, no CLI upsell banners, no
  online re-validation, no expiry that disables installed packs (D4 = shipped behavior AND
  public promise — README, issues #14–#19, orionfold.com/promise/; enforced at the UPDATE
  gate, proven by agency-pro-update.test.ts).

## Held issues #5/#6/#11/#12 — WAITING on customer retest (reactive)
Retest asks POSTED on 0.16.0 (2026-07-01); 0.17–0.22 also live. Prod build likely moots the
class. If they persist: repro cross-machine (NOT localhost) via Mode D. Triage: `bf204c24`.

## ICP smoke fixes (remaining; interleave)
- **P1s:** `fix-workflow-model-preference-propagation` (smoke budget), `fix-dashboard-budget-vs-cost-labeling`,
  `fix-chat-spend-metering-diagnose` (repro 0-rows; code exists).
- **P2:** `fix-inbox-checkpoint-realtime`.

## Known caveats
- **apiVersion window**: bump `CURRENT_PLUGIN_API_VERSION` (sdk/types.ts) + previous-MINOR
  literal (registry.ts) + `examples/*/plugin.yaml` IN the release commit (0.22 window in
  `d1f16046`); the window test fails loudly until package.json bumps — that's its design.
- **Release recipe (proven 0.22.0):** `npm version minor` REFUSES a staged tree → use
  `npm version minor --no-git-tag-version`, one manual release commit (window + CHANGELOG +
  bump together), `git tag -a`, push the tag explicitly (memory `release-and-issue-conventions`;
  lightweight-tag CI miss hit on 0.20.0).
- **Pack `changelog:` map feeds every recap surface** (license status, 402 refusal, /packs
  card, renewal email copy) — add a line with EVERY pack version bump; the template test
  REQUIRES it for Agency Pro. Case L smoke counts are a SEPARATE bump-on-chapter-growth site.
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
  licensed-banner + recap surfaces fail-open by the same rule (recap is decoration, never a gate).
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
  release attaches a **CycloneDX SBOM** to the GitHub Release.
- **Smoke-test budget** (CLAUDE.md): runtime-registry-adjacent changes need a real launch smoke.
- **gh issue/label writes are ALLOWLISTED** (memory `autonomous-session-permission-gates`).
- **Check git history for prior art**; **verify field reports before fixing** (memories).

## Recently shipped (durable in git + memory)
- **0.22.0** (this session): renewal value-recap loop — pack.yaml `changelog:` map (single
  recap source), fail-open `entitledPackRecaps`/`changelogWindow` reusing
  `packUpdateAvailability` (D7), three explicit-invocation surfaces (`license status` recap +
  enriched 30-day warning + expired renewal-voice; 402 refusal names the withheld chapter;
  /packs one-liner); TDD; smoked vs the REAL prod license on the built CLI + live dev server;
  publish smoke green first try; issue #19.
- Prior: **0.21.0** pack-update workflow + Agency Pro v0.2.0 first paid update (#18) ·
  **0.20.0** enterprise trust pack (#17) · **0.19.0** first premium pack (#16) · **0.18.0**
  graduation surface (#15) · **0.17.0** license lifecycle (#14) · **0.16.0** prod build (#10)
  — see `git log` + beacon `recent[]`.
