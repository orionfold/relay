# Relay — HANDOFF

_Last updated: 2026-07-04 (pt: S40 — **primitive→pack source-of-truth DECIDED + FEAT-7/8 SHIPPED.** Made the
architecture call the app-shell cluster was gated on: **Model A — a pure `packOf()` resolver over existing
signals** (`src/lib/apps/pack-of.ts`), NOT a new `packId` field. Rationale: pack id already exists
(`prefix === manifest.id === pack.meta.id`); the `--` prefix is load-bearing for uninstall
(`deleteAppCascade`), so a field forces an uninstall rewrite + backfill migration for zero gain. Resolver
composes 3 tested seams (`extractAppIdFromArtifactId`, `parseAppScheduleId`, `projectId`), gated on the
installed-pack set so a hand-authored `foo--bar` isn't mis-attributed. Then shipped **FEAT-8 pill + FEAT-7
filter across ALL 4 primitive views** (5 commits `d66836d1`→`3fa28b41` + spec resolution), each browser-verified
against real `~/.relay` (3 packs): new `PackPill` (amber Badge, NOT a StatusChip family — spec deviation w/
rationale) on Profiles/Blueprints/Tables/Schedules; FEAT-7 filter-by-pack dropdown on Blueprints (the DB views'
filter already exists via `projectFilter`/`selected`). 21 new unit tests + 383 passing in affected suites, no
regressions. **BUG-6 reclassified:** it's a WRITE feature (generate ledger rows into a pack's tables), NOT
unblocked by the read-resolver — next session's clean task with the Pro ledger open. Operator directive this
session: DECIDE deep architecture calls with rationale, don't surface as AskUserQuestion forks (memory
`decide-architecture-with-rationale`). Prior tail: S39 released 0.26.0 (npm+Release+SBOM); S38 implemented the
groomed fixes. Full detail: git log + specs' Resolution sections.)_

## ▶️ NEXT SESSION — BUG-6 pack-aware seed, then rest of app-shell cluster

FEAT-7/8 shipped clean (0.26.0 released, nothing to verify). The remaining app-shell cluster, ranked:

