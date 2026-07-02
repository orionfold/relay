# Relay — HANDOFF

_Last updated: 2026-07-01 (pt: S5 — 0.20.0 SHIPPED to npm: the enterprise trust pack (PLG-3);
docs/trust/ ×5 + SECURITY.md + CycloneDX SBOM per release; issue #17; Website later-3 landed
D2/D4/D5 (promise page LIVE, linked from README); later-4 posted with the 2 remaining Website
asks. Prior tail: S1–S4 = 0.16.0→0.19.0 — see git log + beacon recent.)_

## ▶️ NEXT SESSION (S6) — PLG-4 growth loops (each operator-gated: AskUserQuestion BEFORE build)
Per `_SPECS/plg-refine.md` PLG-4: free registration key tier · pack-scoped reverse trial ·
founding-supporter identity · renewal value-recap. Each needs its own groomed spec + gate.
- **Agency Pro v0.2.0 = nonprofit deep chapter** — deliberately the first PAID update; must
  exercise the pack-UPDATE workflow the D4 "renewal buys updates" pitch depends on. The
  `overrides/` layer exists; the update *workflow* is the open design work.
- **Check the relay channel** for Website replies to later-4/later-5: (1) license-terms link
  on /relay/ (canonical text = `docs/trust/license-terms.md`), (2) MSA lane — operator
  confirmed `manav@orionfold.com` (relayed in later-5). Both operator gates from S5 are
  CLEARED (private vuln reporting enabled + verified). These two finish PLG-3's Website side.
- ICP P1s interleave as capacity allows (below).
- **Anti-patterns stay fenced (spec §7):** no DB licensing, no CLI upsell banners, no online
  re-validation, no expiry that disables installed packs (D4 = shipped behavior AND public
  promise — README, issues #14–#17, orionfold.com/promise/).

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
- **0.20.0** (this session): PLG-3 enterprise trust pack — `docs/trust/` (data-flow disclosure
  backed by a code-verified egress inventory; security packet; supply-chain w/ provenance
  verified live; license-terms canonical text; continuity) + SECURITY.md + SBOM per release +
  README trust surface + promise/storefront links; issue #17. Website later-3 landed all
  later-2 asks (fulfilment email DEPLOYED, D4 verbatim, orionfold.com/promise/ LIVE).
- Prior: **0.19.0** relay-agency-pro first premium pack (#16) · **0.18.0** graduation surface
  (#15) · **0.17.0** license lifecycle (#14) · **0.16.0** prod build for npx (#10) — see
  `git log` + beacon `recent[]`.
