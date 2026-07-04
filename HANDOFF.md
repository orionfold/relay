# Relay — HANDOFF

_Last updated: 2026-07-04 (pt: **S45 — Profile→Agent sweep (the S43-DEFERRED item) DONE on main, UNRELEASED,
UNCOMMITTED**. 12 files, all label/copy, ZERO wire contracts touched — finishes the S43 rename's presentation
layer. Renamed the `ToolGroup` union member + icon/order keys + 5 tool `group:`/descriptions (`tool-catalog.ts`),
`GROUP_TO_TAB` key (`command-tabs.ts`, the `satisfies Record<ToolGroup,…>` forced it), popover entity label +
system-prompt `### Agents` heading, and the user-facing **primitive-pill label** `Profile`→`Agent`/`agents`
across its FOUR parallel paths (`composition-detector.ts`, `buildPrimitivesSummary` in `registry.ts`,
`starter-template-card.tsx`, chat catalog) — the sweep grew 3→8 sites because a coherent rename covers the
whole vocabulary surface, not one path. **KEPT (wire contracts):** tool names `list_profiles`/`create_profile`
etc., `entityType:"profile"` key, `profileId`/`profileName`, manifest `profiles:` YAML key, `@/lib/agents/
profiles/*`, `~/.relay/profiles`. 6 asserting tests updated; 974 pass / 1 skip / 0 fail across chat+apps+packs+
components. Not runtime-registry-adjacent (pure strings) → no dev smoke needed. Same stale `.next/types` LSP
phantoms as S44 (memory `next-types-validator-stale-after-rename`) — vitest is truth. **Uncommitted; folds into
next MINOR alongside CF-FEAT.** Prior: S44 CF-FEAT-5/6/7/8 app-shell copy pass (`b4616d2c`, unreleased);
0.28.0 RELEASED (`v0.28.0`→`7e97669a`) — full detail: git log + CHANGELOG.)_

## ▶️ NEXT SESSION — remaining design cluster (no unreleased-release work; CF-FEAT foldable)

`main` carries the unreleased CF-FEAT copy pass (`b4616d2c`, committed) + the S45 Profile→Agent sweep
(UNCOMMITTED — commit it first); fold BOTH into the next release (MINOR → apiVersion window bump). Remaining
work is design-shaped, no acute defect:
- **Top-chrome design initiative** (FEAT-9/10/11/11b/12/14/15/16, backlog): ONE design spec decides
  tokens/z-layers/offsets once — no acute defect.

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

**Older (in git + CHANGELOG + closed issues):** 0.25.0 (S33, `2a50f91a`, FEAT-5/6/7/8 app-activation redesign
#27 + BUG-3 workflow HITL #28, memory `workflow-status-vocab-active-not-running`); 0.24.1 (S25–S27, customer
fixes #24/#25/#26); 0.24.0 (S19, legacy-brand + apiVersion 0.23→0.24); Staging-harness skill arc (S20–S23);
0.23.0 (packs gallery + founding price) ← 0.16. Full history: `git tag` + CHANGELOG + `git log`.
