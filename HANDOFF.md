# Relay — HANDOFF

_Last updated: 2026-07-07 (pt: **Web Designer pack family built in working tree; next session should
start in web preview for a guided web* walkthrough; live GitHub Pages smoke still open.** Added strict
`galleries` view binding + renderer/loader, real `relay-web-assets`, `relay-web-publisher`, and
`relay-web-designer` templates, taxonomy/bundled allowlist updates, and `features/pack-web-designer.md`.
Verification: focused suite 72/72 passed, `check:pack-tarball` passed (12 bundled packs, 219.3 KB / 500 KB),
`check:pack-taxonomy` passed, `npm run build` passed with known Turbopack dynamic-trace warnings, isolated
install of `relay-web-designer` succeeded, built-server smoke returned `/packs` 200,
`/apps/relay-web-designer` 200, preview API 201, preview artifact 200. Local dev instance now has the
Relay license fixture saved and `relay-web-assets`, `relay-web-publisher`, `relay-web-designer` installed;
no live GitHub Pages publish yet.)_

## ▶️ NEXT SESSION — Web preview walkthrough, then live publish smoke

- **P0 START HERE — guided `web*` pack walkthrough in the in-app web preview:** Open the app in the
  visible in-app browser, start at `/apps/relay-web-assets`, then walk step-by-step through
  `relay-web-assets`, `relay-web-publisher`, and `relay-web-designer`. Drive the UI in the web preview while
  describing in chat what is happening and why (what rows/tables/profiles/blueprints each pack owns, what the
  gallery primitive proves, how publisher preview/publish works, and how the bundle composes the two children).
  Keep `output/operator-walkthrough-feedback-2026-07-07.md` open for append-only notes: browser state, console
  logs, operator comments, defects, and UX fixes. The current local instance already has a valid Relay license
  (`OF-RELAY-VERIFY-20260701`) and all three Web packs installed via `/api/packs/install`; browser verification
  showed `/packs` and `/apps/relay-web-designer` clean with no console warnings.
- **P0 Web Designer live publish smoke + TDR-039 acceptance:** Phase 5 pack content is now in-tree and
  installable in the working tree. Remaining acceptance item: configure a real GitHub Pages target through the UI,
  publish the exact local preview artifact, verify the public Pages URL, then move TDR-039 proposed→accepted.
  If any API contract changes before release, grep `scripts/npx-prod-smoke.mjs` first.
- **P0 release-response: publish or rewrite the cleaned history.** Local `main` now contains the seed fix,
  private-peer guardrail, strategy cleanup, and funnel-row fix. Registry latest is `0.35.2`; these newest cleanup
  commits are not yet on npm. Next decision: either push + patch-release `0.35.3` first, or proceed with the planned
  history rewrite/removal sequence. If releasing, rerun the npx prod smoke, bump/tag/push, then verify
  `npm view orionfold-relay versions --json` and the GitHub release/tag state. If rewriting, include
  `5b491819`, `53e5de5d`, and `f45ea422` in the clean branch before force-push.
- **P1 operator walkthrough grooming:** turn `output/operator-walkthrough-feedback-2026-07-07.md` into
  feature requirement specs/backlog items. Source asks include telemetry/settings drill-downs, Apps→Packs IA
  consolidation + Chat copy, app/pack shell owned-table disclosure, primitive-section layout
  (Workflows/Schedules/Tables), app-detail card sizing, app-detail scroll/focus behavior, plus bug follow-ups for
  the Turbopack `<dynamic>` warning and scheduled lead-list hygiene `Lead` variable failures.
- **Packs Publish — P1 READ trio (R1/R2/R3) + R5 + R4-mechanism ALL BUILT + RELEASED in 0.35.0**
  (`e6dde729`, `92d5a808`, `bf7619b8`, `f6b1029d`, `b7f3b3d1` — shipped with the Phase-2 bundle). **R4's CUT is deferred with a live
  trigger:** the `check:pack-tarball` size gate fires when templates cross 500 KB (≈22 packs) AND open
  decision #2 (most-installed boundary + Website coord) is answered; the cut also needs the §5 managed-base
  overlay slot for fetch-then-cache. **R6/R7 (community SEND loop) sequence LAST, behind the TDR-039
  substrate.** Still-open packs-publish decisions to raise at their build: #1 canonical index URL (DRAFTED
  into `strategy/relay/_RELAY.md` 2026-07-06, awaiting Website peer; `DEFAULT_PACK_INDEX_BASE` placeholder +
  `RELAY_PACK_INDEX_URL` override drives smoke), #2 slim-cut boundary (R4 cut), trust-ceiling final default
  (R3 seam built / R7), partner-key onboarding (R3 `of-packs-official-2026` key — coordinate w/ licensing
  issuer owner). `_IDEAS/packs-publish.md` = durable source thesis; memory `packs-publish-authored` carries
  all build findings + reuse anchors.
