# Relay — HANDOFF

_Last updated: 2026-07-04 (pt: **S48 — top-chrome landed (S47) but its VISUAL TREATMENT needs a
palette-driven redesign; operator wants a fresh explore+plan session inspired by the relay website's
dark-green design system.** S47 STRUCTURE is good + unreleased on main (L1 `db637c13` identity
endpoint/hook, L2 `1f3da83c` bar cluster, L3 `eae30aac` tokens+grid+rail-retype). Three follow-up
fixes then chased the rail/canvas relationship reactively (`34467e3a` dark-tier legibility + a REAL
critical-CSS-drift bugfix worth keeping, `700fd4bd` rail→`--background`, `e6ab5ea0` grid-onto-rail) —
operator halted this: iterating without studying the reference. **Operator directives for next session
(see NEXT).** Prior unreleased: S45 Profile→Agent (`1400bf56`), S44 CF-FEAT (`b4616d2c`); 0.28.0
RELEASED (`v0.28.0`→`7e97669a`). Full detail: git log + CHANGELOG.)_

## ▶️ NEXT SESSION — implement the APPROVED chrome-instrument-palette spec

**Spec APPROVED + ready:** `docs/superpowers/specs/2026-07-05-chrome-instrument-palette.md`
(all 4 workstreams ONE pass; restrained glow). `/clear` first, then implement. Research done this
session: website design system extracted (accent is teal `#14c8c0` = ALREADY Relay's `--primary`;
look = 2-tier teal grid + glow + wash over NEUTRAL surfaces, technique-port not hue-change), current
app chrome + token map done, FEAT-14 confirmed = the deferred settings-at-a-glance (a 2-level
progressive-disclosure expand/collapse rail BELOW the telemetry rail). Four workstreams, all in scope:
**WS1** surgical rollback (revert `700fd4bd` rail→`--background`; KEEP `e6ab5ea0` grid-on-rail + KEEP
`34467e3a` critical-CSS fix); **WS2** translucent rail (grid shows through, sparklines pop — reverses
S47's opaque-chrome rule per operator); **WS3** instrument palette (2-tier teal grid 24/120px + seam
glow + `--wash-1/2/3` elevation, dark+light, surfaces stay neutral); **WS4** FEAT-14 settings-glance
rail (new `/api/settings/glance` + `useSettingsGlance()`, collapsed chip row → expanded grouped panel,
5 distinct zone backgrounds). Watch: critical-CSS drift (memory `critical-css-shadows-surface-tokens`),
Turbopack won't HMR token edits (`rm -rf .next`), surface-2/3 blast radius (data-table/schedule-form),
freeze still presentation-only. Original 5 operator directives that produced this spec:

1. **Rollback the rail-away-from-menu move.** `700fd4bd` broke the rail off the tier-2 menu panel and
   stuck it to `--background` (overlapping the main container's plane). REVERT that specific behavior —
   the rail should read as part of the chrome/menu panel, NOT the content plane. (Surgical, not a range
   revert: KEEP `e6ab5ea0`'s grid-on-rail per #2, and KEEP `34467e3a`'s critical-CSS-drift fix — see
   memory `critical-css-shadows-surface-tokens`; that `layout.tsx html.dark` shadow-copy is a real trap.)
2. **KEEP the blueprint grid showing through a TRANSLUCENT rail** — operator likes it: the grid behind
   the rail makes the sparkline "graphs" stand out naturally. So the rail wants translucency/grid, not
   an opaque flat band. (This partially conflicts with the FEAT-15 "opaque chrome" spec rule — operator
   is overriding it here; the grid-through-rail IS the wanted direction.)
3. **STUDY the relay website dark theme** at https://orionfold.com/relay/ (LOCAL SOURCE
   `~/orionfold/website`). It uses dark-GREEN variants (not black/gray), glows, blueprint grid, and
   multiple green shades to great effect. EXTRACT that design system (its green palette, glow treatment,
   grid, elevation shades) and fold it INTO Relay's current black/dark-gray app palette. This is the
   core creative task — the current app is monochrome black/gray; the website is a richer dark-green.