- **BUG-6 (#35) pack-aware seed — THE clean next task.** NOT blocked anymore (packOf shipped). It's a WRITE
  feature: enumerate installed packs (`listApps()`), find each pack's tables (`listTables({projectId: packId})`),
  and **generate plausible domain rows** the pack's cockpit reads (Agency Pro ledger transactions). Best written
  with `/apps/relay-agency-pro` open to see exactly which columns its ledger reads. `install`-adjacent → smoke
  budget. Spec: `fix-seed-gate-and-pack-coverage.md` (BUG-5 already done) + `fix-app-shell-activation-redesign.md`.
- **App-shell redesign remainder** (`fix-app-shell-activation-redesign.md`): FEAT-5 (blueprints submenu) +
  FEAT-6 (two-button Run/Create) + CF-FEAT-5/6/7/8 still backlog. FEAT-6 is a separate redesign concern, NOT
  gated on packOf. Route to frontend-design/taste; BUG-3/4 acute parts already done.
- **Top-chrome design initiative** (FEAT-9/10/11/11b/12/14/15/16, backlog): ONE design spec decides
  tokens/z-layers/offsets once — no acute defect.

Also standing (unchanged, LOW): not-filed backlog `fix-pricing-bundled-stale-coldstart.md` + R2-4
`create_trigger` `appId` gap; #29 retry-with-backoff hardening; held-issue retests; other staging R-runs.

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
  MINOR bump (now `{0.26, 0.25}` set in `3efa4722`); the window test derives its expected window from
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
**S40 (unreleased, on `main` — 5 commits `d66836d1`→`3fa28b41` + spec resolution):** primitive→pack
source-of-truth + FEAT-7/8. `packOf()` resolver (`src/lib/apps/pack-of.ts`, 13 tests) + `PackPill`
(`src/components/shared/pack-pill.tsx`) on all 4 primitive views + FEAT-7 filter-by-pack on Blueprints.
Browser-verified against real `~/.relay`. Ships in the next release (no version bump yet; not pack-format,
no apiVersion-window impact). Spec: `fix-app-shell-activation-redesign.md` → "Resolution (S40)".

**0.26.0 (S38+S39 RELEASED — `v0.26.0`→`5db27412`; npm `latest` + GitHub Release + SBOM; OIDC CI green):**
groomed 2026-07-04 fix specs — FEAT-4 header row-wrap (#37), BUG-1 git stdio (#36), BUG-5 seed gate 404→403
(#34), BUG-2 data-driven header status (#33), BUG-4 honest run-now toast (#32), BUG-3 not-repro (#31). Two
lessons captured in memory: `apiversion-window-bump-at-version-bump` (MINOR forces the 5-site window bump)
+ `prod-smoke-encodes-contracts` (Case L asserted the OLD contract a bundled fix changed). Detail: git + CHANGELOG.

**0.25.1 (S35, RELEASED — npm `latest` + GitHub Release `v0.25.1` + SBOM; OIDC publish CI green):** two
fresh-install blockers from staging R2. **#29** — internal loopback self-calls (trigger dispatch, compose
table tools) now derive origin via the zero-import leaf `getSelfBaseUrl()` (`RELAY_SELF_BASE_URL` →
`NEXTAUTH_URL` → `NEXT_PUBLIC_APP_URL` → `127.0.0.1:${PORT}`), never a bare `:3000`; CLI threads
`RELAY_SELF_BASE_URL`; also fixed a co-located `create_task` `projectId:null` 400 the port bug had masked.
**#30** — `conversations/route.ts` validRuntimes now includes `"ollama"` (Best-privacy tier could not
chat/compose), + `chat-session-provider.tsx` toasts a swallowed non-2xx create. Both verified with real
non-3000 launches (`:3210` task dispatched; `:3211` Ollama streamed). PATCH → no apiVersion-window bump.
Memory `self-http-calls-hardcode-3000`. Commits `982a1ed9`→`ab1bbcfe`.

**0.25.0 (S33, RELEASED — `2a50f91a`, npm `latest` + GitHub Release + SBOM; publish CI green):** bundles
three arcs. **FEAT-5/6/7/8 app-activation redesign** (`121f5268` + `d76359e7`): Agency Pro's home flipped
`view.kit` ledger→`workflow-hub` (Option A) → all 6 blueprints render as runnable cards; `RunnableBlueprintCard`
composes `RunNowButton`; "Start here" = manual+unscheduled blueprint (New-Business); row-insert cards gate the
Run + name the table (not UUID) via a dynamic-import resolver in `data.ts`; FEAT-7 `ViewModel.secondaryLead` +
draft Execute nudge; FEAT-8 pure `computeSignpost` (draft→Execute, active→watch, paused splits delay-`resumeAt`
vs HITL→`/inbox`); pack 0.2.0→0.3.0. Spec `features/redesign-app-activation-run-model.md`; public issue #27.
**BUG-3 workflow HITL** (`4c0bae6c`): checkpoint steps declare `requiresInput` → pause + ask via the existing
`AskUserQuestion` loop; indefinite `paused`, halt-on-refusal, deep-linked notifications. Spec
`features/fix-workflow-hitl-ask-user.md`; public issue #28. **S29–S30 walkthrough patch arc**: BUG-1 git
`fatal:` stderr silence, FEAT-1 license date UTC, BUG-2 empty-state copy, FEAT-3/4 app-detail toolbar. apiVersion
window bumped 0.24→0.25 in the release commit. Memory: `workflow-status-vocab-active-not-running`.
**Older (in git + CHANGELOG + closed issues):** 0.24.1 (S25–S27, 3 customer fixes #24/#25/#26 from the
S25 6-run staging suite); 0.24.0 (S19, legacy-brand leaks + apiVersion 0.23→0.24); Staging-harness skill
arc (S20–S23, four skills + app-copy grade-3-5 rewrite); 0.23.0 (packs gallery + founding price) ← 0.16.
Full history: `git tag` + CHANGELOG + `git log`.
