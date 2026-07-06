# Relay — HANDOFF

_Last updated: 2026-07-05 (pt: **0.32.1 3D-logo RELEASED** (`v0.32.1`→`d30615ee`; annotated tag, publish CI
`28769241850` green incl. npx prod smoke + <10MB guard, npm `latest`, GitHub Release + SBOM). Swapped the flat
theme-aware SVG `OfMark` for the design-system 3D origami-star: in-app mark now a plain `<img srcset>` off
`public/brand/orionfold-mark-{24,28,48,56,72,144}.png` (native 1×/2× per placement, NO `next/image` re-encode —
browser paints DS pixels 1:1), plus favicons/PWA icons + a safe-zone-padded maskable icon. Logo swap `d3dbf0a1` +
release chore `d30615ee`. **Gotcha caught:** `public/brand/` had to be added to the `files` allowlist or npx
users get a 404'd in-app mark (OfMark ships via `src/`, references the assets at runtime). Memory
`logo-3d-swap-recipe`. Prior tail: 0.32.0 packs-evolution (`b181a24d`), marketing-screenshot tooling
(`829ad897`) — full detail in git + CHANGELOG.)_

## ▶️ NEXT SESSION — packs-evolution shipped; follow-up is pack DEPTH

- **`pack-depth-next-wave` is the natural next arc** now that the persona/industry split + wave-1 resurfacing are
  released: build genuinely-NEW primitives (not just resurface existing ones). `decisions_open`:
  when-dependsOn-earns-weight (P3 trigger — the dependsOn-trigger + bundle-pricing opens from
  `packs-evolution-requirements-extracted`).
- **Optional cross-peer confirm:** post to `strategy/relay/_RELAY.md` that the 4 industry/bundle packs are synced
  to `pricing.json` (read-only confirm; NOT required — the generalized drift gate enforces it structurally now).

- **F5 follow-up (deferred, operator-confirmed):** lift the two dense analytics dashboards
  `costs/cost-dashboard.tsx` + `apps/ledger-hero-panel.tsx` (hand-rolled `surface-card` chart panels) to
  the card recipe — held out for chart-layout-regression risk. Reactive/optional.

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
- **Pre-existing test failures (NOT regressions), 8** (re-confirmed 0.32.0 by stash-and-run on the pre-bump
  tree): `router.test.ts` (6), `settings` validator (1), `settings/glance` shadow-path (1); plus `src/__tests__/e2e/blueprint.test.ts`
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
**0.32.1 (RELEASED — `v0.32.1`→`d30615ee`; publish CI `28769241850` green; npm `latest` + GitHub Release + SBOM):**
3D origami-star brand logo replaces the flat SVG `OfMark` everywhere. In-app mark = `<img srcset>` off native
`public/brand/orionfold-mark-*.png` (28/56 wordmark · 72/144 boot · 24/48 rail), NO `next/image` (paints DS pixels
1:1, fixes the "dimmer" downscale). Favicons/PWA icons swapped; maskable icon padded to an 80% safe-zone in
brand-slate `#040a11`. Added `public/brand/` to the `files` allowlist (else npx 404s the mark). Presentation-only,
apiVersion unchanged. Memory `logo-3d-swap-recipe`. Design-system source: `logo-3d/app-embed/{transparent,white}/`.

**0.32.0 (RELEASED — `v0.32.0`→`b181a24d`; publish CI `28757924752` green incl. npx prod smoke; npm `latest` +
GitHub Release + SBOM + OIDC; issue #39):** the whole packs-evolution arc released. `pack-generalize-agency` P0
(`3797c839`) persona/industry split — free `relay-agency` neutralized+fattened (7·7·4), paid `relay-cre` (3·3·1)
+ `relay-nonprofit` (3·4·2), `relay-agency-pro` → vertical-neutral automation (6·4·2, v0.5.0); only relay-agency
free, rest = one license `product:orionfold-relay`. `pack-bundle-model` P1 (`3bc9b05c`) + `pack-agency-bundle`
(`a03e53dd`, Agency-for-CRE / Agency-for-Nonprofit flatten a persona+industry pack into ONE app) + pack-taxonomy
(`3ee81dd0`); wave-1 resurface (`c3dd178e`, manifest table charts + RunCadenceHeatmap + trend/spark KPIs) rode
alongside. This session's release commits: pricing fix + drift-gate glob-every-premium-pack (`b0e05e4c`),
prod-smoke Case L2 bundle-flatten (`5a7a7e8e`), release chore + apiVersion 0.31→0.32 (`b181a24d`). Memories
`persona-pack-manual-automated-split`, `pack-bundle-flatten-model`, `pack-taxonomy-shared-registry`,
`packs-license-price-is-shared-not-per-pack`, `resurface-before-build-primitive-pattern`.

**0.31.0 (RELEASED — `v0.31.0`→`a661054e`; publish CI `28747032762`):** app-wide card design lift (F5) +
Schemas Compose→Data nav move (F6). Base `ui/card.tsx` gains `tone`/`emphasis`/`watermark`+`watermarkColor`;
operator-refined to own-glyph colored-by-type uniform watermark; swept LOW/MED/RICH surfaces + F2 CSS-multicolumn
masonry. Recipe + taste rule in memories `card-watermark-recipe` / `card-watermark-taste-rule`. Deferred:
cost-dashboard + ledger-hero. Presentation-only; apiVersion 0.30→0.31. 0 test regressions.

**0.30.0 (RELEASED — `v0.30.0`→`8519e9af`):** the final four operator-walkthrough requirements — FEAT-6 two-verb
`RunNowButton` on `/blueprints` cards, FEAT-13 `ProfilePresetGallery` → `/presets` nav peer, CF-FEAT-2 + FEAT-7.
apiVersion 0.29→0.30. Memories `two-verb-run-is-blueprint-only`, `compose-submenu-elevation-pattern`. Full detail
in git + CHANGELOG.

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
