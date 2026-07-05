# Relay — HANDOFF

_Last updated: 2026-07-05 (pt: **0.29.0 RELEASED (`v0.29.0`→`9b9ea0f2`; npm `latest` + GitHub Release +
SBOM + prebuilt artifact; OIDC publish CI green incl. npx prod smoke Case L).** Bundled the four passes
that had been unreleased on main: S48 chrome-instrument-palette + FEAT-14/15/16 (settings-glance rail +
instrument-rail visual system), S47 top-chrome structure, S45 Profile→Agent, S44 CF-FEAT. S48 shipped in
~10 operator-driven refinement commits after the operator reviewed it in-browser (opaque rail, dimmed
full-bleed grid, page-shell margin fix, telemetry cell grammar, divider-flash fix — all live-verified
both themes). MINOR → apiVersion window 0.28→0.29 (5 sites). Memory `chrome-sticky-stack-additive-offsets`
added. NEXT = update OPERATOR-REQUIREMENTS rows to Delivered + operator fresh-install confirm. Prior:
0.28.0 (`v0.28.0`→`7e97669a`). Full detail: git log + CHANGELOG.)_

## 📋 Operator requirements tracker — `OPERATOR-REQUIREMENTS.md` (LIVE until all Delivered)
Durable roll-up of ALL ~24 findings/asks from the 2026-07-04 operator harness walkthrough (origin:
`output/staging/2026-07-04-operator-walkthrough/`), tracked to operator satisfaction. **0.29.0 shipped the
top-chrome cluster (FEAT-9/10/11/12/14/15/16) — flip those rows to Done-unconfirmed; Delivered awaits an
operator fresh-install confirm.** Update that file's rows IN PLACE as work lands; retire it only when every
row is Delivered + operator-confirmed. Its "Path to full delivery" section sequences the arc.

## ▶️ NEXT SESSION — reconcile OPERATOR-REQUIREMENTS after the 0.29.0 ship

0.29.0 shipped FEAT-14/15/16 (settings-glance + chrome instrument system). Flip those rows in
`OPERATOR-REQUIREMENTS.md` from Pending → **Done (unconfirmed)** — they reach **Delivered** only after an
operator fresh-install confirm (npx `orionfold-relay@0.29.0`), same convention as FEAT-9/12. Also close the
stale 0.26.0 fix issues as `shipped` (#32/#33/#34/#36/#37) if not done. Optional: file the public
`shipped`-labeled issue for 0.29.0 per `release-and-issue-conventions` (CHANGELOG entry is the customer record).

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
- **Operator requirements** are tracked in `OPERATOR-REQUIREMENTS.md` (root, tracked) — LIVE until all Delivered.
- **Strategy repo = read/write only** (memory `strategy-repo-readwrite-only`): edit, NEVER commit/push/merge.
- **Work directly on `main`** — no worktrees/branches unless operator asks (memory `work-on-main-no-worktrees`).
- **npm publishing via OIDC** (`publish.yml` on `vX.Y.Z` tag), GATED by the npx prod smoke
  (Case L exercises the REAL relay-agency-pro); every release attaches a **CycloneDX SBOM**.
- **Smoke-test budget** (CLAUDE.md): runtime-registry-adjacent changes need a real launch smoke.
- **gh issue/label writes are ALLOWLISTED** (memory `autonomous-session-permission-gates`).
- **Check git history for prior art**; **verify field reports before fixing** (memories).

## Recently shipped
**0.29.0 (RELEASED — `v0.29.0`→`9b9ea0f2`; npm `latest` + GitHub Release + SBOM + prebuilt artifact; OIDC
publish CI green incl. npx prod smoke Case L):** the relay-website dark-theme TECHNIQUE ported into the app
chrome + FEAT-14/15/16. **Instrument system:** telemetry rail is a 100% OPAQUE chrome band (dark
`--rail-surface`=`--surface-1` lifted 0.045L above the canvas so it doesn't merge; light `--surface-2`),
NO grid through the rail (`.rail-instrument::before` removed — an opaque bg does NOT hide a `::before`),
cell dividers bumped to `--border-strong` via scoped `[aria-label="Telemetry"] > *`. **Canvas grid:**
two-tier teal (24/120px) `--grid-line/-major` derived from `--primary` (light+dark auto), FULL-BLEED (no
radial mask — the mask's fade band read as a framing border), dark alpha halved (6/11%) per operator.
**FEAT-14 settings-glance rail:** `GET /api/settings/glance` (aggregates ~11 lib sources server-side,
per-source `.catch` shadow paths) + `useSettingsGlance()` (cloned from `useInstanceIdentity`) + `GlanceRail`
using the telemetry RailCell grammar (collapsed left-aligned cell summary w/ dividers + single Open
deep-link; expanded ONE horizontal row of labeled groups Runtime/Execution/Budget/Permissions/Integrations).
**Dashboard:** dropped the `p-4 sm:p-6` page-shell margin (the real "dark border" — a page wrapper, not
chrome/grid). Sticky stack composes additively (memory `chrome-sticky-stack-additive-offsets`). Also bundled
S47 top-chrome structure (identity hook/endpoint, bar cluster, rem `--chrome-header` sticky-fix, `--z-*`
scale), S45 Profile→Agent presentation rename, S44 CF-FEAT activation copy. MINOR → apiVersion window
0.28→0.29 (5 sites). Detail: git + CHANGELOG + spec Resolution.

**Older (RELEASED — full detail in git + CHANGELOG + closed issues):** 0.28.0 (S43, `v0.28.0`→`7e97669a`,
nav/naming pass + Profiles→Agents user-facing rename + FEAT-5/6, apiVersion 0.27→0.28, memory
`profiles-are-file-based-not-db`); 0.27.0 (S42, `v0.27.0`→`f29f0098`, S40 packOf/PackPill + FEAT-7/8 + S41
BUG-6 pack-aware seed, apiVersion 0.26→0.27, memory `seed-clears-pack-tables-and-addrows-fires-triggers`);
0.26.0 (S38+S39, `5db27412`,
2026-07-04 fix specs #31-37, memories `apiversion-window-bump-at-version-bump` + `prod-smoke-encodes-contracts`);
0.25.1 (S35, `982a1ed9`→`ab1bbcfe`, staging-R2 fresh-install fixes #29/#30, memory `self-http-calls-hardcode-3000`);
0.25.0 (S33, `2a50f91a`, FEAT-5/6/7/8 app-activation #27 + workflow HITL #28, memory
`workflow-status-vocab-active-not-running`); 0.24.1 (S25–S27, customer fixes #24/#25/#26); 0.24.0 (S19,
legacy-brand + apiVersion 0.23→0.24); Staging-harness skill arc (S20–S23); 0.23.0 (packs gallery + founding
price) ← 0.16. Full history: `git tag` + CHANGELOG + `git log`.
