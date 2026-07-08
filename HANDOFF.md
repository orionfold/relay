# Relay — HANDOFF

_Last updated: 2026-07-08 (pt: **Settings rail collapsed to one row; telemetry/settings drill-downs confirmed complete.** Removed the expandable settings-glance panel, migrated expanded-only execution/runtime/permission cells into the always-visible collapsed rail, and cleared the already-built telemetry/settings drill-down item from the pending operator-feedback list.)_

## ▶️ NEXT SESSION — Post-release backlog

- **P0 NEXT — pick backlog.** `0.36.0` is published on npm and GitHub Release assets are uploaded; the fresh published-package customer smoke passed on 2026-07-08. Pick the next backlog item below.
- **P0 strategy-doc loose end:** `_SPECS/cards-design-system.md` exists through the `_SPECS` symlink as an untracked strategy-repo file (`relay/_SPECS/cards-design-system.md`). Do not commit/push the strategy repo unless the operator explicitly asks.
- **P0 Codex browser runbook is authoritative.** Use `docs/codex-browser-runbook.md`: in-app Browser/Browser plugin first for unauthenticated localhost/file/public pages; Codex Chrome extension for signed-in/profile state; Computer Use for GUI-only desktop flows; Chrome DevTools MCP only for isolated CDP debugging. Do not treat `open -a "Google Chrome" <url>` as sufficient verification.
- **P0 Codex handoff behavior:** `.codex/hooks.json` intentionally has no `Stop` handoff nudge. Use auto compact or operator-initiated `handoff`; do not re-enable the Stop hook unless asked.
- **P0 Codex frontend-skill behavior:** stale Stagent-era frontend design skills were removed from `.agents/skills` and `~/.codex/skills`. Do not reinstall them. Build any new Relay frontend skill later from current online research, Orionfold design-system docs, and project best practices.
- **Packs Publish:** READ trio + R5 + R4-mechanism are built/released in 0.35.0. R4 CUT remains deferred until the tarball size trigger and open decision #2 (most-installed boundary + Website coordination) are answered. R6/R7 community SEND loop stays last, behind TDR-039 substrate.
- **`pack-depth-next-wave` arc:** Video Creator still needs a clean synthetic reference model before build. Retail Investor remains open: value-heatmap + radar, prosumer-first ICP.
- **`_IDEAS/packs-robustify.md`:** R1+R3+R5 built. Next gate tranche: R2 install-time cross-pack collision check, then R7 integration/`joinKeys`, R4 provenanceOf API, R8 dependsOn when it earns weight.
- **Operator-guided feedback tasks (UNGROOMED, source `output/operator-walkthrough-feedback-2026-07-07.md`):**
  - App/pack shell IA: expose owned tables via progressive disclosure; split primitives into sections with section-appropriate card dimensions.
  - Apps/Packs IA: reconcile around Packs-first naming/copy/routes while preserving installed-vs-bundled clarity.
  - Build/runtime: investigate repeated Turbopack `<dynamic>` warning from `src/lib/plugins/transport-dispatch.ts`; verify scheduled dispatch failure logging does not record failed fires as successful.
  - Web-pack preview/gallery polish: preview should stay inside Relay chrome with separate raw-view action; blank gallery thumbnails should become meaningful thumbnails or be omitted; section-card click behavior must be consistent.

Standing candidates (LOW / reactive):
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

**Telemetry/settings drill-down affordances (CONFIRMED COMPLETE 2026-07-08):** Cleared from the pending operator-feedback list after code/doc verification. `features/dashboard-settings-drilldowns.md` is `status: completed`, `features/changelog.md` records the 2026-07-07 build, `src/components/shell/telemetry-rail.tsx` links telemetry cells to tasks, inbox, projects, workflows, costs, and runtime settings, and `src/components/shell/glance-rail.tsx` links settings rail values to focused `/settings#...` anchors.

**Settings rail simplification (BUILT 2026-07-08, working tree):** Removed the expand/collapse state and expanded `.glance-panel` from `src/components/shell/glance-rail.tsx`; kept only the collapsed rail and migrated expanded-only cells (`Configured`, `Timeout`, `Max turns`, `Preset`) into the always-visible horizontal rail with their focused `/settings#...` links. Updated `src/components/shell/__tests__/glance-rail.test.tsx` to assert migrated drill-down links are visible without expansion and that the expand button is gone. Verification: `npx vitest run src/components/shell/__tests__/glance-rail.test.tsx`, `npx tsc --noEmit`, in-app Browser `/settings` desktop check (no expand button/panel, no body overflow), and 390px check (no expand button/panel, no body overflow, rail scrolls internally).

