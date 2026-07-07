# Relay — HANDOFF

_Last updated: 2026-07-07 (pt: **Scheduled app dispatch fixed; release still held.** This session fixed the reproduced lead-list hygiene schedule failure: `relay-crm` and `relay-social` scheduled blueprints now have schedule-safe defaults, app schedule dispatch failure no longer increments success counters/logs, and pack install validation catches future scheduled blueprints with required vars lacking defaults. Local `main` remains ahead of `origin/main`; release is still intentionally paused. Continue app polish, then rerun release gates only when the operator chooses to cut.)_

## ▶️ NEXT SESSION — Continue app polish, not release cut

- **P0 START HERE — continue operator walkthrough app polish.** Remaining planned specs from `output/operator-walkthrough-feedback-2026-07-07.md`: `web-designer-site-controls`, `web-templates-pack`, `gallery-card-interactions`, `packs-first-ia`, `dashboard-settings-drilldowns`, `fix-app-detail-row-cache-invalidation`, `fix-in-app-preview-sheet-visibility`, and `flagship-card-polish`. Completed/built in this run: `publish-preview-ux-hardening`, `fix-turbopack-dynamic-transport-dispatch`, `fix-scheduled-lead-list-hygiene-dispatch`.
- **P0 release posture:** release is intentionally paused. Current branch is a strong `0.35.3` candidate, but the operator chose continued polish over cutting. Before any future release: rerun `check:pack-taxonomy`, `check:pack-tarball`, `node scripts/npx-prod-smoke.mjs`, `npm run build`, then bump/tag/push and verify npm/GitHub Actions. Patch release does not bump plugin `apiVersion`.
- **P0 Codex browser runbook is authoritative.** Use `docs/codex-browser-runbook.md`: in-app Browser/Browser plugin first for unauthenticated localhost/file/public pages; Codex Chrome extension for signed-in/profile state; Computer Use for GUI-only desktop flows; Chrome DevTools MCP only for isolated CDP debugging. Do not treat `open -a "Google Chrome" <url>` as sufficient verification.
- **P0 Codex handoff behavior:** `.codex/hooks.json` intentionally has no `Stop` handoff nudge. Use auto compact or operator-initiated `handoff`; do not re-enable the Stop hook unless asked.
- **P0 Codex frontend-skill behavior:** stale Stagent-era frontend design skills were removed from `.agents/skills` and `~/.codex/skills`. Do not reinstall them. Build any new Relay frontend skill later from current online research, Orionfold design-system docs, and project best practices.
- **P1 Web Designer substrate follow-up:** Delete target remains later because no DELETE route exists. Build anchors: `features/publish-preview-artifacts.md`, `features/pack-web-designer.md`, focused tests, and memory `generator-publisher-substrate-tdr039`.
- **Packs Publish:** READ trio + R5 + R4-mechanism are built/released in 0.35.0. R4 CUT remains deferred until the tarball size trigger and open decision #2 (most-installed boundary + Website coordination) are answered. R6/R7 community SEND loop stays last, behind TDR-039 substrate.
- **`pack-depth-next-wave` arc:** Video Creator still needs a clean synthetic reference model before build. Retail Investor remains open: value-heatmap + radar, prosumer-first ICP.
- **`_IDEAS/packs-robustify.md`:** R1+R3 built; R2/R5/R7/R8 still ungroomed. Next gate tranche after current app-polish work: R5 compat-diff CI, then R2 install-time cross-pack check, R7 integration/`joinKeys`, R4 provenanceOf API.
- **F5 follow-up (deferred):** lift dense analytics dashboards `costs/cost-dashboard.tsx` + `apps/ledger-hero-panel.tsx` to the card recipe. Reactive/optional.

Standing candidates (LOW / reactive):
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

## Anchors

- Strategy repo = read/write only unless explicitly instructed; commit/push/merge there only on operator request.
- Work directly on `main`; no worktrees/branches unless operator asks.
- npm publishing uses OIDC via annotated `vX.Y.Z` tag and GitHub Actions. Every release attaches CycloneDX SBOM.
- Runtime-registry-adjacent changes require a real `npm run dev` smoke.
- gh issue/label writes are allowlisted.
- Check git history for prior art; verify field reports before fixing.

## Recently shipped / groomed

**Scheduled lead-list hygiene dispatch fix (BUILT 2026-07-07, UNRELEASED):** Fixed the reproduced `Missing required variables: "Lead" is required` failures for `relay-crm`/`relay-marketing` app schedules. `relay-crm--outreach-loop` and `relay-social--campaign-launch` now have schedule-safe defaults, `fireAppSchedule` treats failed dispatch as failure instead of successful firing, and pack install validation refuses scheduled blueprints whose required variables lack defaults. Spec `features/fix-scheduled-lead-list-hygiene-dispatch.md` is marked built. Verification: focused app-schedule/install/fillability/Marketing bundle tests 48/48, scheduler tests 134/134, pack tests 252/252, `check:pack-taxonomy`, `npx tsc --noEmit`, and `npm run build` passed with known `workspace/fix-data-dir` Turbopack/NFT warnings.

