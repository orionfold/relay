# Relay — HANDOFF

_Last updated: 2026-07-03 (pt: S13-nav — **nav redesign SHIPPED to working tree** (uncommitted, 41
files): wrote `features/nav-redesign-ia.md`, retired `/analytics` + `/environment*` (routes+dashboards
DELETED; load-bearing `src/lib/environment` infra — `workspace-context` 23 importers, `data`,
`auto-scan`, `skill-enrichment` — PRESERVED, memory `environment-folder-is-two-things`), built the
permanent two-tier bar (Apps promoted top-level w/ live instances + "+N more"; tier-1 underline-TAB /
tier-2 pill-SELECTION hierarchy). `tsc` clean, 14/14 nav tests, browser-verified: retired routes 404,
Apps promotion + deep-route active-state correct. **NOT committed yet.** Also: rg-`-r` corruption bug
root-caused (known bug #62016) → memory `rg-never-dash-r-flag`; reinstalled corrupt
`@next/swc-darwin-arm64` binding (`--no-save`; CLAUDE.md Quick Start gotcha). Prior tail: S12 full ICP
walkthrough (0.23.0, R4 clean) → 2 Agency Pro blockers + fix specs =
`output/staging/2026-07-02-full-suite/FINDINGS.md`; S11-S1..S4 — see git log + beacon.)_

## ▶️ NEXT SESSION — Agency Pro blockers + commit nav
- **🔴 P0 · `features/fix-packs-ui-install-core-version.md`** — /packs UI Install DOA on npx:
  relay-core resolves to `0.0.0` in the Next.js server (tsup version-define only in `dist/cli.js`,
  never injected into the `.next` bundle) → every pack install rejected in UI; CLI works. Fix =
  add the version define to the Next.js build. Verified at code + reproduced (HTTP 422). **Needs a
  real launch smoke** (runtime-adjacent, CLAUDE.md budget).
- **🔴 P1 · `features/fix-pack-install-blueprint-cache.md`** — installed pack blueprints invisible
  to the running server: stale in-process `blueprintCache` (registry.ts:16) after an out-of-process
  CLI install → all 6 Agency Pro chapters fail "Blueprint not found" at dispatch. **Largely
  downstream of the P0** (a UI install reloads in-process). Fix = mtime self-heal or reload trigger.
- **Commit the nav redesign** — S13 built + verified it but it is UNCOMMITTED (41 files;
  `features/nav-redesign-ia.md` + shell rewrite + `/analytics`+`/environment*` retirement). Fold into
  the 0.23.1 patch or its own commit. **Route-census pattern still open:** the freeze created a
  systematic "nav-hidden but live" limbo — analytics + environment are now truly retired, but audit
  whether OTHER "cut" features are also still live-by-URL (verify vs `_SPECS/feature-cut-freeze.md`).
- **App-copy sweep (operator directive → memory `app-copy-standard`)** — scrub ALL user-facing copy
  of em-dashes + AI-slop tells, grade 3–5, pyramid principle, progressive disclosure. Sweep targets:
  runtime modal, welcome hero, Agency Pro pack `description`, empty-states, compose-agent narration.
- **Legacy-brand leaks (3 layers, memory `legacy-rebrand-divergence-bugs`)** — "stagent" in built-in
  profile authors; "ainative" in the live compose-agent narration + `$AINATIVE_DATA_DIR` in installed
  manifests (deprecated-but-load-bearing alias). Classify each before editing.
- **Next release is a PATCH (0.23.1)** unless features land first — two `[Unreleased]` fix entries
  ready (#22/#23); patch = NO apiVersion-window bump. The 2 fix specs above would fold in here.
- **Publish-gate price-drift check** — still blocked on Website later-12; when answered, add the
  drift diff to the npx prod smoke / publish gate.

### Staging harness — S2/S4 still queued (S3 scope done manually in S12)
- **S2** `staging-cli-run` + **S4** `staging-evaluate` skills still to build; S3 `staging-browser-smoke`
  proven manually (enriched `_IDEAS/icp-agency-journeys.md`), auto-skill open. Full scope:
  `_SPECS/relay-staging-harness.md` §8.
- **`file://` mirror is per-BUILD** — `npm run build && node scripts/build-prebuilt-artifact.mjs`
  BEFORE any staging verify (memory `staging-artifact-rebuild-before-verify`).
- Constraints: work on `main`; `_SPECS`/`_IDEAS` edit-only (strategy repo owner commits); paid-frontier
  OK'd for agent steps; harness-side instrumentation only.

**PLG-4 stays reactive** (rulings in plg-refine §4/§5): free-key **DEFERRED**, founding-supporter loop
**DROPPED** (price is live via #20), reverse trial **DEAD** (violates the promise). **Relay channel:**
later-9/10/11 ACTED (T-30 renewal email LIVE); **later-12 OPEN** — Website to adopt the promise phrase
on /relay/ + /promise/ + email + optional machine-readable pricing (kills the drift class). Standing:
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
  literal (registry.ts) + `examples/*/plugin.yaml` IN the release commit ONLY on a MINOR
  bump (0.22 window in `d1f16046`); the window test fails loudly until package.json bumps.
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
- **Nav IA (S13, uncommitted):** permanent two-tier bar — tier-1 underline-tab / tier-2
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
**main (unreleased):** #22 onboarding-pref keepalive (`55b3ae7d`) + #23 fresh-boot noise
(`70db6926`); nav redesign built-but-uncommitted (S13). **Latest release 0.23.0** (packs gallery +
founding price). Full version history (0.16→0.23) + per-session detail: `git tag` + CHANGELOG + beacon
`recent[]`.