4. **Settings rail is NOT done** — with the settings rail expand/collapse there are **5 distinct areas
   needing varying background-color treatment**. Audit the settings rail's 5 zones and design their
   surface/elevation as part of this system (this is why a coherent multi-shade palette matters — not
   just chrome tiers but the settings rail zones too).
5. **Light AND dark theme must stay consistent** — every palette/elevation decision needs a coherent
   light counterpart, not a dark-only treatment.

**Approach:** this is multi-file + cross-layer + a NEW design language (green palette) → write a
~1-page self-contained spec first (policy 3), get operator approval, THEN `/clear` + implement.
Reference the relay website source for the token values. The S47 structural work (identity
endpoint, bar cluster, rail re-type, sticky-fix, z-scale) STAYS — this is a palette/elevation/
translucency pass on top of it.

**Release is DEFERRED** behind this — don't cut the MINOR until the chrome visual redesign settles
(the three unreleased passes S44/S45/S47 all fold into that release later, MINOR → apiVersion window
bump per memory `apiversion-window-bump-at-version-bump`; grep npx-prod-smoke before tagging per
memory `prod-smoke-encodes-contracts`; annotated tag per `release-tag-must-be-annotated`).

Also standing (unchanged, LOW): not-filed backlog `fix-pricing-bundled-stale-coldstart.md` + R2-4
`create_trigger` `appId` gap; #29 retry-with-backoff hardening; held-issue retests; other staging R-runs.
Stale-close review: #32/#33/#34/#36/#37 (the 0.26.0 fixes) are still OPEN — close as `shipped` when convenient.

### Staging harness — S1-S4 arc COMPLETE + first live 6-run suite done (S25)
- `relay-staging` · `staging-cli-run` · `staging-browser-smoke` · `staging-evaluate` — full loop skill-driven,
  now proven end-to-end. Driver-mix + headed-browser default folded into `staging-browser-smoke` SKILL
  (memories `staging-autonomous-run-playbook`, `staging-headed-browser-preference`).
- **Re-run cadence:** one R-run per session (S24 rev); `scripts/staging/browser-capture.mjs` is the headed
  PNG helper (needs `npx playwright@latest install chromium` once). `file://` mirror is per-BUILD —
  `npm run build && node scripts/build-prebuilt-artifact.mjs` before any verify (memory
  `staging-artifact-rebuild-before-verify`).
- Constraints: work on `main`; `_SPECS`/`_IDEAS` edit-only (strategy repo owner commits); paid-frontier
  OK'd for agent steps; harness-side instrumentation only.

