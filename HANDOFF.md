# Relay — HANDOFF

_Last updated: 2026-07-02 (pt: S9 — SHIPPED 0.22.1 (cost-trust P1 bundle: spend labeling,
model preference, Ollama metering) via OIDC + SBOM; pushed all S8 local commits. Then a
stagent→ainative→relay legacy-symbol sweep: fixed 3 live divergence bugs where
tooling/boot-migration read the orphaned ~/.ainative DB instead of live ~/.relay (chained
migrator + drizzle.config + backfill), plus stale governance docs; commit d6693d55,
boot-smoked HTTP 200. Prior tail: S1–S8 = 0.16.0→0.22.1 — see git log + beacon recent.)_

## ▶️ NEXT SESSION (S10) — remaining PLG-4 loops, each OPERATOR-GATED; P2 fixes interleave
Two loop candidates left, one per session, AskUserQuestion gate before any spec work:
- **Free registration key tier** (n8n-style email → key → community niceties) — plg-refine §4
  calls it a strong recommendation but brand-timing is the operator's call; needs Website
  issuer participation + a decision on which niceties gate.
- **Founding-supporter identity** — the $349 founding tier feels identical to $499; mostly
  Website/community surface, thin product code.
- **Reverse trial is DEAD** (ruled 2026-07-02): re-lock = the §7 anti-pattern "expiry that
  disables installed content" vs the public promise. Do not resurface in any form that
  writes premium content to the pack store.
- **Relay channel: later-9/later-10 OPEN (reactive)** — Website owes the T-30 renewal email
  (canonical copy posted on _RELAY, incl. the no-phone-home honesty constraint). Standing:
  flag each new pack `changelog:` line on _RELAY per release; flag if any `docs/trust/*`
  URL moves.
- **Anti-patterns stay fenced (plg-refine §7):** no DB licensing, no CLI upsell banners, no
  online re-validation, no expiry that disables installed packs (D4 = shipped behavior AND
  public promise — README, issues #14–#19, orionfold.com/promise/; enforced at the UPDATE
  gate, proven by agency-pro-update.test.ts).

## Held issues #5/#6/#11/#12 — WAITING on customer retest (reactive)
Now labeled `bug` + `awaiting-retest` (label created S8); retest asks posted on 0.16.0
(2026-07-01), no reply yet. Prod build likely moots the class. If they persist: repro
cross-machine (NOT localhost) via Mode D. Triage: `bf204c24`.

## P2 fixes (interleave)
- **`fix-anthropic-direct-task-serialization`** (NEW S8) — every anthropic-direct task run
  fails "Converting circular structure to JSON" (pre-existing; found during the model-pref
  smoke; model resolution works on that path). Spec has repro + candidate sites.
- **`fix-inbox-checkpoint-realtime`** — checkpoint approvals need a guess-refresh (~15s);
  tighten Inbox SSE/poll to match Monitor.

## Known caveats
- **apiVersion window**: bump `CURRENT_PLUGIN_API_VERSION` (sdk/types.ts) + previous-MINOR
  literal (registry.ts) + `examples/*/plugin.yaml` IN the release commit ONLY on a MINOR
  bump (0.22 window in `d1f16046`); the window test fails loudly until package.json bumps.
- **Release recipe (proven 0.22.0):** `npm version` REFUSES a staged tree → use
  `--no-git-tag-version`, one manual release commit (window + CHANGELOG + bump together),
  `git tag -a`, push the tag explicitly (memory `release-and-issue-conventions`).
- **Pack `changelog:` map feeds every recap surface** (license status, 402 refusal, /packs
  card, renewal email copy) — add a line with EVERY pack version bump; the template test
  REQUIRES it for Agency Pro. Case L smoke counts are a SEPARATE bump-on-chapter-growth site.