- **Web Designer substrate anchor:** Phase 1+2 RELEASED in 0.35.0/0.35.1; Phase 3+4 COMMITTED in
  `28f17d77` + `19bc6f70`, UNRELEASED; preview-first COMMITTED in `0d2e29c5`, UNRELEASED; Phase 5 pack family
  BUILT in the working tree, UNCOMMITTED. Delete target remains a later enhancement because no DELETE route exists
  yet. Build findings + anchors: `features/publish-preview-artifacts.md`, `features/pack-web-designer.md`,
  focused tests, and memory `generator-publisher-substrate-tdr039`.
- **`pack-depth-next-wave` arc — other tickets still open:** **Video Creator** (under-specified; needs a clean
  synthetic reference model before build) and **Retail Investor** (`relay-portfolio`+`relay-technical-analyst`:
  value-heatmap + radar; §9 ICP prosumer-first). `decisions_open`: when-dependsOn-earns-weight (P3 trigger).
- **`_IDEAS/packs-robustify.md` — R1+R3 BUILT (2026-07-06, `b43f1b69`); R2/R5/R7/R8 still ungroomed.** The
  packs governance layer (six pillars: codified taxonomy · provenance API · compat-diff gate · dependsOn
  guardrails · integration contract · distribution-at-scale). §10 is a 9-row table (R1–R9). Groom the next
  gate tranche: **R5** (compat-diff CI gate — the other highest-leverage gate, §11) pairs naturally with R3;
  then R2 (install-time cross-pack check, runtime-adjacent → dev smoke), R7 (integration/`joinKeys`), R4
  (provenanceOf API). R8 (dependsOn) stays P3/trigger-gated. **R9 (distribution at scale) is now MATERIALIZED
  as its own doc — `packs-publish.md` (authored 2026-07-06, ready to groom — top of ▶️ above).**
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
  MINOR bump (now `{0.33, 0.32}` set in `84be9825`); the window test derives its expected window from
  package.json, so it fails loudly until every site bumps together. Needed on EVERY MINOR (S38→S39 near-miss:
  a handoff once wrongly said "no bump needed" — it always is). A PATCH (e.g. 0.33.1) does NOT bump it.
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
- **Row-insert trigger vars MUST be row-fillable (install-enforced, 0.33.1):** a `required` var on a
  row-insert blueprint needs a `{{row.<col>}}` default (or a column named like the var); else `install.ts`
  block 2d refuses the pack. Convention = optional+`{{row.col}}` default (memory
  `pack-backward-compat-convention`). `buildVariables` expects a PARSED object; `tables.listRows().data`
  is a JSON STRING — parse before feeding it.
- **docs/index.md + docs/features|journeys|use-cases are GITIGNORED** (generated corpus).
  Public docs = README + SECURITY.md + docs/trust/ + docs/RELEASING.md +
  docs/plugin-security.md. Trust-doc claims must stay code-true.
- **Pre-existing test failures (NOT regressions), 8** (re-confirmed 0.32.0 by stash-and-run on the pre-bump
  tree): `router.test.ts` (6), `settings` validator (1), `settings/glance` shadow-path (1); plus `src/__tests__/e2e/blueprint.test.ts`
  is environmental (needs a running dev server). `agency-pro-update.test.ts` can flake under the full
  parallel run (row-trigger timing) — passes in isolation.
- **`next` PINNED exactly (16.2.4)**; Next 16 emits `.next/node_modules` symlinks — the
  artifact ships a manifest + CLI relinks (junction on win32). See #10 spec.
- **Nav IA (S13, `119e6ba8`):** permanent two-tier bar (tier-1 underline / tier-2 pill), each tier scrolls,
  Apps top-level w/ live instances as tier-2. Spec `features/nav-redesign-ia.md`; Compose peers +Presets
  (memory `compose-submenu-elevation-pattern`).
- **Blueprint/profile content must pass its Zod schema** — the registry skips invalid files
  with only a console.warn (→ "Blueprint not found" at first trigger).
- **Budget guardrails' plan-price substitution is INTENTIONAL** — display surfaces read
  `meteredSpend`/`planPricedMonthlyMicros` from the snapshot instead (S8).

## Anchors
- **Strategy repo = read/write only unless explicitly instructed** (memory `strategy-repo-readwrite-only`): edit
  freely, but commit/push/merge only on an operator request. This session's strategy commits were explicitly requested.