**PLG-4 stays reactive** (rulings in plg-refine §4/§5): free-key **DEFERRED**, founding-supporter loop
**DROPPED** (price is live via #20), reverse trial **DEAD** (violates the promise). **Relay channel:**
later-9/10/11 ACTED (T-30 renewal email LIVE); **later-12 CLOSED** (Website later-13: promise phrase
live on all 3 surfaces + `pricing.json` canon published; our publish gate now reads it, S17). Standing:
flag each new pack `changelog:` line + `docs/trust/*` URL moves on _RELAY.
- **Anti-patterns stay fenced (plg-refine §7):** no DB licensing, no CLI upsell banners, no
  online re-validation, no expiry that disables installed packs (D4 = shipped behavior AND
  public promise; enforced at the UPDATE gate, proven by agency-pro-update.test.ts).
  **Promise phrasing + definition refined 2026-07-02:** canonical copy = "Relay never sends your
  data to Orionfold" — forbids SENDS of user data; read-only pulls FROM canonical Orionfold
  sources are OK (memory `phone-home-definition`).

## Held issues #5/#6/#11/#12 — WAITING on customer retest (reactive)
Labeled `bug` + `awaiting-retest` (S8); retest asks posted on 0.16.0 (2026-07-01), no reply yet.
Prod build likely moots the class; if they persist, repro cross-machine via Mode D. Triage: `bf204c24`.

## Known caveats
- **apiVersion window**: bump `CURRENT_PLUGIN_API_VERSION` (sdk/types.ts) + previous-MINOR
  literal (registry.ts) + the 3 `src/lib/plugins/examples/*/plugin.yaml` IN the release commit ONLY on a
  MINOR bump (now `{0.27, 0.26}` set in `f29f0098`); the window test derives its expected window from
  package.json, so it fails loudly until every site bumps together. **S38→S39 near-miss:** the S38 handoff
  wrongly said "no window bump needed" for 0.26.0 — it IS needed on every MINOR; caught before the release commit.
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
- **Pre-existing test failures (NOT regressions), 8:** `router.test.ts` (6),
  `run-cadence-heatmap`/`settings` validator (2); plus `src/__tests__/e2e/blueprint.test.ts`
  is environmental. `agency-pro-update.test.ts` can flake under the full parallel run (row-trigger
  timing) — passes in isolation.
- **`next` PINNED exactly (16.2.4)**; Next 16 emits `.next/node_modules` symlinks — the
  artifact ships a manifest + CLI relinks (junction on win32). See #10 spec.
- **Nav IA (S13, committed `119e6ba8`):** permanent two-tier bar — tier-1 underline-tab / tier-2
  pill-selection; the old 4-children-per-group width cap is GONE (each tier scrolls). Apps is
  top-level with live instances as tier-2 (`listAppsCached`). Spec: `features/nav-redesign-ia.md`.
- **Blueprint/profile content must pass its Zod schema** — the registry skips invalid files
  with only a console.warn (→ "Blueprint not found" at first trigger).
- **Budget guardrails' plan-price substitution is INTENTIONAL** — display surfaces read
  `meteredSpend`/`planPricedMonthlyMicros` from the snapshot instead (S8).

## Not-started backlog (pre-existing)
- **`chore-deprecated-transitive-deps`** (P3, spec written) · npm 2FA-hardening now OIDC works ·
  stale `pdfjs-dist` in `serverExternalPackages` (#10 grooming).

## Anchors
- **Strategy repo = read/write only** (memory `strategy-repo-readwrite-only`): edit, NEVER commit/push/merge.
- **Work directly on `main`** — no worktrees/branches unless operator asks (memory `work-on-main-no-worktrees`).
- **npm publishing via OIDC** (`publish.yml` on `vX.Y.Z` tag), GATED by the npx prod smoke
  (Case L exercises the REAL relay-agency-pro); every release attaches a **CycloneDX SBOM**.
- **Smoke-test budget** (CLAUDE.md): runtime-registry-adjacent changes need a real launch smoke.
- **gh issue/label writes are ALLOWLISTED** (memory `autonomous-session-permission-gates`).
- **Check git history for prior art**; **verify field reports before fixing** (memories).

## Recently shipped
**Top-chrome visual-system redesign (S47, UNRELEASED on main — `db637c13`→`4cfea481`):** resolved
FEAT-9/10/11/11b/12/15/16 as ONE coherent system (spec IMPLEMENTED). Rail-vs-bar semantic split — the
BAR carries static instance identity (version pill · license tag · labeled auth dot from the new
`useInstanceIdentity()` hook / `GET /api/instance/identity`), the RAIL carries live ops (10 cells,
value→`text-base`, model leads the RUNTIME cell). Two shadow-path rules: `version` null-not-`0.0.0`,
`licenseTag` discriminated union. Fixed the latent sticky bug (rail slid 36px under the header) via
`rem`-based `--chrome-header` offset + named `--z-*` scale; descending surface depth (s-1/s-2/s-3);
faint blueprint grid behind OPAQUE chrome. `TelemetrySnapshot` + `RailCell` API unchanged (freeze
amendment held). Dev-smoke verified both themes. FEAT-14 (settings-at-a-glance) DEFERRED. Detail: git
+ spec Resolution section.

**Profile→Agent sweep (S45, UNRELEASED + UNCOMMITTED on main):** finished the S43 rename's presentation layer
— the deferred internal-facing "Profiles" vocabulary. 12 files, all label/copy, zero wire contracts. Renamed
the `ToolGroup` union + icon/order keys + tool `group:`/descriptions (`tool-catalog.ts`), `GROUP_TO_TAB` key
(`command-tabs.ts`), popover entity label + system-prompt heading, and the primitive-pill label
`Profile`→`Agent`/`agents` across composition-detector + `buildPrimitivesSummary` (registry.ts) +
starter-template-card + chat catalog. KEPT all wire contracts (tool names, `entityType:"profile"`,
`profileId`, manifest `profiles:` key, lib paths, data dir). 6 tests updated; 974 pass / 1 skip / 0 fail.
Memory `profiles-are-file-based-not-db` extended with the primitive-label-surface note. Detail: git.

**CF-FEAT-5/6/7/8 (S44, UNRELEASED on main — `b4616d2c`):** app-shell activation copy pass on the
runnable-blueprint Workflow-Hub kit (`/apps/<pack>`). CF-FEAT-5 per-card Run/Create explainer on every card;
CF-FEAT-6 `secondarySteps` 1→2→3 strip (`view-kits/types.ts` + `workflow-hub.ts` + `kit-view.tsx`); CF-FEAT-7
REJECTED (kept single "Start here"); CF-FEAT-8 Run toast → Monitor. No engine touch, not smoke-gated,
browser-verified. Foldable into the next MINOR (needs the apiVersion-window bump then). Spec
`fix-app-shell-activation-redesign.md` fully resolved. Detail: git + spec Resolution section.

**0.28.0 (S43 RELEASED — `v0.28.0`→`7e97669a`; npm `latest` + GitHub Release + SBOM + prebuilt artifact;
OIDC publish CI green incl. npx prod smoke):** bundled the S43 nav/naming pass (`bc2c5a94`→`5e6cbc45`).
**FEAT-5** Blueprints→`/blueprints`, table-templates→`/schemas` (top-level Compose nav; `agent-file.ts` leaf
pattern; "template" word removed). **Profiles→Agents** full user-facing rename: `profile.yaml`→`agent.yaml`
(constant + dual-read + boot migration; renamed 42 real files live S43), routes+API `/agents`+`/api/agents`,
copy Profile→Agent, picker "Start from a preset"; lib module paths (`@/lib/agents/profiles/*`) + `~/.relay/
profiles` data dir KEPT. **FEAT-6** two-button Run(instantiate→execute, fixes BUG-4)/Create-workflow via
shared `run-now-actions.ts`. MINOR → apiVersion window 0.27→0.28 (5 sites). npx smoke "8 profile(s)" literal
unchanged (CLI/lib/data-dir layer kept "profiles"). Memory `profiles-are-file-based-not-db`. Detail: git +
CHANGELOG.

**0.27.0 (S42 RELEASED — `v0.27.0`→`f29f0098`; npm `latest` + GitHub Release + SBOM + prebuilt artifact;
OIDC publish CI green incl. npx prod smoke):** bundled the two arcs that had been unreleased on `main`.
**S40 primitive→pack source-of-truth + FEAT-7/8:** `packOf()` resolver (`src/lib/apps/pack-of.ts`, 13 tests)
+ `PackPill` (`src/components/shared/pack-pill.tsx`) on all 4 primitive views + FEAT-7 filter-by-pack on
Blueprints. Spec `fix-app-shell-activation-redesign.md` → "Resolution (S40)". **S41 BUG-6 (#35, closed
`shipped`) pack-aware seed:** Agency Pro `seed/tables/engagements.json` (26 signed current-month rows →
$13,950 billed / 49% margin, ledger-only — intake/grants trigger-bound) + `reseedInstalledPacks()`
(`seed-data/installed-packs.ts`) as `seed.ts` step 25. Pack stays 0.4.0. MINOR bump → apiVersion window
0.26→0.27 (5 sites). Memory `seed-clears-pack-tables-and-addrows-fires-triggers`.

**Older (RELEASED — full detail in git + CHANGELOG + closed issues):** 0.26.0 (S38+S39, `5db27412`,
2026-07-04 fix specs #31-37, memories `apiversion-window-bump-at-version-bump` + `prod-smoke-encodes-contracts`);
0.25.1 (S35, `982a1ed9`→`ab1bbcfe`, staging-R2 fresh-install fixes #29/#30, memory `self-http-calls-hardcode-3000`);
0.25.0 (S33, `2a50f91a`, FEAT-5/6/7/8 app-activation #27 + workflow HITL #28, memory
`workflow-status-vocab-active-not-running`); 0.24.1 (S25–S27, customer fixes #24/#25/#26); 0.24.0 (S19,
legacy-brand + apiVersion 0.23→0.24); Staging-harness skill arc (S20–S23); 0.23.0 (packs gallery + founding
price) ← 0.16. Full history: `git tag` + CHANGELOG + `git log`.
