# Relay — HANDOFF

_Last updated: 2026-07-05 (pt: **operator design walkthrough — findings only, NO code committed.**
Watched operator navigate app + orionfold.com in Claude-in-Chrome; logged F1–F6 to
`output/staging/2026-07-05-operator-walkthrough/FINDINGS-live.md`. Headline: **F5 app-wide CARD
DESIGN LIFT** to the orionfold.com "THE PROOF" North Star recipe (glass `rounded-2xl backdrop-blur`
+ faint watermark glyph @0.09/0.14 + accent payoff variant) — cards are Relay's most-marketable
primitive; base `ui/card.tsx` has NO variants (add tone/emphasis/watermark). **F6 nav move**: Schemas
Compose→Data (after Tables), single-line `nav-items.ts` + test tail. F1/F2/F3/F4 roll up into F5. New
memories: `cards-are-first-class-marketable-primitive`, `favor-visually-rich-ui`,
`card-grid-first-card-anchor-explainer`, `dont-over-log-mid-conversation`. Prior committed: 0.30.0
RELEASED (`v0.30.0`→`8519e9af`, final four operator requirements; tracker retired). Full detail:
git log + CHANGELOG + the findings bundle.)_

## ▶️ NEXT SESSION — design-lift backlog groomed (F5/F6), no code committed yet

Operator design walkthrough (2026-07-05) produced a groomed, code-grounded backlog. Pick up here:
- **F5 — App-wide card design lift (BIG, presentation-only).** Groomed spec in
  `output/staging/2026-07-05-operator-walkthrough/FINDINGS-live.md` + memory
  `cards-are-first-class-marketable-primitive`. North Star recipe extracted from orionfold.com CSS;
  card-surface inventory (RICH/MED/LOW tiers) + shared helpers (`card-icons`/`PackPill`/`packOf`)
  captured. Build shape: add `Card` tone(per-kind)/emphasis/watermark variants → per-kind tone map
  (tone/glyph = the F1 primitive-type cue) → migrate LOW→MED→RICH, fold in F2 masonry/uniform-height.
- **F6 — Relocate Schemas Compose→Data (after Tables).** Single-line `nav-items.ts` move (entry at
  line ~81 → `dataItems` after Tables) + update `nav-items.test.ts` "elevated Schemas" assertion +
  check `features/nav-redesign-ia.md`. No route change.