- **Work directly on `main`** — no worktrees/branches unless operator asks (memory `work-on-main-no-worktrees`).
- **npm publishing via OIDC** (`publish.yml` on `vX.Y.Z` tag), GATED by the npx prod smoke
  (Case L exercises the REAL relay-agency-pro); every release attaches a **CycloneDX SBOM**. Tag must be
  ANNOTATED (`git tag -a`) or publish CI never fires (memory `release-tag-must-be-annotated`).
- **Smoke-test budget** (CLAUDE.md): runtime-registry-adjacent changes need a real launch smoke.
- **gh issue/label writes are ALLOWLISTED** (memory `autonomous-session-permission-gates`).
- **Check git history for prior art**; **verify field reports before fixing** (memories).

## Recently shipped
**Web Designer pack family / TDR-039 Phase 5 (BUILT 2026-07-07, UNCOMMITTED):** Added the real
`relay-web-designer` bundle over `relay-web-publisher` + `relay-web-assets`; the standalone `gallery` Core
primitive (`view.bindings.galleries` schema, loader, and `GalleryPreviewView`); synthetic `web_sections` and
`web_assets` seed tables; taxonomy/bundled allowlist updates; and `features/pack-web-designer.md`. The publisher
child declares `static-site` generate + `github-pages` publish so the app detail mounts the existing preview/publish
panel. Verification: focused tests 72/72 pass; `check:pack-tarball` OK (12 bundled packs, 219.3 KB / 500 KB);
`check:pack-taxonomy` OK; `npm run build` passes with known Turbopack dynamic-trace warnings; isolated smoke install
of `relay-web-designer` succeeded and built-server route smoke returned `/packs` 200, `/apps/relay-web-designer` 200,
preview API 201, preview artifact 200 with expected generated HTML. Operator then saved the valid local license
fixture and installed `relay-web-assets`, `relay-web-publisher`, and `relay-web-designer` in the dev instance;
browser verified `/packs`, `/apps`, and `/apps/relay-web-designer` with no console warnings. Still open: guided
web-preview walkthrough, live GitHub Pages publish through UI, and TDR-039 proposed→accepted.

**Privacy cleanup and peer-reference guardrails (BUILT 2026-07-07, `5b491819` + `53e5de5d`; strategy
`c7a0a6e`):** Sanitized the
`relay-crm`/`relay-social` public seed files after confirming real Orionfold marketing/prospecting examples had
shipped in npm package versions `0.33.0` through `0.35.1` (`package.json` ships `src/`). Replaced
`lead_research`, `channels`, `campaigns`, `content_assets`, `ad_initiatives`, and beehiiv-specific consent copy with
synthetic examples; updated manifest comments; added template/spec privacy regressions against known leaked markers,
private local peer paths, and `north-star`/`harvest` provenance terms. Strategy pack docs now require clean synthetic
reference clones instead of local private peer projects. Verification: focused tests pass, local extracted npm tarball
scan clean for private-peer + known Marketing leak markers, `git diff --check` pass. Memory promoted:
`MEMORY.md` -> "Pack template seed data is public package surface."

**Workflow Hub funnel-row UX fix (BUILT 2026-07-07, `f45ea422`):** User spotted that Relay
Marketing's `Lead funnel` was structurally below the 1-2-3 workflow intro but visually squeezed into the
secondary masonry columns, causing overlap/partial hiding by `Lead Enrich` and `Repurpose`. Fix adds a
`fullWidth` secondary-slot contract and renders full-width slots as their own rows before resuming masonry for
normal workflow cards. Verification: focused workflow-hub tests 21/21 pass; prior in-app browser live route confirmed
the funnel takes the full content width and cards start below it.

**TDR-039 preview-first local artifacts (BUILT 2026-07-07, `0d2e29c5`, UNRELEASED):** Added a durable
preview artifact store under Relay data dir with `meta.json` + file hashes + expiry cleanup; `POST
/api/apps/:id/preview`; `GET /api/apps/:id/previews/:artifactId/...` with traversal/cross-app/hash/expiry
guards and defensive headers; optional `artifactId` on `POST /publish`; stale-preview refusal via
`PREVIEW_STALE`; and preview-first `AppPublishPanel` UI. Verification: focused tests 23/23 pass; `npm run
build` passes with known Turbopack dynamic-trace warnings; dev route smoke returned named `APP_NOT_FOUND` 404.

**Repo-local agent skills/hooks sync (2026-07-07, `72706130`):** Added `.agents/skills/` and `.codex/hooks/`
as repo-local agent surfaces. Verification: commit succeeded; `git diff --cached --check` flagged trailing
whitespace in imported/vendor skill files and schemas, intentionally left as source-sync content.

