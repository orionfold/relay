# Relay — HANDOFF

_Last updated: 2026-07-08 (pt: **Assets/doc-consolidation task added.** Next session should create the strategy-owned `_ASSETS` surface for product screenshots, journeys, guides, articles, and a release-history feature catalog.)_

## ▶️ NEXT SESSION — Post-release backlog

- **P0 NEXT — Web Publisher preview/gallery polish.** The page registry is built; remaining operator-guided feedback is to keep web-pack previews inside Relay chrome with a separate raw-view action, make blank gallery thumbnails meaningful or omit them, and normalize section-card click behavior.
- **P0 NEXT — Strategy-owned `_ASSETS` corpus for Relay product docs.** Create `~/orionfold/strategy/relay/_ASSETS/`, symlink it into this repo as local `_ASSETS/`, and keep `_ASSETS/` gitignored here. Seed the corpus with `screenshots/light/`, `screenshots/dark/`, `journeys/`, `docs/`, `articles/`, and root `features-catalog.md`. `features-catalog.md` should be a running release-history feature log from the start of Orionfold Relay. Then brainstorm with the operator to: consolidate existing journey material into comprehensive ICP-aligned journeys for agency, solo-founder, and SMB personas; define high-fidelity screenshot coverage for every feature and an efficient future update policy tied to changed/new features; create step-by-step user guides from the feature catalog; and outline the first tranche of long-form operator-guided articles using the asset corpus.
- **P0 strategy-doc loose end:** `_SPECS/cards-design-system.md` exists through the `_SPECS` symlink as an untracked strategy-repo file (`relay/_SPECS/cards-design-system.md`). Do not commit/push the strategy repo unless the operator explicitly asks.
- **P0 Codex browser runbook is authoritative.** Use `docs/codex-browser-runbook.md`: in-app Browser/Browser plugin first for unauthenticated localhost/file/public pages; Codex Chrome extension for signed-in/profile state; Computer Use for GUI-only desktop flows; Chrome DevTools MCP only for isolated CDP debugging. Do not treat `open -a "Google Chrome" <url>` as sufficient verification.
- **P0 Codex handoff behavior:** `.codex/hooks.json` intentionally has no `Stop` handoff nudge. Use auto compact or operator-initiated `handoff`; do not re-enable the Stop hook unless asked.
- **P0 Codex frontend-skill behavior:** stale Stagent-era frontend design skills were removed from `.agents/skills` and `~/.codex/skills`. Do not reinstall them. Build any new Relay frontend skill later from current online research, Orionfold design-system docs, and project best practices.
- **Packs Publish:** READ trio + R5 + R4-mechanism are built/released in 0.35.0. R4 CUT remains deferred until the tarball size trigger and open decision #2 (most-installed boundary + Website coordination) are answered. R6/R7 community SEND loop stays last, behind TDR-039 substrate.
- **`pack-depth-next-wave` arc:** Video Creator still needs a clean synthetic reference model before build. Retail Investor remains open: value-heatmap + radar, prosumer-first ICP.
- **`_IDEAS/packs-robustify.md`:** R1+R3+R5 built. Next gate tranche: R2 install-time cross-pack collision check, then R7 integration/`joinKeys`, R4 provenanceOf API, R8 dependsOn when it earns weight.
- **Operator-guided feedback tasks (UNGROOMED, source `output/operator-walkthrough-feedback-2026-07-07.md`):** Web-pack preview/gallery polish remains open after the page-registry pass.

