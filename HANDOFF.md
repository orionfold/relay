# Relay — HANDOFF

_Last updated: 2026-07-02 (pt: S11-S2-smoke — ran the PLG-refine persona smoke (Naya, agency
founder) end-to-end on 0.22.1 staging: CLI first-run + `/packs` graduation + Mode C D4 fulfilment
(offline dev-key signer). **D4 PASSED** (add→ceremony→`pack add` no-flag→remove→pack-stays). Found +
code-verified 4 gaps, filed **#20–#23**. F3 REFRAMED by operator: the website's $349 is a CORRECT
founding discount (first N buyers → $499 normal); the product has NO intro-price mechanic
(`pack.yaml` `price` is a flat string) — #20. Bundle: `output/staging/2026-07-02/`. Prior tail:
S11-S1 = harness env+driver (`e8c18f4a`); S11-plan = spec+workbreak; S10 = 2 P2 fixes; S1–S9 =
0.16.0→0.22.1 — see git log + beacon.)_

## ▶️ NEXT SESSION — groom + prioritize: 4 smoke-found issues (#20–#23) vs S2 harness build
The 2026-07-02 persona smoke filed 4 issues. Operator OK'd grooming the **#21 pack-cards** spec as a
frontend-design spec — **DO THAT FIRST** (`features/fix-packs-gallery-plg-cards.md`), and it must
render the **#20** two-phase founding→normal price. Sequence the rest against S2 per operator.
- **#20** (P1, bug+plg) · product can't express founding intro price ($349 first N → $499). Needs a
  pack `price` schema change (`format.ts:51` flat string → intro/list shape) + card render. **Website is CORRECT.**
- **#21** (P1, enhancement+plg+design) · pack gallery → PLG-marketing-grade cards. **GROOM NEXT** (operator-directed):
  more visual · surface full sales copy (not clamped) · use real-estate · future-proof for N packs (browse/filter).
- **#22** (P2, bug) · onboarding pref dropped on fast-navigate (modal `PUT` not awaited before `onClose`;
  guard at `runtime-preference-bootstrapper.tsx:36` is correct — it's a write-then-navigate race).
- **#23** (P3, bug+polish) · fresh-boot `ALTER TABLE` noise (`bootstrap.ts:318` doesn't suppress "no such table").

### S2–S4 harness build (still queued, sequence against the issues above)
- **S2** · `staging-cli-run` skill — install/wire **VHS** (local dev dep; skill checks + instructs if
  missing). CLI first-run `.tape` (Mode A) + the Mode C dev-key-signer fulfilment script → same GIF.
  (The smoke this session already PROVED the Mode C sequence manually — S2 just scripts it into VHS.)
- **S3** · `staging-browser-smoke` (J0–J6 via Claude-in-Chrome) · **S4** · `staging-evaluate`
  (verify-before-groom → `features/fix-*.md` + `_IDEAS/backlog.md`; DRAFT gh issues to `output/`).
- Decisions locked: vhs · offline dev-key signer · `file://` mirror · Chrome-primary. Spec: `_SPECS/relay-staging-harness.md` §8.
- **`file://` mirror is per-version** — build `dist-artifacts/relay-next-build-<v>.tgz` once per bump
  (`npm run build && node scripts/build-prebuilt-artifact.mjs`); 0.22.1 built.
- Constraints: work on `main`; `_SPECS`/`_IDEAS` edit-only (strategy repo, its owner commits);
  paid-frontier OK'd this session for agent steps; harness-side instrumentation only (nothing sends user data to Orionfold).

**PLG-4 has no live growth-loop candidate queued** (all three ruled out 2026-07-02, stays reactive):
- **Free registration key tier is DEFERRED** — still a strong recommendation (plg-refine §4),
  but brand-timing isn't right and it depends on Website issuer participation + a decision on
  which 2–3 niceties gate. Held for a future session; re-open only when the operator resurfaces
  it AND the Website issuer can participate. (NOT killed — distinct from reverse trial.)
- **Founding-supporter *product-loop* is DROPPED** (as a growth loop) — but NOTE (corrected
  2026-07-02): the website's **$349 founding discount → $499 normal is REAL and live**, not dropped.
  #20 tracks giving the product a way to *express* that two-phase price. Don't conflate the dropped
  loop with the live founding price.
- **Reverse trial is DEAD** (ruled 2026-07-02): re-lock = the §7 anti-pattern "expiry that
  disables installed content" vs the public promise. Do not resurface in any form that
  writes premium content to the pack store.
- **Relay channel: later-9/later-10 OPEN (reactive)** — Website owes the T-30 renewal email
  (canonical copy posted on _RELAY, incl. the never-sends-your-data honesty constraint). Standing:
  flag each new pack `changelog:` line on _RELAY per release; flag if any `docs/trust/*`
  URL moves.
- **Anti-patterns stay fenced (plg-refine §7):** no DB licensing, no CLI upsell banners, no
  online re-validation, no expiry that disables installed packs. **Promise phrasing + definition
  refined 2026-07-02:** canonical copy is "Relay never sends your data to Orionfold" (SENDS —
  read-only pulls FROM canonical Orionfold sources are OK; memory `phone-home-definition`) (D4 = shipped behavior AND
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

## Recently shipped (per-session detail in git + beacon recent[]; this is just the version index)
Version history: **0.22.1** cost-trust P1 + OIDC/SBOM + legacy-symbol sweep · **0.22.0** renewal
recap (#19) · **0.21.0** pack updates + Agency Pro v0.2.0 (#18) · **0.20.0** trust pack (#17) ·
**0.19.0** first premium pack (#16) · **0.18.0** graduation (#15) · **0.17.0** license lifecycle
(#14) · **0.16.0** prod build (#10). S11-S1 staging harness = `e8c18f4a`. — full detail: `git log` + beacon.
