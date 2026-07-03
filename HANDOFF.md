# Relay — HANDOFF

_Last updated: 2026-07-03 (pt: S14-staging-fixes — shipped BOTH Agency Pro staging blockers in
`d5ecbf0a`, staging-verified e2e on the real 0.23.0 artifact. **P0 core-version** (Next.js server
resolved relay-core to `0.0.0` → every `/packs` UI install 422'd) fixed via `compiler.defineServer`
in `next.config.mjs` — RAW string not `JSON.stringify` (Next quotes it itself), phase-gated to kill a
runtime config-validator warning. **P1 stale `blueprintCache`** after an out-of-process CLI install
fixed via mtime self-heal + plugin-blueprint retention in `registry.ts` (+ `cache-self-heal.test.ts`,
3 tests). Smoke: free install 200, premium 402 `license_required`, CLI install → 6 blueprints visible
no-restart; R4 clean; suite = known-8 only. Found+specced a 3rd bug: `--data-dir` silently ignored by
pack/license/plugin subcommands (`features/fix-cli-datadir-ignored-by-subcommands.md`, P2). Memory:
`nextjs-compiler-define-gotchas`. Prior tail: S13 nav redesign (committed `119e6ba8`); S12 ICP
walkthrough (0.23.0, R4 clean) → `output/staging/2026-07-02-full-suite/FINDINGS.md`; S11 — see git log.)_

## ▶️ NEXT SESSION — 0.23.1 patch + hygiene sweeps
- **P2 · `features/fix-cli-datadir-ignored-by-subcommands.md`** — `relay pack add|license add|plugin`
  silently IGNORE `--data-dir`: the subcommands short-circuit in `bin/cli.ts` (~193-217) BEFORE
  `program.parse()` applies the flag to `RELAY_DATA_DIR` (~224). Customer-facing wrong-location write
  (found while verifying P1; the smoke targeted staging via the `RELAY_DATA_DIR` env var instead). Fix
  = pre-scan argv for `--data-dir` before the short-circuit. Fold into 0.23.1 or next.
- **Route-census pattern still open** — the feature-cut freeze created a systematic "nav-hidden but
  live-by-URL" limbo. Analytics + environment are now truly retired (S13); audit whether OTHER "cut"
  features are still live-by-URL (verify vs `_SPECS/feature-cut-freeze.md`).
- **App-copy sweep (operator directive → memory `app-copy-standard`)** — scrub ALL user-facing copy
  of em-dashes + AI-slop tells, grade 3–5, pyramid principle, progressive disclosure. Sweep targets:
  runtime modal, welcome hero, Agency Pro pack `description`, empty-states, compose-agent narration.
- **Legacy-brand leaks (3 layers, memory `legacy-rebrand-divergence-bugs`)** — "stagent" in built-in
  profile authors; "ainative" in the live compose-agent narration + `$AINATIVE_DATA_DIR` in installed
  manifests (deprecated-but-load-bearing alias). Classify each before editing.
- **Next release is a PATCH (0.23.1)** unless features land first — now FOUR `[Unreleased]` fix
  entries (#22/#23 + the 2 staging fixes shipped this session); patch = NO apiVersion-window bump. The
  P2 data-dir fix would fold in here.
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
(`70db6926`); nav redesign (`119e6ba8`, S13); both Agency Pro staging fixes (`d5ecbf0a`, S14).
**Latest release 0.23.0** (packs gallery + founding price). Full version history (0.16→0.23) +
per-session detail: `git tag` + CHANGELOG + `git log`.