**0.36.0 published-package customer smoke (PASSED 2026-07-08):** Installed `orionfold-relay@0.36.0` from npm into `/tmp/relay-npm-0.36.0.pqrIXF`; launched `node node_modules/orionfold-relay/dist/cli.js --no-open --port 3198` with `RELAY_DATA_DIR=/tmp/relay-npm-0.36.0.pqrIXF/data` and empty `RELAY_DEV_MODE`/`RELAY_INSTANCE_MODE`; confirmed release artifact download from GitHub, `Mode: production`, `Community Edition`, `bootstrap skipped: no_git`, and route HTTP 200s for `/`, `/chat`, `/tasks`, `/workflows`, `/packs`, `/settings`, plus HTTP 200 for `/_next/static/chunks/066jf0nk75nic.css`. The smoke server was stopped with Ctrl-C.

**Primary container standardization (BUILT 2026-07-08, working tree):** `src/components/shared/page-shell.tsx`, `src/app/tasks/page.tsx`, and `src/app/globals.css` now align non-Chat primary route shells with Home's `surface-page-shell min-h-screen p-5 sm:p-6 lg:p-7` treatment and remove shell border/radius/shadow. Chat was not changed per the `c06abcc3` rollback note. Verification: `npx tsc --noEmit`, `npm run validate:tokens`, in-app Browser geometry checks for `/`, `/tasks`, `/packs`, `/settings`, `/apps/relay-marketing` (0px border/radius, no shadow), 390px mobile checks for `/`, `/tasks`, `/packs` (no horizontal overflow), browser console warnings/errors `[]`.

**0.36.0 release (SHIPPED 2026-07-08, `15dfa445`, npm + GitHub):** Minor release for the Web Designer/publisher arc, pack-first IA/card-system work, publish-target deletion, public web-pack samples, and pack governance. Added `scripts/check-pack-compat.mjs`, `check:pack-compat`, npx-prod-smoke Case TC, `0.36` plugin `apiVersion` with `0.35` compatibility, and publish checkout `fetch-depth: 0` so tag CI can read the `origin/main` baseline. Verification: local `check:pack-taxonomy`, `check:pack-compat`, `check:pack-tarball`, focused pack/API-window tests 12/12, `npx tsc --noEmit`, `npm run build`, local `node scripts/npx-prod-smoke.mjs`, GitHub publish run `28915462795`, npm `orionfold-relay@0.36.0`, GitHub Release assets (`relay-next-build-0.36.0.tgz` 39,143,638 bytes, checksum, SBOM). npm package tarball is 2.4 MB / 7,320,771 bytes unpacked.

**Operator walkthrough follow-ups (GROOMED 2026-07-07, `4141a4ad`):** Added bounded specs from `output/operator-walkthrough-feedback-2026-07-07.md` and an "Operator Walkthrough Follow-ups" tranche to `features/roadmap.md`; `features/changelog.md` records the grooming.

**Web Designer live GitHub Pages smoke + polished republish (COMPLETED 2026-07-07):** Polished Web Designer publish remains live at `https://orionfold.com/relay-web-smoke/`; latest deployment `da6cd84c-061b-494b-ac41-f8d691700083`, commit `d22251ead78c90696be3156d90e296cbe866e9da`, artifact hash `981b9074823d77978dd81f9307ecb7d3b418f5c875c648cd2c79bb52e9f7f9cc`. First publish failed with Contents 403, then succeeded after token permissions were fixed.

**Privacy cleanup and peer-reference guardrails (BUILT 2026-07-07, `5b491819` + `53e5de5d`):** Sanitized public pack seed files and added privacy regressions. Durable memory already records "Pack template seed data is public package surface."

**Workflow Hub funnel-row UX fix (BUILT 2026-07-07, `f45ea422`):** Added `fullWidth` secondary-slot contract so Relay Marketing `Lead funnel` renders full-width above normal workflow cards.

**Packs Publish P1 READ-trio + R5 + R4-mechanism (BUILT 2026-07-06, RELEASED 0.35.0):** R1 index-schema, R2 remote-resolver, R3 provenance-tiers, R5 standard-versioning, R4-mechanism. Memory `packs-publish-authored`.
