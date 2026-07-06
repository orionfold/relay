# Relay — HANDOFF

_Last updated: 2026-07-06 (pt: **BUILT Packs Publish R1 + R2** — the distribution standard's READ half.
R1 `pack-canonical-index` (`e6dde729`): `src/lib/packs/index-schema.ts` — the `orionfold.packs/v1` Zod schema +
pure `parsePackIndex`/`findIndexEntry` (zero-import leaf, taxonomy.ts discipline) + committed fixture
`__tests__/fixtures/pack-index.json`; drafted the open-decision-#1 note (canonical index URL) into
`strategy/relay/_RELAY.md` (edit-only, uncommitted). R2 `pack-remote-resolver` (`92d5a808`): `src/lib/packs/remote.ts`
(the ONE egress — `fetchPackIndex`+`fetchPackDir` reuse `prebuilt-download.ts` `downloadToFile`/sha256; per-pack
`.tgz` shape, operator-confirmed) + `resolvePackSourceAsync` in `catalog.ts` (the one branch, local-first, ZERO
network for bundled) + `installPack` wired + bundle-child fence kept shut (tested) + `data-flow.md` egress row #11.
Two shadow-path findings: **fail-OPEN on the index read** (unreachable index → helpful `UnknownPackNameError`, not a
raw net error) + **trust-doc drift** (R2's GET falsified "no call to orionfold.com"; corrected). Real `tsx` dev smoke
(no mocks) proved fetch→sha→extract→parse→DB-write + tamper-reject end-to-end. 0 new regressions. Memory
`packs-publish-authored` updated. Prior tail: packs-publish GROOM → 7 specs (same commit family), packs-robustify
R1+R3 (`b43f1b69`), 0.34.0 funnel-flow (`cab55bd1`), Web Designer TDR-039 (`features/architect-report.md`, open),
0.33.x/0.32.x — full detail in git + CHANGELOG.)_

## ▶️ NEXT SESSION — build `pack-provenance-tiers` (R3) OR Web Designer specs / R5-tranche

- **Packs Publish — R1 + R2 BUILT 2026-07-06 (`e6dde729`, `92d5a808`); NOT released (no version bump).** Build
  **R3 `pack-provenance-tiers`** next — the third P1 READ-trio spec: verify each index entry's `sig`/`keyId`
  offline against the licensing embedded-key map (`verify.ts:37-40` + `canonicalize.ts`), tiers official/partner/
  community + a trust badge. **The `entry` is ALREADY threaded** into `installPack` as `indexEntry` (`void`-ed with
  a pointer comment at the acquire seam) — R3 wires the verify there. **R6/R7 (community SEND loop) sequence LAST,
  behind the TDR-039 substrate** (shared GitHub publisher adapter with the Web Designer ticket). **Open decision #1
  (canonical index URL) is DRAFTED into `strategy/relay/_RELAY.md`** (2026-07-06, edit-only/uncommitted — the
  strategy owner commits) awaiting the Website peer; `DEFAULT_PACK_INDEX_BASE` in `remote.ts` is a placeholder +
  `RELAY_PACK_INDEX_URL` override drives smoke/mirrors until confirmed. 3 open decisions remain (slim-cut R4,
  trust ceiling R3/R7, partner-key onboarding R3) — raise each at its build. Then R4/R5 (P2), R6/R7 (P3).
  `_IDEAS/packs-publish.md` stays the durable source thesis. Memory `packs-publish-authored` carries the build
  findings + reuse anchors.
- **Web Designer ticket — TDR-039 done, specs next (may SHARE the packs-publish GitHub publisher adapter).**
  The generator/publisher substrate is DESIGNED
  (TDR-039 proposed + `features/architect-report.md`). Next: author `features/pack-web-designer.md` (the
  bundle) + a substrate feature spec from the report's 5-phase sequence, then implement **Phase 1** (substrate
  types + `GeneratorAdapter`/`PublisherAdapter` registries + `publishTargets`/`deployments` storage +
  `github-pages` adapter, behind tests). **2 open design Qs to resolve at spec time:** (a) where `generate:`
  sits so `rewriteViewRefs` (install.ts:674, recursive) UUID-rewrites its table refs for free — or extend the
  rewriter; (b) does the generation half mirror the document-processor registry (TDR-017)? **Operator scope
  locks:** Web Publisher DOES generate+deploy real artifacts (not sync-only); it's the family template.
  The gallery primitive (`view.bindings.gallery`) is a plain Core primitive independent of the substrate →
  Web Asset Manager is useful standalone. TDR-039 promotes proposed→accepted after a live publish smoke.
- **Substrate build discipline (from TDR-039):** any new `view.bindings`/manifest arm must be added to the
  `mergeBundle` accumulator (`bundle.ts` ~L152) or it vanishes in a bundle (the funnel shadow-path lesson);
  prefer the GitHub Contents API over shelling `git` (avoids the heavier `child_process` capability);
  `publishTargets.config` NEVER returned unmasked (new drift check). Smoke-budget: publisher is
  runtime-registry-adjacent → real dev-server publish smoke, not just unit tests.