**TDR-039 Phase 3+4 (BUILT 2026-07-07, `28f17d77` + `19bc6f70`, UNRELEASED):** Phase 3 added the
app-scoped publish service/routes (`publish`, `publish-targets`, `deployments`), row JSON parsing before
`static-site`, masked target responses, durable deployment status, named failure errors, and the trust-doc
GitHub Pages SEND row. Phase 4 added the app-detail publish panel gated by manifest generate/publish bindings:
create/test GitHub Pages target, select target, publish, poll deployments, block duplicate active publishes, and
surface failed deployment errors. Verification: focused tests 14/14 pass; `npm run build` passes with the known
Turbopack dynamic-trace warnings.

**Substrate Phase 1 (TDR-039) BUILT (2026-07-06, `b9fcb674`, UNRELEASED — bundles with the packs-publish
tail in a future release):** PublisherAdapter registry + `github-pages` Contents-API adapter + minimal
`GeneratorAdapter` + `publish_targets`/`deployments` at all four storage points; 26 TDD tests + isolated
dev-boot smoke. Same-day docs commits: `c8d11283` (packs-publish paper trail + R6/R7 specs) + `c323e0ca`
(the Phase-1 spec — anchor-corrected `src/lib/apps/`→`src/lib/packs/`, both design Qs resolved). Memory
`generator-publisher-substrate-tdr039` carries the build findings.

**Packs Publish P1 READ-trio + R5 + R4-mechanism (BUILT 2026-07-06, UNRELEASED — no version bump; a future
release bundles them, packs-publish is READ-only / no apiVersion bump):** R1 index-schema (`e6dde729`), R2
remote-resolver (`92d5a808`), R3 provenance-tiers (`bf7619b8`), R5 standard-versioning (`f6b1029d` — early
`relayCore` skip + RELEASING.md 3-axis checklist), R4-mechanism (`b7f3b3d1` — `bundled.ts` SSOT +
`check:pack-tarball` size-gate Case TB; the CUT deferred, trigger @500 KB). Memory `packs-publish-authored`
+ `dont-ask-when-codebase-answers`. Full findings in git + that memory.

**Older (RELEASED — full detail in git + CHANGELOG + closed issues + linked memories):** 0.34.0 (`cab55bd1`,
#41 funnel-flow Core primitive Attract→Capture→Nurture→Convert + `mergeBundle` charts/funnel shadow-path fix,
memory `funnel-flow-primitive-built`); 0.33.1 (`7d2baa99`, row-insert var-mapping fix + `install.ts` block 2d
`assertRowTriggerVarsFillable`, memory `pack-backward-compat-convention`); 0.33.0 (`84be9825`,
#40 Marketing line — `relay-crm`+`relay-social`+`relay-marketing` splitting bundle, memory
`pack-marketing-line-built`); 0.32.1 (`d30615ee`, 3D origami logo, memory `logo-3d-swap-recipe`); 0.32.0
(`b181a24d`, #39 packs-evolution arc — persona/industry split + bundle model + taxonomy, memories
`persona-pack-manual-automated-split`/`pack-bundle-flatten-model`/`pack-taxonomy-shared-registry`/
`packs-license-price-is-shared-not-per-pack`/`resurface-before-build-primitive-pattern`); 0.31.0 (`a661054e`,
F5 card lift + F6 Schemas→Data, memories `card-watermark-recipe`/`card-watermark-taste-rule`); 0.30.0
(`8519e9af`, final 4 walkthrough reqs, memories `two-verb-run-is-blueprint-only`/`compose-submenu-elevation-pattern`);
0.29.1 (`e210e49a`, #31 blueprint-card
husk fix, memory `blueprint-card-husk-root-cause`); 0.29.0 (`9b9ea0f2`, relay-website dark chrome + FEAT-14/15/16
GlanceRail, memory `chrome-sticky-stack-additive-offsets`); 0.28.0 (`v0.28.0`→`7e97669a`, nav/naming
+ Profiles→Agents rename, memory `profiles-are-file-based-not-db`); 0.27.0 (`f29f0098`, packOf/PackPill +
FEAT-7/8 + BUG-6 pack-aware seed, memory `seed-clears-pack-tables-and-addrows-fires-triggers`); 0.26.0
(`5db27412`, fix specs #31-37, memories `apiversion-window-bump-at-version-bump` + `prod-smoke-encodes-contracts`);
0.25.1 (`982a1ed9`→`ab1bbcfe`, staging-R2 fixes #29/#30, memory `self-http-calls-hardcode-3000`); 0.25.0
(`2a50f91a`, app-activation #27 + workflow HITL #28, memory `workflow-status-vocab-active-not-running`); 0.24.1
(customer fixes #24/#25/#26); 0.24.0 (legacy-brand); Staging-harness arc (S20–S23); 0.23.0 ← 0.16. Full
history: `git tag` + CHANGELOG + `git log`.
