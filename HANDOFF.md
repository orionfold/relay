# Relay — HANDOFF

_Last updated: 2026-07-02 (pt: S11-S4-release — **0.23.0 RELEASED to npm** (`c6800c5d`, tag
`v0.23.0`): gallery + founding price live; OIDC publish green (smoke-gated), GH Release +
artifact/sha256/SBOM verified; apiVersion window → {0.23, 0.22}. THEN **#22 SHIPPED**
(`55b3ae7d`): onboarding pref survives fast-navigate — real cause was the browser aborting the
in-flight PUT on hard nav, NOT a missing await → `keepalive: true` + `res.ok` check + retryable
inline error. **#23 SHIPPED** (`70db6926`): fresh-boot "no such table" ALTER noise suppressed —
server.log now opens "Database ready.". Both staging-verified (fresh npx install, R4 clean),
closed + shipped-labeled, `[Unreleased]` entries written. Prior tail: S11-S1..S3
harness/smoke/gallery+promise = `e8c18f4a`/`d755b98f`/`f5f85b8e` — see git log + beacon.)_

## ▶️ NEXT SESSION — S2 harness build
- **S2** · `staging-cli-run` skill (primary) — see the S2–S4 block below.
- **Next release is a PATCH (0.23.1)** unless features land first — two `[Unreleased]` fix
  entries ready (#22/#23); patch = NO apiVersion-window bump.
- **Publish-gate price-drift check** — still blocked on Website later-12 (pricing.json or
  canonical location); when answered, add the drift diff to the npx prod smoke / publish gate.

### S2–S4 harness build (still queued)
- **S2** · `staging-cli-run` skill — install/wire **VHS** (local dev dep; skill checks + instructs if
  missing). CLI first-run `.tape` (Mode A) + the Mode C dev-key-signer fulfilment script → same GIF
  (the S11-S2 smoke PROVED the Mode C sequence manually — S2 just scripts it).
- **S3** · `staging-browser-smoke` (J0–J6 via Claude-in-Chrome) · **S4** · `staging-evaluate`
  (verify-before-groom → `features/fix-*.md` + `_IDEAS/backlog.md`; DRAFT gh issues to `output/`).
- Decisions locked: vhs · offline dev-key signer · `file://` mirror · Chrome-primary. Spec: `_SPECS/relay-staging-harness.md` §8.
- **`file://` mirror artifact is per-BUILD, not per-version** — after ANY src behavior/schema
  change, `npm run build && node scripts/build-prebuilt-artifact.mjs` BEFORE staging verification,
  or staging runs stale compiled code against new data (memory `staging-artifact-rebuild-before-verify`).
- Constraints: work on `main`; `_SPECS`/`_IDEAS` edit-only (strategy repo, its owner commits);
  paid-frontier OK'd for agent steps; harness-side instrumentation only (nothing sends user data to Orionfold).

**PLG-4 stays reactive — no live growth-loop candidate** (rulings recorded in plg-refine §4/§5 +
features/changelog 2026-07-02): free-key tier **DEFERRED** (re-open only when operator resurfaces
it AND Website issuer can participate) · founding-supporter product-loop **DROPPED** (the $349
founding *price* is live and, since #20 shipped, the product expresses it) · reverse trial **DEAD**
(re-lock violates the public promise — never resurface).
- **Relay channel:** later-9/10 **ACTED** — the T-30 renewal email is LIVE (Website later-11;
  nothing owed). **later-12 OPEN**: Website to adopt the explicit promise phrase on /relay/ +
  /promise/ + email copy, and optionally publish machine-readable pricing (kills the drift class).
  Standing: flag each new pack `changelog:` line on _RELAY per release; flag `docs/trust/*` URL moves.
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
