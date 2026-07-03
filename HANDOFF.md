# Relay — HANDOFF

_Last updated: 2026-07-03 (pt: S27 — **P2 `fix-profile-runtime-chip-labels` SHIPPED + 0.24.1 release cut**.
Fixed the profile-card runtime-chip collapse (`fe4b9237`, #26 filed+committed): exhaustive
`Record<AgentRuntimeId, string>` short-label map replaces the `label.includes("Codex")` ternary — Ollama
now reads "Ollama (Local)", not "Claude"; new `profile-card.test.tsx` (2 tests) green, 56 profiles tests
pass. CHANGELOG 0.24.1 entries for #24/#25/#26 (`662ce4e2`), `npm version patch` → tag `v0.24.1`
(`d794a8ce`) pushed → **PUBLISHED: npm `orionfold-relay@0.24.1` + Release + SBOM; #24/#25/#26 `shipped`+closed.** Prior tail: S26
fixed both S25 P1s (`6f715fa4` #24, `e89ae622` #25) + GH auto-file automation; S25 live 6-run staging suite
(bundle `output/staging/2026-07-03-suite/`); S19 0.24.0 (`58fc89ac`). Full detail: git log.)_

## ▶️ NEXT SESSION — no forced action; 0.24.1 fully shipped

### 0.24.1 released + closed out (S27) — nothing pending
- **Published**: npm `orionfold-relay@0.24.1` (CI run `28685075885` success) + GitHub Release + SBOM.
  #24/#25/#26 flipped to `shipped` and closed. The 3-fix arc from the S25 staging suite is DONE.
- P3 polish still in `_IDEAS/backlog.md` (blur-heavy jargon, AINATIVE_ doc-comment, $AINATIVE_DATA_DIR sed,
  chat_turn cost deep-link) — reactive, not blocking. Or run the next staging R-run (one per session).

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
**0.24.1 (S25–S27, RELEASED — npm `latest` + Release + SBOM; #24/#25/#26 closed):** three customer fixes —
`6f715fa4` snapshot-restore deadlock (#24, unlocked-core + `SnapshotBusyError`→409), `e89ae622` Ollama
phantom-model (#25, import-free resolver + live-Ollama smoke), `fe4b9237` profile runtime-chip labels
(#26, exhaustive `Record<AgentRuntimeId,string>` map + `profile-card.test.tsx`). Origin: S25 live 6-run
staging suite (bundle `output/staging/2026-07-03-suite/`) → 3 fix specs → all fixed. GH issue mgmt fully
automated (auto-file + env-prefixed `gh` rules) this arc.
**0.24.0 (S19, RELEASED):** legacy-brand leaks CLOSED (theme cookie + apps-changed `d9cf5712`; webhook
`source` rename `f6639058`) + apiVersion window 0.23→0.24 (`58fc89ac`). npm `latest` + Release + SBOM.
**Staging-harness arc (S20–S23, tooling, unreleased):** four skills — `staging-cli-run` `dd7cab0a`,
`staging-evaluate` `0ce13c0d`, `staging-browser-smoke`, substrate. Plus S21 app-copy grade-3-5 rewrite.
Detail in `git log`. Prior releases 0.23.0 (packs gallery + founding price) ← 0.16. Full history:
`git tag` + CHANGELOG + `git log`.