- **`pack-depth-next-wave` arc — other tickets still open:** **Video Creator** (harvest source `tbd` — under-
  specified, needs a north-star named) and **Retail Investor** (`relay-portfolio`+`relay-technical-analyst`:
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
- **Strategy repo = read/write only** (memory `strategy-repo-readwrite-only`): edit, NEVER commit/push/merge.
- **Work directly on `main`** — no worktrees/branches unless operator asks (memory `work-on-main-no-worktrees`).
- **npm publishing via OIDC** (`publish.yml` on `vX.Y.Z` tag), GATED by the npx prod smoke
  (Case L exercises the REAL relay-agency-pro); every release attaches a **CycloneDX SBOM**. Tag must be
  ANNOTATED (`git tag -a`) or publish CI never fires (memory `release-tag-must-be-annotated`).
- **Smoke-test budget** (CLAUDE.md): runtime-registry-adjacent changes need a real launch smoke.
- **gh issue/label writes are ALLOWLISTED** (memory `autonomous-session-permission-gates`).
- **Check git history for prior art**; **verify field reports before fixing** (memories).

## Recently shipped
**0.34.0 (RELEASED — `v0.34.0`→`cab55bd1`; publish CI `28815321497` green incl. npx prod smoke; npm `latest` +
GitHub Release + SBOM; MINOR, apiVersion window 0.33→0.34; issue #41):** the funnel-flow Core primitive — the
Attract→Capture→Nurture→Convert band-flow (`pack-depth-next-wave` first build ticket; the chart fenced out of
`pack-marketing-line` §6). `.strict()` `FunnelSpecSchema` on `ViewSchema.bindings.funnel` (enumerated bands,
discriminated `count` union `sumColumn`|`rowsWhereIn`|`rowsRecent`, refs named `table` for `rewriteViewRefs`
UUID-rewrite) + pure `computeFunnelBands` (`funnel-compute.ts`, 9 TDD tests) + `loadFunnelData` + `FunnelFlowView`
(HTML+CSS, no D3) in tracker+workflow-hub; wired into `relay-crm` → renders in merged `relay-marketing`. Fixed a
`mergeBundle` binding-allowlist shadow-path (was dropping `charts`+`funnel` in bundles). Real-data smoke caught a
synthetic-fixture bug → active-filter is EXCLUSION (`excludeValues:[deprecated]`). Memory `funnel-flow-primitive-built`.

**0.33.1 (RELEASED — `v0.33.1`→`7d2baa99`; publish CI `28808826797` green; npm `latest` + SBOM; PATCH):**
row-insert var-mapping fix. 4 shipped blueprints (`relay-crm--lead-enrich`, `relay-social--repurpose` +
`--welcome-creative`, `relay-cre--lease-abstraction`) declared a `required` trigger var with no `{{row.col}}`
default → threw `Missing required variables` at first fire; fixed all to optional+`{{row.col}}` default (matching
`relay-agency-pro`/`relay-nonprofit`). Added `install.ts` block 2d `assertRowTriggerVarsFillable` — refuses any
unfillable-trigger-var pack loudly (Principle #1). Fix `4266687e`, release `7d2baa99`. Tests:
`row-insert-var-fillability.test.ts` + bundle test dispatch-fill assertion; `buildVariables` exported. Memories
`pack-backward-compat-convention` (additive-only + relayCore lever + this rule), `dont-ask-when-codebase-answers`.

**0.33.0 (RELEASED — `v0.33.0`→`84be9825`; publish CI `28789149553` green; npm `latest` + GitHub Release + SBOM;
issue #40):** the Marketing line. `relay-crm` + `relay-social` child packs + `relay-marketing` splitting bundle
(one purchase → two Functional-domain packs, bound by `utm_campaign`), all premium (`product:orionfold-relay`),
harvested from `~/orionfold/marketing`. Taxonomy updated (Marketing-family ids disjoint from Agency). feat
`d0303f24` + release `84be9825` (apiVersion window 0.32→0.33). Two build findings in memory
`pack-marketing-line-built`: (1) cross-child attribution must be a `kpis` binding not `charts` (charts don't
survive bundle merge); (2) the row-insert var-mapping gap — FIXED in 0.33.1 above.

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

**Older (RELEASED — full detail in git + CHANGELOG + closed issues):** 0.29.1 (`e210e49a`, #31 blueprint-card
husk fix, memory `blueprint-card-husk-root-cause`); 0.29.0 (`9b9ea0f2`, relay-website dark chrome + FEAT-14/15/16
GlanceRail, memory `chrome-sticky-stack-additive-offsets`); 0.28.0 (`v0.28.0`→`7e97669a`, nav/naming
+ Profiles→Agents rename, memory `profiles-are-file-based-not-db`); 0.27.0 (`f29f0098`, packOf/PackPill +
FEAT-7/8 + BUG-6 pack-aware seed, memory `seed-clears-pack-tables-and-addrows-fires-triggers`); 0.26.0
(`5db27412`, fix specs #31-37, memories `apiversion-window-bump-at-version-bump` + `prod-smoke-encodes-contracts`);
0.25.1 (`982a1ed9`→`ab1bbcfe`, staging-R2 fixes #29/#30, memory `self-http-calls-hardcode-3000`); 0.25.0
(`2a50f91a`, app-activation #27 + workflow HITL #28, memory `workflow-status-vocab-active-not-running`); 0.24.1
(customer fixes #24/#25/#26); 0.24.0 (legacy-brand); Staging-harness arc (S20–S23); 0.23.0 ← 0.16. Full
history: `git tag` + CHANGELOG + `git log`.
