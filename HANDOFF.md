# Relay — HANDOFF

_Last updated: 2026-07-03 (pt: S12-walkthrough — ran the **full ICP staging walkthrough** (J0–J7 +
JS1–JS6) on the customer-identical **0.23.0** npx tarball, real prod-signed license, isolated
`~/.relay-staging` (R4 clean at teardown). Executed the S3 `staging-browser-smoke` scope MANUALLY,
ahead of the harness. **Verdict: agency spine STRONG** (most 0.15.1 blockers fixed — Compose went from
total failure to the best demo path, `$0.0005`/run, DB-verified) — **but Agency Pro is NOT sellable
e2e behind 2 blockers.** Two fix specs written (root causes verified at code; first blueprint
diagnosis was WRONG → corrected): `features/fix-packs-ui-install-core-version.md` (P0) +
`features/fix-pack-install-blueprint-cache.md` (P1). Findings + screenshots:
`output/staging/2026-07-02-full-suite/FINDINGS.md`. Prior tail: S11-S1..S4 =
harness/smoke/gallery+promise/release+#22/#23 = `e8c18f4a`/`d755b98f`/`c6800c5d` — see git log + beacon.)_

## ▶️ NEXT SESSION — Agency Pro blockers + nav spec
- **🔴 P0 · `features/fix-packs-ui-install-core-version.md`** — /packs UI Install DOA on npx:
  relay-core resolves to `0.0.0` in the Next.js server (tsup version-define only in `dist/cli.js`,
  never injected into the `.next` bundle) → every pack install rejected in UI; CLI works. Fix =
  add the version define to the Next.js build. Verified at code + reproduced (HTTP 422). **Needs a
  real launch smoke** (runtime-adjacent, CLAUDE.md budget).
- **🔴 P1 · `features/fix-pack-install-blueprint-cache.md`** — installed pack blueprints invisible
  to the running server: stale in-process `blueprintCache` (registry.ts:16) after an out-of-process
  CLI install → all 6 Agency Pro chapters fail "Blueprint not found" at dispatch. **Largely
  downstream of the P0** (a UI install reloads in-process). Fix = mtime self-heal or reload trigger.
- **Nav redesign SPEC (operator-requested, task queued)** — full IA rethink: permanent two-tier bar
  (kill the sliding accordion), **promote Apps to top menu** with composed apps as sub-items, Apps
  overflow = **"+N more"** primary (carousel + command-jump as documented alternatives). MUST include
  a **route census**: `/analytics` + `/environment*` were cut from nav in the feature-freeze but are
  **still fully LIVE by URL** (pattern — audit all "cut" features; verify intent vs
  `_SPECS/feature-cut-freeze.md`). SPEC first (policy 3), build later. Nav findings NAV-1..6 in the
  FINDINGS doc.
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

### Staging harness — S2/S4 still queued (S3 scope done manually this session)
- **S3 `staging-browser-smoke`** (J0–J7 via Claude-in-Chrome) was **executed MANUALLY in S12** — the
  enriched `_IDEAS/icp-agency-journeys.md` script is proven; automating it into a skill is still open.
- **S2** · `staging-cli-run` skill — VHS (local dev dep) · CLI first-run `.tape` (Mode A) + Mode C
  dev-key-signer fulfilment → same GIF. **S4** · `staging-evaluate` (verify-before-groom →
  `features/fix-*.md` + `_IDEAS/backlog.md`; DRAFT gh issues to `output/`). Spec: `_SPECS/relay-staging-harness.md` §8.
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
- **Release recipe:** proven twice (0.22.0, 0.23.0) — full sequence + watcher gotcha in
  memory `release-and-issue-conventions`.
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
- **Profiles are file-based, no `agent_profiles` table** (memory `profiles-are-file-based-not-db`).
- **CLI startup robustness** (memory `cli-startup-robustness`): startup writes non-fatal;
  licensed-banner + recap surfaces fail-open by the same rule.
- **Nav width cap:** groups cap at 4 children; Packs is the one tested exception.
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

## Recently shipped (per-session detail in git + beacon recent[]; this is just the version index)
**main (unreleased):** #22 onboarding-pref keepalive (`55b3ae7d`) + #23 fresh-boot noise
(`70db6926`). Version history: **0.23.0** packs gallery + founding price (#20/#21) · **0.22.1**
cost-trust P1 + OIDC/SBOM · **0.22.0** renewal recap (#19) · **0.21.0** pack updates + Agency Pro
v0.2.0 (#18) · **0.20.0** trust pack (#17) · **0.19.0** first premium pack (#16) · **0.18.0**
graduation (#15) · **0.17.0** license lifecycle (#14) · **0.16.0** prod build (#10). — full
detail: `git log` + beacon.
