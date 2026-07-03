# Relay — HANDOFF

_Last updated: 2026-07-03 (pt: S19-rebrand-hardening + 0.24.0 — closed the last LOAD-BEARING legacy-brand
leaks: `ainative-theme` cookie + `ainative-apps-changed` event migrated (`d9cf5712`; theme reads
new-then-legacy so no FOUC on upgrade, event a clean rename via new zero-import leaf `apps-events.ts`),
and `webhook-adapter source:"ainative"`→`"relay"` (`f6639058`; operator ruled hard-rename, wire smoke
proved it). Cut the **0.24.0 release commit** (`58fc89ac`, operator ruled MINOR for the webhook
wire-contract change): version + apiVersion window bump + CHANGELOG stamp, all gates green — READY TO TAG,
not yet pushed. Also globalised the /handoff flex-ceiling mechanism (skill + CLAUDE.md + peer _RELAY
notes) and memorised the _RELAY channel mechanism. Prior tail: S18 route-census (`3c36fb98`), S17
price-drift gate (`30266328`), S16 copy-sweep (`ed7db940`), S13 nav (`119e6ba8`) — full detail in git log
+ CHANGELOG.)_

## ▶️ NEXT SESSION — ship 0.24.0, then hygiene sweeps
- **0.24.0 release COMMITTED (`58fc89ac`), ready to tag — ONE step left: `git tag v0.24.0 && git push
  --follow-tags` (your go).** Operator ruled MINOR (webhook `source` wire-contract change). The commit
  has it all: version 0.23.0→0.24.0 (package.json + lock), apiVersion window bump IN the same commit
  (`CURRENT_PLUGIN_API_VERSION` 0.23→0.24, registry previous-MINOR "0.22"→"0.23", 3 example `plugin.yaml`
  0.23→0.24 — memory `apiversion-window-bump-at-version-bump`), CHANGELOG `[0.24.0] — 2026-07-03` (3
  Changed + 5 Fixed) + fresh `[Unreleased]`. Gates green: price-drift exit 0 (app price MATCHES live
  `pricing.json` — S17 gate's FIRST real release rehearsal), build:cli 0, plugins 248/248, full suite =
  only the 8 documented pre-existing fails (ZERO new). `package.json` is already 0.24.0 so DON'T re-run
  `npm version` — just tag the existing commit. Tag → OIDC publish + provenance + SBOM
  (`docs/RELEASING.md`). **This ships retires the "hand-flag pack prices on _RELAY" standing obligation**
  (first release through the S17 gate; only the pro pack's price is gated — extend `check-price-drift.mjs`
  if another pack gets a canon entry).
- **App-copy grade-3-5 rewrite — DEFERRED (explicit HOLD, not stale).** Em-dash pass DONE (S16,
  `ed7db940`); the fuller **grade-3-5 + pyramid/progressive-disclosure** rewrite is higher-touch (changes
  meaning) and deliberately held. Left by design: null-value `"—"` glyph, title separators
  (`Manifest — {app}`), API-route error JSON (developer-facing). Standard = memory `app-copy-standard`.

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
**main (committed, awaiting 0.24.0 tag):** legacy-brand leaks CLOSED — theme cookie + apps-changed
event (`d9cf5712`) + webhook `source` rename (`f6639058`, S19); **0.24.0 release commit** (`58fc89ac`,
version + apiVersion-window bump + CHANGELOG). Earlier unreleased: route-census fixes (`3c36fb98`, S18);
price-drift gate (`30266328`, S17); app-copy em-dash sweep (`ed7db940`, S16); `--data-dir` on subcommands
(`22b2d985`, S15); Agency Pro staging fixes (`d5ecbf0a`, S14); nav redesign (`119e6ba8`, S13); #22/#23
(`55b3ae7d`/`70db6926`).
**Latest RELEASED 0.23.0** (packs gallery + founding price); 0.24.0 committed but not yet tagged. Full
version history (0.16→0.24) + per-session detail: `git tag` + CHANGELOG + `git log`.
