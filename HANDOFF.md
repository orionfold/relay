# Relay — HANDOFF

_Last updated: 2026-07-02 (pt: S11-S1 SHIPPED (`e8c18f4a`) — BUILT the PLG-S staging harness env +
driver + `relay-staging` skill. `scripts/lib/harness.mjs` extracts the launch/CLI primitives shared
by `npx-prod-smoke.mjs` (still green A/B/L/C) + `scripts/staging.mjs` (setup/launch-hold-open/status/
teardown). R4 isolation check hardened to CONTENT sha256 after verification caught an mtime
false-positive (boot-time legacy migration + concurrent dev server touch `~/.relay` mtime benignly;
lsof proves the server holds only `~/.relay-staging`). E2e verified end to end. Prior tail: S11-plan =
spec + workbreak; S10 = 2 P2 fixes; S1–S9 = 0.16.0→0.22.1 — see git log + beacon.)_

## ▶️ NEXT SESSION (S11 cont.) — S2: `staging-cli-run` skill (Mode A + C, VHS GIF)
**S1 SHIPPED** (`e8c18f4a`): `scripts/lib/harness.mjs` + `scripts/staging.mjs` (setup/launch/status/
teardown) + `relay-staging` skill (the S2–S4 substrate). Spec: `_SPECS/relay-staging-harness.md` §8.
- **S2 (NEXT)** · `staging-cli-run` skill — install/wire **VHS** (local dev dep; skill checks +
  instructs install if missing). Author the CLI first-run `.tape` (Mode A: banner · env writes ·
  artifact download line · port/bind · Community banner → `output/staging/<date>/cli-first-run.gif`
  + tee log). Then the **Mode C** dev-key-signer fulfilment script (mint `of-license-dev-2026-06`
  license via `sign-helper.ts` → `relay license add` → relaunch "Licensed to" → `relay pack add
  relay-agency-pro` no-flag → `relay license status` → `rm` store → banner reverts, pack stays =
  **D4 proof**), folded into the same GIF. Rides `relay-staging`; scenario-mode license verbs use
  `runCliCommand({extraEnv})` — the `extraEnv` param is already in `harness.mjs`.
- **S3** · `staging-browser-smoke` skill — J0–J6 via Claude-in-Chrome (operator watches), screens
  + console + network → `output/staging/<date>/` bundle.
- **S4** · `staging-evaluate` skill — verify-before-groom findings → `features/fix-*.md` +
  `_IDEAS/backlog.md`; DRAFT gh issues to `output/` (never auto-file).
- Decisions locked: vhs · offline dev-key signer · `file://` mirror · Chrome-primary · both
  fulfilment surfaces · drafted issues. Plan: `~/.claude/plans/read-handoff-…-dongarra.md`.
- **`file://` mirror is per-version** — build `dist-artifacts/relay-next-build-<v>.tgz` once per
  version bump (`npm run build && node scripts/build-prebuilt-artifact.mjs`); 0.22.1 built this session.
- Constraints: work on `main`; `_SPECS`/`_IDEAS` edit-only (strategy repo, its owner commits);
  Ollama-preferred for agent steps (R5); harness-side instrumentation only (no phone-home).

**PLG-4 has no live growth-loop candidate queued** (all three ruled out 2026-07-02, stays reactive):
- **Free registration key tier is DEFERRED** — still a strong recommendation (plg-refine §4),
  but brand-timing isn't right and it depends on Website issuer participation + a decision on
  which 2–3 niceties gate. Held for a future session; re-open only when the operator resurfaces
  it AND the Website issuer can participate. (NOT killed — distinct from reverse trial.)
- **Founding-supporter identity is DROPPED**: $349 founding tier felt identical to $499 and was
  mostly Website/community surface with thin product code. Do not resurface as a product loop.
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

## Recently shipped (durable in git + memory + beacon recent[])
- **S11-S1** (`e8c18f4a`): PLG-S staging harness env + driver + `relay-staging` skill.
  `scripts/lib/harness.mjs` (shared launch/CLI primitives) + `scripts/staging.mjs`
  (setup/launch-hold-open/status/teardown, `:3199`, `~/.relay-staging`, `RELAY_STAGING=true`,
  `file://` mirror). R4 = **content sha256** not mtime (memory `staging-isolation-check-content-not-mtime`).
  Smoke green post-extraction.
- **S9** (`2e0ab3bd`/`d6693d55`): 0.22.1 SHIPPED (cost-trust P1, OIDC+SBOM) + legacy-symbol sweep
  (3 live `~/.ainative`-vs-`~/.relay` divergence bugs; memory `legacy-rebrand-divergence-bugs`).
- **S8** (`4e9c2569`/`fbc9f482`/`c85dadc0`/`bad7ede2`): spend tiles · model preference · Ollama
  metering · docs (unreleased at S8, published in the 0.22.1 train).
- Version history: **0.22.0** renewal recap (#19) · **0.21.0** pack updates + Agency Pro v0.2.0
  (#18) · **0.20.0** trust pack (#17) · **0.19.0** first premium pack (#16) · **0.18.0**
  graduation (#15) · **0.17.0** license lifecycle (#14) · **0.16.0** prod build (#10) — see git log.
