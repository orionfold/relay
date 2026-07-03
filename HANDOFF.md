# Relay — HANDOFF

_Last updated: 2026-07-03 (pt: S18-route-census — ran the route-census audit vs the feature-cut freeze
(`output/2026-07-03-route-census.md`): the "nav-hidden but live-by-URL" limbo class is otherwise CLOSED
(every nav href resolves; all create/subroutes reachable; `/settings` = the intended gear; `/analytics`
+ `/environment` pages fully DELETED not dormant, S13). Found + FIXED two live leaks in `3c36fb98`: F1 a
dead `↗` anchor to the deleted `/environment` page in `skill-row.tsx` (dropped, not repointed — the env
dashboard feature is gone); F2 14 orphaned `/api/environment/**` route handlers (0 callers) deleted,
KEEPING the 2 live ones (`skills`, `rescan-if-stale`) + `/api/settings/environment` and the whole
`@/lib/environment/**` shared library (memory `environment-folder-is-two-things`). tsc clean; 92/92
across chat+hooks+env-api+shell. Prior tail: S17-price-drift-gate — publish-gate price-drift check
shipped (`30266328`, `scripts/check-price-drift.mjs` + smoke Case P), closing relay-channel later-12
structurally; memory `nextjs-compiler-define-gotchas`. Prior tail: S16 copy-sweep (`ed7db940`), S14
staging fixes (`d5ecbf0a`), S13 nav redesign (`119e6ba8`), S12 ICP walkthrough — full detail in git log
+ CHANGELOG.)_

## ▶️ NEXT SESSION — 0.23.1 patch + hygiene sweeps
- **Route-census — DONE (S18, `3c36fb98`).** Audited the "nav-hidden but live-by-URL" limbo vs the
  feature-cut freeze (`output/2026-07-03-route-census.md`): class CLOSED. Fixed 2 leaks (dead
  `/environment` link in `skill-row.tsx`; 14 orphaned `/api/environment/**` handlers). No other
  undocumented orphans. If a future feature-cut hides more routes, re-run the 3-set diff (disk pages vs
  nav hrefs vs spec dispositions) + reachability trace; watch for dead in-page links to deleted pages.
- **App-copy sweep — em-dash pass DONE (S16, `ed7db940`).** Stripped prose em-dashes from ~50 user-facing
  copy sites + fixed the WRONG/STALE brand leaks (below). NOT yet done: the fuller **grade-3-5 rewrite +
  pyramid/progressive-disclosure** pass (higher-touch, changes meaning — deferred deliberately). Left
  by design: null-value `"—"` glyph, title separators (`Manifest — {app}`), API-route error JSON
  (developer-facing). Standard = memory `app-copy-standard`.
- **Legacy-brand leaks — LOAD-BEARING items now CLOSED (memory `legacy-rebrand-divergence-bugs`).**
  Prior (S16): `ainative`→Relay in chat prompt / tool-catalog / Codex error / Slack+Telegram tests;
  `stagent`→relay in Environment seed. This session: `"ainative-theme"` cookie + `"ainative-apps-changed"`
  event migrated (`d9cf5712`) — theme with read-both/write-new fallback (no FOUC), event a clean rename
  via a new zero-import leaf `apps-events.ts`; `webhook-adapter source:"ainative"`→`"relay"` (this session)
  by **operator ruling = hard rename, no compat** (undocumented field, no customer filter assumed; wire
  smoke proved both send+testConnection emit `"relay"`; CHANGELOG flags it as Changed with a
  point-your-filter note). KEEP untouched (by design): `$AINATIVE_DATA_DIR` alias resolver + manifest
  tokens, `ainative-paths.ts` symbols, the migration machinery, `sourceFormat:"ainative"` profile alias.
- **Next release is a PATCH (0.23.1)** unless features land first — `[Unreleased]` now has 5 fix entries
  + 1 Changed (the copy sweep); patch = NO apiVersion-window bump.
- **Publish-gate price-drift check — DONE (S17, `30266328`).** later-12 was answered (Website
  later-13); the gate now reads `orionfold.com/relay/pricing.json` and fails a release on a reachable
  contradiction (`scripts/check-price-drift.mjs`, smoke Case P). Drift class structurally closed. Standing
  obligation to hand-flag pack price changes on _RELAY is now REDUNDANT for the pro pack (the gate
  catches it) — but keep flagging until a release actually SHIPS through the new gate (first tag after
  `30266328`). Only the pro pack's price is checked; if another pack gets a canon entry, extend the diff.

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
**main (unreleased):** #22 onboarding-pref keepalive (`55b3ae7d`) + #23 fresh-boot noise
(`70db6926`); nav redesign (`119e6ba8`, S13); both Agency Pro staging fixes (`d5ecbf0a`, S14);
`--data-dir` honored by pack/license/plugin subcommands (`22b2d985`, S15); app-copy em-dash sweep +
WRONG/STALE brand leaks (`ed7db940`, S16); publish-gate price-drift check (`30266328`, S17);
route-census fixes — dead env link + orphaned env APIs (`3c36fb98`, S18).
**Latest release 0.23.0** (packs gallery + founding price). Full version history (0.16→0.23) +
per-session detail: `git tag` + CHANGELOG + `git log`.