**Embedded Web Designer preview fix (BUILT 2026-07-07, `b69de7d3`, UNRELEASED):** In-app Browser smoke on `/apps/relay-web-designer` found the generated preview did not render inside Relay chrome. Fixed preview responses to return app-relative URLs and changed preview HTML CSP from `frame-ancestors 'none'` to `frame-ancestors 'self'`. Browser smoke now renders the generated AI SuperApp page inside the iframe with no browser console errors/warnings. Verification: focused preview-route/publisher/panel tests 14/14 passed; `npm run build` passed with known `workspace/fix-data-dir` Turbopack/NFT warnings. Direct shell `curl` to localhost was unreliable in this session, but browser-controlled GETs and dev logs showed preview route 200.

**Transport-dispatch Turbopack warning fix (BUILT 2026-07-07, `5fb1af96`, UNRELEASED):** Moved SDK plugin entry validation into a short-lived Node child process so Turbopack no longer traces dynamic plugin `require/import` from `src/lib/plugins/transport-dispatch.ts`. Preserved `.js`/`.mjs` success and named `sdk_invalid_export` failures. Verification: plugin/loader tests 55/55, `npm run build`, and `npm run dev` `/tasks` 200; `transport-dispatch.ts` warning gone.

**Publish-preview UX hardening (BUILT 2026-07-07, `b49650ed` + `b69de7d3`, UNRELEASED):** Embedded local preview in `AppPublishPanel`, added "View without chrome", clarified GitHub Contents read/write permission copy, displayed final deployed URLs, tightened GitHub target permission testing, and added `deployments.final_url`. Browser smoke after `b69de7d3` confirmed the embedded iframe renders generated site content.

**Operator walkthrough follow-ups (GROOMED 2026-07-07, `4141a4ad`):** Added bounded specs from `output/operator-walkthrough-feedback-2026-07-07.md` and an "Operator Walkthrough Follow-ups" tranche to `features/roadmap.md`; `features/changelog.md` records the grooming.

**Web Designer live GitHub Pages smoke + polished republish (COMPLETED 2026-07-07):** Polished Web Designer publish remains live at `https://orionfold.com/relay-web-smoke/`; latest deployment `da6cd84c-061b-494b-ac41-f8d691700083`, commit `d22251ead78c90696be3156d90e296cbe866e9da`, artifact hash `981b9074823d77978dd81f9307ecb7d3b418f5c875c648cd2c79bb52e9f7f9cc`. First publish failed with Contents 403, then succeeded after token permissions were fixed.

**Static-site generator hardcoded template polish (BUILT 2026-07-07, `29f8c667`, UNRELEASED):** Replaced bare generated landing page styling with a self-contained, design-system-inspired template. Verification: generator tests 17/17, focused generator/publisher/panel tests 40/40, build passed with known warnings, live Pages content verified.

**Web Designer pack family / TDR-039 Phase 5 (BUILT 2026-07-07, `9f4e0fff`, UNRELEASED):** Added `relay-web-designer` bundle over `relay-web-publisher` + `relay-web-assets`; standalone gallery primitive; synthetic web sections/assets seed tables; taxonomy/bundled allowlist updates; and `features/pack-web-designer.md`. Live publish smoke complete; TDR-039 accepted.

**Privacy cleanup and peer-reference guardrails (BUILT 2026-07-07, `5b491819` + `53e5de5d`):** Sanitized public pack seed files and added privacy regressions. Durable memory already records "Pack template seed data is public package surface."

**Workflow Hub funnel-row UX fix (BUILT 2026-07-07, `f45ea422`):** Added `fullWidth` secondary-slot contract so Relay Marketing `Lead funnel` renders full-width above normal workflow cards.

**TDR-039 substrate phases (BUILT 2026-07-06/07, UNRELEASED):** Preview artifact store, app-scoped publish service/routes, GitHub Pages target/deployment persistence, row JSON parsing before static-site, masked target responses, app-detail publish panel, duplicate-active-publish blocking, and failed deployment surfacing. Memory `generator-publisher-substrate-tdr039`.

**Packs Publish P1 READ-trio + R5 + R4-mechanism (BUILT 2026-07-06, RELEASED 0.35.0):** R1 index-schema, R2 remote-resolver, R3 provenance-tiers, R5 standard-versioning, R4-mechanism. Memory `packs-publish-authored`.