Standing candidates (LOW / reactive):
- Card-system follow-up: audit residual detail/table/dashboard cards that still use local raw-badge/status/action layouts, but the main card grids now use the shared footer.
- F5 follow-up: lift dense analytics dashboards `costs/cost-dashboard.tsx` + `apps/ledger-hero-panel.tsx` to the card recipe.
- Not-filed backlog `fix-pricing-bundled-stale-coldstart.md` + R2-4 `create_trigger` `appId` gap.
- #29 retry-with-backoff hardening; held-issue retests (#5/#6/#11/#12).
- Other staging R-runs (one R-run per session; harness ready).
- `chore-deprecated-transitive-deps` (P3); stale `pdfjs-dist` in `serverExternalPackages` (#10).

### Staging harness — ready, full loop proven end-to-end
- `relay-staging` · `staging-cli-run` · `staging-browser-smoke` · `staging-evaluate` are available. Driver-mix + headed-browser default live in the `staging-browser-smoke` skill.
- Re-run cadence: one R-run per session. `scripts/staging/browser-capture.mjs` is the headed PNG helper. `file://` mirror is per-build: `npm run build && node scripts/build-prebuilt-artifact.mjs` before verify.
- Constraints: work on `main`; `_SPECS`/`_IDEAS` edit-only; paid-frontier OK'd for agent steps.

## Known caveats

- **Codex desktop browser caveat:** use the in-app Browser/Browser plugin for ordinary localhost verification. Browser DOM snapshots may fail with an `incrementalAriaSnapshot` runtime mismatch; if so, stay in the in-app Browser and use targeted page evaluation/screenshots per the browser skill rather than falling back to normal Chrome.
- **apiVersion window:** bump `CURRENT_PLUGIN_API_VERSION` + previous-MINOR literal + 3 plugin example YAMLs only on a MINOR release. PATCH does not bump it.
- **The npx prod smoke (`scripts/npx-prod-smoke.mjs`) encodes API contracts that bundled fixes may change** and runs only at release. Before tagging, grep it for endpoints a bundled fix touches.
- **Pack `changelog:` map feeds recap surfaces.** Add a line with every pack version bump; template tests require it for Agency Pro.
- **Pack `price` is `string | {list, intro?, note?}`** behind `packPrice()`; render sites never branch on raw shape.
- **Automation blueprint vars MUST be auto-fillable.** Row-insert required vars need a same-named column or `{{row.<col>}}` default; scheduled blueprint required vars need defaults because app schedules dispatch with no human-supplied variables. `tables.listRows().data` is JSON string; parse before feeding `buildVariables`.
- **docs/index.md + docs/features|journeys|use-cases are gitignored** generated corpus. Public docs = README + SECURITY.md + docs/trust/ + docs/RELEASING.md + docs/plugin-security.md.
- **Pre-existing test failures (NOT regressions), 8:** `router.test.ts` (6), settings validator (1), settings/glance shadow-path (1); `src/__tests__/e2e/blueprint.test.ts` is environmental; `agency-pro-update.test.ts` can flake in full parallel but passes isolation.
- **`next` pinned exactly 16.2.4**; Next 16 emits `.next/node_modules` symlinks; artifact ships manifest + CLI relinks.
- **Blueprint/profile content must pass Zod schema**; registry skips invalid files with console.warn, causing "Blueprint not found" later.
- **Settings mobile overflow caveat:** 2026-07-08 card-system smoke found `/settings#settings-permissions` overflows at 390px because unrelated settings channel/provider rows and telemetry rail cells extend off-canvas. Preset cards were not the source. Track separately if mobile settings polish resumes.

## Anchors

- Strategy repo = read/write only unless explicitly instructed; commit/push/merge there only on operator request.
- Work directly on `main`; no worktrees/branches unless operator asks.
- npm publishing uses OIDC via annotated `vX.Y.Z` tag and GitHub Actions. Every release attaches CycloneDX SBOM.
- Runtime-registry-adjacent changes require a real `npm run dev` smoke.
- gh issue/label writes are allowlisted.
- Check git history for prior art; verify field reports before fixing.

## Recently shipped / groomed

**Card system status toolbar pass (BUILT 2026-07-08, current HEAD):** Added `src/components/shared/card-status-toolbar.tsx` as the shared card footer/status/action primitive. Migrated tasks, workflow Kanban/list cards, blueprints, agents/profiles, presets, projects, schedules, apps, packs, starter templates, and last-run cards to the shared toolbar. Default/ready cards now use the Projects reference wash (`bg-status-running/8 border-t-status-running/15`; dark visual reference `#0d2229`) instead of muted gray, so Blueprints, Agents, Presets, and Projects scan consistently in dark theme; create actions use the app-wide `Plus` icon. Release gate fix: Web Publisher taxonomy now includes `web_pages` and `web_sections.pageSlug`, regenerating `taxonomy.json`. `_SPECS/cards-design-system.md` was updated through the strategy symlink but remains outside Relay commit scope unless explicitly requested. Verification: `npx tsc --noEmit`, `node scripts/check-pack-taxonomy.mjs`, focused taxonomy Vitest (2 files / 24 tests), focused card suite (3 files / 17 tests after final tweaks; broader 6 files / 32 tests earlier in the pass), `git diff --check`, and in-app Browser checks on `/blueprints`, `/agents`, `/presets`, `/tasks`, `/projects`, `/schedules`, `/apps`, and `/packs` with no visible runtime errors.

**Card system neutral-surface pivot (BUILT 2026-07-08, commit 04aaeb6e):** Shared typed cards now keep neutral light/dark card bodies while preserving type color in border accents, watermarks, pills, icons, and footer/status-toolbar washes. Watermarks are proportional and padded top-right; duplicated left-of-title identity icon wells were removed from watermarked card families. Task/workflow kanban cards now show icon-backed lifecycle chips (`Waiting`, `Running`, `Completed`, `Failed`, `Stalled`) and use `Run` vs `Re-run` consistently; workflow list/detail status badges were partially aligned. Verification: `npx tsc --noEmit`, focused card/workflow/task vitest suite (5 files / 29 tests), `git diff --check`, and in-app Browser checks on `/tasks` + `/agents` with no console errors.

**Workflow execution state + Run/Stop controls (BUILT 2026-07-08, current branch before card pass):** Added effective workflow execution state so persisted `active` rows with live child tasks show `running`/Stop, approval waits show `waiting`, and stale active rows show `stalled` rather than implying live work. Workflow cards/list/Kanban/detail expose explicit Run/Re-run/Stop actions; card clicks navigate only.

Older resolved session detail is durable in git history (0.36.0 release, Web Publisher page registry, settings rail simplification, primary container standardization, pack-first IA cleanup, privacy cleanup, and Packs Publish P1/R5/R4 mechanism). Keep HANDOFF focused on live next actions.