Standing candidates (unchanged, all LOW / reactive):
- Not-filed backlog `fix-pricing-bundled-stale-coldstart.md` + R2-4 `create_trigger` `appId` gap.
- #29 retry-with-backoff hardening; held-issue retests (#5/#6/#11/#12, reactive — see below).
- Other staging R-runs (one R-run per session; harness ready).
- `chore-deprecated-transitive-deps` (P3, spec written); stale `pdfjs-dist` in `serverExternalPackages` (#10).

### Staging harness — ready, full loop proven end-to-end
- `relay-staging` · `staging-cli-run` · `staging-browser-smoke` · `staging-evaluate` — skill-driven loop.
  Driver-mix + headed-browser default in the `staging-browser-smoke` SKILL (memories
  `staging-autonomous-run-playbook`, `staging-headed-browser-preference`).
- **Re-run cadence:** one R-run per session; `scripts/staging/browser-capture.mjs` is the headed PNG helper
  (needs `npx playwright@latest install chromium` once). `file://` mirror is per-BUILD —
  `npm run build && node scripts/build-prebuilt-artifact.mjs` before any verify (memory
  `staging-artifact-rebuild-before-verify`).
- Constraints: work on `main`; `_SPECS`/`_IDEAS` edit-only; paid-frontier OK'd for agent steps.

**PLG-4 stays reactive** (plg-refine §4/§5): free-key **DEFERRED**, founding-supporter loop **DROPPED**
(price live via #20), reverse trial **DEAD** (violates the promise). **Relay channel:** later-9/10/11 ACTED
(T-30 renewal email LIVE); **later-12 CLOSED**. Standing: flag each new pack `changelog:` line +
`docs/trust/*` URL moves on _RELAY.
- **Anti-patterns stay fenced (§7):** no DB licensing, no CLI upsell banners, no online re-validation, no
  expiry that disables installed packs (D4 = shipped behavior AND public promise; enforced at the UPDATE gate,
  proven by agency-pro-update.test.ts). **Promise phrasing:** canonical copy = "Relay never sends your data to
  Orionfold" — forbids SENDS of user data; read-only pulls FROM canonical Orionfold sources are OK (memory
  `phone-home-definition`).

## Held issues #5/#6/#11/#12 — WAITING on customer retest (reactive)
Labeled `bug` + `awaiting-retest` (S8); retest asks posted on 0.16.0 (2026-07-01), no reply yet.
Prod build likely moots the class; if they persist, repro cross-machine via Mode D. Triage: `bf204c24`.

## Known caveats
- **apiVersion window**: bump `CURRENT_PLUGIN_API_VERSION` (sdk/types.ts) + previous-MINOR
  literal (registry.ts) + the 3 `src/lib/plugins/examples/*/plugin.yaml` IN the release commit ONLY on a
  MINOR bump (now `{0.30, 0.29}` set in `8519e9af`); the window test derives its expected window from
  package.json, so it fails loudly until every site bumps together. Needed on EVERY MINOR (S38→S39 near-miss:
  a handoff once wrongly said "no bump needed" — it always is).
- **The npx prod smoke (`scripts/npx-prod-smoke.mjs`) encodes API contracts that bundled fixes may change** —
  it runs ONLY at release (gates publish, not in `npm test`), so a fix that changes a status/response shape
  passes all unit tests then fails the release. Before tagging a release, grep the smoke for any endpoint a
  bundled fix touches (0.26.0: BUG-5 changed the seed gate 404→403; Case L still asserted 404 → 1st publish
  failed). Case L asserts: pack install counts, `[premium]` mark, installed-version, licensed banner, seed 403
  + explanatory body (non-staging), seed/clear 200 (RELAY_STAGING), D4 pack-stays-installed.
- **Pack `changelog:` map feeds every recap surface** (license status, 402 refusal, /packs
  card, renewal email copy) — add a line with EVERY pack version bump; the template test
  REQUIRES it for Agency Pro. Case L smoke counts are a SEPARATE bump-on-chapter-growth site.
- **Pack `price` is now `string | {list, intro?, note?}`** behind `packPrice()` — render sites
  never branch on the raw shape; externally-shipped packs adopting the object shape must raise
  their `relayCore` (older cores reject it as `PackValidationError` — `.strict()` schema).
- **docs/index.md + docs/features|journeys|use-cases are GITIGNORED** (generated corpus).
  Public docs = README + SECURITY.md + docs/trust/ + docs/RELEASING.md +
  docs/plugin-security.md. Trust-doc claims must stay code-true.
- **Pre-existing test failures (NOT regressions), 8** (re-confirmed 0.30.0): `router.test.ts` (6),
  `run-cadence-heatmap`/`settings` validator (2); plus `src/__tests__/e2e/blueprint.test.ts`
  is environmental (needs a running dev server). `agency-pro-update.test.ts` can flake under the full
  parallel run (row-trigger timing) — passes in isolation.
- **`next` PINNED exactly (16.2.4)**; Next 16 emits `.next/node_modules` symlinks — the
  artifact ships a manifest + CLI relinks (junction on win32). See #10 spec.
- **Nav IA (S13, committed `119e6ba8`):** permanent two-tier bar — tier-1 underline-tab / tier-2
  pill-selection; the old 4-children-per-group width cap is GONE (each tier scrolls). Apps is
  top-level with live instances as tier-2 (`listAppsCached`). Spec: `features/nav-redesign-ia.md`.
  Compose peers now include Blueprints/Schemas/**Presets** (elevation pattern, memory
  `compose-submenu-elevation-pattern`).
- **Blueprint/profile content must pass its Zod schema** — the registry skips invalid files
  with only a console.warn (→ "Blueprint not found" at first trigger).
- **Budget guardrails' plan-price substitution is INTENTIONAL** — display surfaces read
  `meteredSpend`/`planPricedMonthlyMicros` from the snapshot instead (S8).

## Anchors
- **Strategy repo = read/write only** (memory `strategy-repo-readwrite-only`): edit, NEVER commit/push/merge.
- **Work directly on `main`** — no worktrees/branches unless operator asks (memory `work-on-main-no-worktrees`).
- **npm publishing via OIDC** (`publish.yml` on `vX.Y.Z` tag), GATED by the npx prod smoke
  (Case L exercises the REAL relay-agency-pro); every release attaches a **CycloneDX SBOM**. Tag must be
  ANNOTATED (`git tag -a`) or publish CI never fires (memory `release-tag-must-be-annotated`).
- **Smoke-test budget** (CLAUDE.md): runtime-registry-adjacent changes need a real launch smoke.
- **gh issue/label writes are ALLOWLISTED** (memory `autonomous-session-permission-gates`).
- **Check git history for prior art**; **verify field reports before fixing** (memories).

## Recently shipped
**0.30.0 (RELEASED — `v0.30.0`→`8519e9af`; npm `latest` + GitHub Release + SBOM + OIDC CI green incl. npx prod
smoke Case L):** the final four operator-walkthrough requirements. FEAT-6 (`82861850`) two-verb `RunNowButton`
on `/blueprints` gallery cards (blueprint-only; stopPropagation guard vs the clickable Card). FEAT-13
(`cb97eb9e`) extracted `ProfilePresetGallery` → `/presets` route + "Presets" Compose nav peer of Agents (nav
elevation, not a new feature). CF-FEAT-2 (`0c3c0262`) + FEAT-7 (`c21441c1`) bundled from the prior unbuilt-
release. apiVersion 0.29→0.30. `OPERATOR-REQUIREMENTS.md` retired. Memories `two-verb-run-is-blueprint-only`,
`compose-submenu-elevation-pattern`.

**0.29.1 (RELEASED — `v0.29.1`→`e210e49a`):** #31 blueprint-card husk fix. `BlueprintCard.resolved` flag +
honest "couldn't load, reinstall the pack" card with NO fake Run when a definition can't resolve; working
cards unchanged. Closed the silent-husk half (principle #1). Root cause in memory `blueprint-card-husk-root-cause`.

**0.29.0 (RELEASED — `v0.29.0`→`9b9ea0f2`):** relay-website dark-theme chrome + FEAT-14/15/16 — opaque
telemetry rail, full-bleed teal canvas grid, `GET /api/settings/glance` + `GlanceRail`; bundled S47 top-chrome
+ S45 Profile→Agent + S44 CF-FEAT copy. Memory `chrome-sticky-stack-additive-offsets`.

**Older (RELEASED — full detail in git + CHANGELOG + closed issues):** 0.28.0 (`v0.28.0`→`7e97669a`, nav/naming
+ Profiles→Agents rename, memory `profiles-are-file-based-not-db`); 0.27.0 (`f29f0098`, packOf/PackPill +
FEAT-7/8 + BUG-6 pack-aware seed, memory `seed-clears-pack-tables-and-addrows-fires-triggers`); 0.26.0
(`5db27412`, fix specs #31-37, memories `apiversion-window-bump-at-version-bump` + `prod-smoke-encodes-contracts`);
0.25.1 (`982a1ed9`→`ab1bbcfe`, staging-R2 fixes #29/#30, memory `self-http-calls-hardcode-3000`); 0.25.0
(`2a50f91a`, app-activation #27 + workflow HITL #28, memory `workflow-status-vocab-active-not-running`); 0.24.1
(customer fixes #24/#25/#26); 0.24.0 (legacy-brand); Staging-harness arc (S20–S23); 0.23.0 ← 0.16. Full
history: `git tag` + CHANGELOG + `git log`.
