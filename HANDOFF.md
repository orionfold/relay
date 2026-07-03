# Relay — HANDOFF

_Last updated: 2026-07-03 (pt: S23 — wrote the last open staging-harness skill **S3
`staging-browser-smoke`** (gitignored SKILL.md), **completing the S1-S4 arc — all four skills now
exist**. Mode B = drive a running `:3199` instance through J0-J7 + JS1-JS6 (`_IDEAS/icp-agency-journeys.md`)
via Claude-in-Chrome → Playwright MCP fallback (D6), autonomous-logging, capturing per-screen PNGs +
console/network logs + a house-format README into the shared `output/staging/<date>/` bundle that
`staging-evaluate` consumes. Skill-only (no `staging.mjs` verb — MCP browser work is judgment, like S4).
All 6 referenced paths verified to exist; skill registered + correctly gitignored (clean `git status`).
Not yet run live end-to-end (needs `relay-staging setup && launch` + spends real tokens on J4/J5/J7 live
agents). Prior tail: S22 staging-evaluate (`0ce13c0d`), S21 app-copy (`2df172e3`), S20 staging-cli-run
(`dd7cab0a`), S19 0.24.0 (`58fc89ac`) — full detail in git log + CHANGELOG.)_

## ▶️ NEXT SESSION — staging harness arc DONE; only reactive/backlog remains

### Staging harness — S1-S4 arc COMPLETE (all four skills exist)
- `relay-staging` (substrate) · `staging-cli-run` (Mode A+C GIF) · `staging-browser-smoke` (Mode B
  walkthrough, S23) · `staging-evaluate` (Mode D groom) — the full capture→eval loop is skill-driven.
- **Open follow-up (optional):** run `staging-browser-smoke` **live end-to-end** to prove it and
  produce the first real Mode B bundle — S23 wrote the skill but didn't exercise it (needs
  `relay-staging setup && launch`, spends real tokens on the live-agent journeys; prefer Ollama $0 / R5).
- **Staging skills are LOCAL tooling**: `scripts/staging/*` committed; SKILL.md files gitignored (memory
  `skills-are-gitignored-secret-sauce`). VHS `Wait` is unreliable — headless is the correctness gate
  (memory `vhs-capture-headless-is-the-gate`). Prereq: `brew install vhs`.
- **`file://` mirror is per-BUILD** — `npm run build && node scripts/build-prebuilt-artifact.mjs`
  BEFORE any staging verify (memory `staging-artifact-rebuild-before-verify`). 0.24.0 artifact built S20.
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
  MINOR bump (now `{0.24, 0.23}` set in `58fc89ac`); the window test derives its expected window from
  package.json, so it fails loudly until every site bumps together.
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
**S23 (unreleased tooling):** staging-harness **S3 `staging-browser-smoke`** — the last open skill in the
arc; gitignored SKILL.md, Mode B J0-J7 + JS-series browser walkthrough → house-format bundle. **All four
S1-S4 skills now exist.** Skill-only (no script verb); not committed (gitignored), so no git change. Not
yet run live. No version bump.
**S22 (unreleased tooling):** staging-harness **S4 `staging-evaluate`** (`0ce13c0d`) — verify-before-groom
skill (gitignored) + first loop: 3/3 raw findings verified stale, 1 residual groomed to
`fix-pack-price-runtime-canonical-read.md`. No version bump.
**S21 (unreleased copy):** app-copy task #5 grade-3-5 rewrite — 5 surfaces (runtime-preference modal,
welcome hero, chat empty-state, composer prompt, Agency Pro pack `description`) rewritten to the
`app-copy-standard`; changelog map deliberately left as-is (renewal-email template source). No version
bump (copy-only). **S20 (unreleased tooling):** staging-harness **S2 `staging-cli-run`** (`dd7cab0a`) — Mode A+C GIF +
fulfilment capture; no version bump (harness tooling, not product). **Latest RELEASED — 0.24.0** (S19):
legacy-brand leaks CLOSED (theme cookie + apps-changed event `d9cf5712`; webhook `source` rename
`f6639058`) + apiVersion window 0.23→0.24 (`58fc89ac`). Published via `v0.24.0` tag — npm `latest`,
GitHub Release + SBOM. Prior releases 0.23.0 (packs gallery + founding price) ← 0.16. Full version
history + per-session detail: `git tag` + CHANGELOG + `git log`.