- **docs/index.md + docs/features|journeys|use-cases are GITIGNORED** (generated corpus).
  Public docs = README + SECURITY.md + docs/trust/ + docs/RELEASING.md +
  docs/plugin-security.md. Trust-doc claims must stay code-true.
- **Pre-existing test failures (NOT regressions), 8:** `router.test.ts` (6),
  `run-cadence-heatmap`/`settings` validator (2); plus `src/__tests__/e2e/blueprint.test.ts`
  is environmental (needs running dev server). Verified unchanged after the S8 bundle.
- **`next` is PINNED exactly (16.2.4)** — artifact build must match customer runtime.
- **Next 16 emits `.next/node_modules` symlinks** — artifact ships a manifest + CLI relinks
  (junction on win32). See #10 spec.
- **Profiles are file-based, no `agent_profiles` table** (memory `profiles-are-file-based-not-db`).
- **CLI startup robustness** (memory `cli-startup-robustness`): startup writes non-fatal;
  licensed-banner + recap surfaces fail-open by the same rule.
- **Nav width cap:** groups cap at 4 children; Packs is the one tested exception.
- **Blueprint/profile content must pass its Zod schema** — the registry skips invalid files
  with only a console.warn (→ "Blueprint not found" at first trigger).
- **Budget guardrails' plan-price substitution is INTENTIONAL** (budget basis) — display
  surfaces must read `meteredSpend`/`planPricedMonthlyMicros` from the snapshot instead
  (S8, fix-dashboard-budget-vs-cost-labeling.md "Verification run").

## Not-started backlog (pre-existing)
- **`chore-deprecated-transitive-deps`** (P3) — 7 `npm warn deprecated` on install. Spec written.
- **Optional:** npm Publishing → "require 2FA + disallow tokens" now OIDC works.
- **Micro-chore:** stale `pdfjs-dist` in `serverExternalPackages` (flagged in #10 grooming).

## Anchors
- **Strategy repo = read/write only** (memory `strategy-repo-readwrite-only`): edit, NEVER commit/push/merge.
- **Work directly on `main`** — no worktrees/branches unless operator asks (memory `work-on-main-no-worktrees`).
- **npm publishing via OIDC** (`.github/workflows/publish.yml` on `vX.Y.Z` tag). Publish
  GATED by the npx prod smoke (Case L exercises the REAL relay-agency-pro). Every release
  attaches a **CycloneDX SBOM** to the GitHub Release.
- **Smoke-test budget** (CLAUDE.md): runtime-registry-adjacent changes need a real launch
  smoke — S8 proved it twice (router picked an uncovered runtime; circular-JSON surfaced).
- **gh issue/label writes are ALLOWLISTED** (memory `autonomous-session-permission-gates`).
- **Check git history for prior art**; **verify field reports before fixing** (memories).

## Recently shipped (durable in git + memory)
- **S9 — 0.22.1 SHIPPED** (`2e0ab3bd`, Release `v0.22.1`): cost-trust P1 bundle published
  via OIDC + SBOM. Then a `stagent→ainative→relay` legacy-symbol sweep (`d6693d55`) — fixed
  3 live divergence bugs (boot migrator + `drizzle.config` + backfill read orphaned
  `~/.ainative` vs live `~/.relay`); chained the migrator; corrected stale governance docs.
  Load-bearing legacy strings kept (memory `legacy-rebrand-divergence-bugs`).
- **S8 unreleased fix bundle**: `4e9c2569` spend tiles · `fbc9f482` model preference ·
  `c85dadc0` Ollama metering · `bad7ede2` docs — specs completed with verification runs.
- Prior: **0.22.0** renewal value-recap (#19) · **0.21.0** pack updates + Agency Pro v0.2.0
  (#18) · **0.20.0** trust pack (#17) · **0.19.0** first premium pack (#16) · **0.18.0**
  graduation surface (#15) · **0.17.0** license lifecycle (#14) · **0.16.0** prod build
  (#10) — see `git log` + beacon `recent[]`.
