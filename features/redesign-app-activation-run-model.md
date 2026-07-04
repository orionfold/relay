# redesign: app-shell activation + run-model (FEAT-5/6/7/8)

**Status:** SHIPPED + verified e2e (2026-07-04, Option A routing). All five build-sequence
steps done: (1) runnable-cards home, (2) guided helper text, (3) FEAT-7 blueprint-vs-workflow
lead + Execute nudge, (4) FEAT-8 draft/active/paused signposting (paused HITL → Inbox), (5)
copy pass (row-insert cards name the table, not the UUID). FEAT-5/6/7/8 all resolved.
**Origin:** 2026-07-03 operator walkthrough — `output/staging/2026-07-03-operator-walkthrough/FINDINGS-live.md`
(FEAT-5/6/7/8). Sibling patch-tier findings from the same run already shipped (BUG-1/2, FEAT-1/3/4)
and BUG-3 (workflow HITL) shipped separately (`features/fix-workflow-hitl-ask-user.md`, `4c0bae6c`).
**Ceremony:** lightweight groom (operator gate, 2026-07-04) — one unified spec, drafted in-session.

---

## The one problem (four symptoms)

A customer who **buys and installs a pack** lands on the app home and sees an empty shell with
ambiguous controls, hidden blueprints, unexplained vocabulary, and no signposting after they act.
FEAT-5/6/7/8 are four views of a single root cause and one redesign resolves all four:

| Finding | Symptom | Root cause |
|---|---|---|
| **FEAT-5** | Blank slate with no "do this → this happens → do next" guidance | App home is a hero panel + inert empty-state text |
| **FEAT-6** | 5 of the app's 6 blueprints are invisible on the app's own home | Shell surfaces ONE hero blueprint; the rest live only in a hidden Manifest sheet |
| **FEAT-7** | Four verbs for "make this go" (Run now / Create Workflow / Execute / empty Workflows list) | No inline model distinguishing blueprint (template) from workflow (instance) |
| **FEAT-8** | After Execute, no pointer to where the run lives or where to approve checkpoints | Workflow header shows a status badge only; activity split across 4 unlinked surfaces |

**Root cause (VERIFIED):** Relay Agency Pro's manifest **hard-declares `view.kit: ledger`**
(`src/lib/packs/templates/relay-agency-pro/base/manifest.yaml:77`). `pickKit` short-circuits on a
declared kit (`src/lib/apps/view-kits/inference.ts:18-20`), so the app renders through the **ledger
kit** — which is built around ONE hero blueprint (`runsBlueprintId`, defaults to `blueprints[0]` →
`month-end-close`) plus a transactions table + `LedgerHeroPanel` empty state. Agency Pro is a
**6-workflow operating system**; the single-blueprint kit is why 5/6 workflows never appear on their
own app home.

---

## Chosen direction (operator, 2026-07-04)

**Runnable blueprint cards + guided first-run.** The app home surfaces the app's blueprints as
first-class **runnable cards** (name + one-line what-it-does + a Run action), with the recommended
first workflow highlighted as **"Start here ▸"**. This subsumes FEAT-5's guidance ("here are your
app's 6 workflows; start with this one") and FEAT-6's discoverability into one surface. The
blank-slate becomes a *menu of what to do*, not an empty shell.

Approved mock (operator-selected):
```
┌ Relay Agency Pro ──────────────┐
│ Start here ▸                   │
│ ┌────────────────────────────┐ │
│ │ ① New-Business Machine     │ │
│ │   Research → pitch → propose│ │
│ │   [ Run ▸ ]                │ │
│ └────────────────────────────┘ │
│ ② Intake Pipeline   [ Run ▸ ]  │
│ ③ CRE Renewal       [ Run ▸ ]  │
│ … 3 more workflows             │
└────────────────────────────────┘
```

---

## Key discovery — most of the plumbing already exists

The redesign is closer to **wiring existing primitives** than building new machinery:

1. **A multi-blueprint kit already exists:** `workflow-hub`
   (`src/lib/apps/view-kits/kits/workflow-hub.ts`). Its `resolve()` already projects **all**
   manifest blueprints (`:45`) and `buildModel()` already renders **one card per blueprint** in the
   `secondary` slot (`:61-69`), fed by `blueprintLastRuns` + `blueprintRunCounts` from
   `data.ts:82-91`. It is the natural home for the runnable-cards redesign.

2. **The run action is a drop-in component:** `RunNowButton`
   (`src/components/apps/run-now-button.tsx`) is fully self-contained on `{blueprintId, variables,
   label}`. It already handles both paths — variables → `RunNowSheet` form; none → direct
   `POST /api/blueprints/{id}/instantiate`. It can be composed **per card** with no new endpoint.

3. **The card exists but is display-only:** `LastRunCard` compact variant
   (`src/components/apps/last-run-card.tsx:68-95`) renders label + status + run-count, but **no Run
   button**. The gap is exactly: add a run affordance to that card.

4. **A declared-but-ignored binding already lists the blueprints to feature:** the Agency Pro
   manifest has `view.bindings.secondary` (`manifest.yaml:81-83`) that the ledger kit currently
   ignores. It is a ready-made list of which blueprints to surface, in order.

So the "runnable blueprint cards" home = compose `RunNowButton` into `LastRunCard` +
route Agency Pro to `workflow-hub` (or a ledger-hybrid) + honor the declared blueprint list.

---

## Scope

### IN
- **App home = runnable blueprint cards + guided first-run** (FEAT-5/6): each of the app's
  blueprints rendered as a card (name + one-line description + Run action + last-run status), the
  first flagged **"Start here."** Replaces the single-hero + inert empty state.
- **Route Agency Pro to the multi-blueprint home.** Decide the mechanism (see Open Questions):
  either flip `manifest.yaml` `view.kit` to `workflow-hub`, OR extend the ledger kit to render a
  runnable-blueprint section above/instead of the empty state (ledger-hybrid). The former is the
  smallest, lowest-risk lever; the latter keeps the finance hero for apps that have real ledger data.
- **Make `LastRunCard` (or the secondary slot) runnable** — compose `RunNowButton` per blueprint,
  honoring the row-insert gating (see below).
- **Helper text per card** describing what the workflow does and what happens on Run (FEAT-5.2).
- **Verb/vocabulary clarity** (FEAT-7): after "Create Workflow" instantiates a draft, make the next
  action (Execute) obvious — inline helper or auto-scroll/redirect emphasis on the Execute button;
  a one-line blueprint-vs-workflow explainer on the app home.
- **Post-Execute signposting** (FEAT-8): when a run is `running`/`paused`, the workflow header (or a
  banner) points to where progress + checkpoint approvals live (**Inbox** for approvals; the step
  progress inline). A paused HITL run must read as "waiting for you → Inbox," not "stuck."

### OUT (explicitly fenced)
- **BUG-3 workflow HITL** — already shipped (`4c0bae6c`). This spec CONSUMES its `paused` status +
  Inbox ask-user channel for FEAT-8 signposting; it does not re-touch the engine.
- **The inference decision table** — do NOT retune `pickKit`'s 7 rules. Agency Pro is routed by an
  explicit `view.kit` declaration; the fix operates on that declaration or the kit it names, not the
  auto-inference heuristics (retuning rules risks every other app).
- **New run endpoints / a new workflow pattern** — reuse `/api/blueprints/{id}/instantiate` and
  `/api/workflows/{id}/execute`.
- **CSV ingest** — BUG-2 already corrected the copy; no CSV affordance is in scope.
- **Renaming "Create Workflow"/"Execute" globally** — clarify with helper text + flow emphasis, not
  a rename that ripples across every blueprint/workflow surface (blast radius too wide for this arc).

---

## Interfaces to touch

| File | Change |
|---|---|
| `src/components/apps/last-run-card.tsx` | Add an optional Run affordance to the compact variant (compose `RunNowButton`), or add a new `RunnableBlueprintCard`. Keep the display-only variant for surfaces that don't want a run button. |
| `src/lib/apps/view-kits/kits/workflow-hub.ts` | Make the `secondary` map render runnable cards + a "Start here" flag on the first/declared-primary blueprint + per-blueprint one-line descriptions. |
| `src/lib/apps/view-kits/data.ts` | If cards need blueprint variables/descriptions, add them to the `workflow-hub` branch (`:82-91`). **Runtime-registry hot path — smoke-budget applies (see below).** |
| `src/lib/apps/view-kits/types.ts` | Extend `RuntimeState`/projection if new per-blueprint fields (description, variables, isPrimary) are needed. |
| `src/lib/packs/templates/relay-agency-pro/base/manifest.yaml` | The routing decision: `view.kit: ledger` → `workflow-hub` (Option A), and/or populate `view.bindings.secondary` ordering + per-blueprint descriptions. Bump `relayCore`/pack version per the pack `changelog:` rule. |
| `src/components/workflows/shared/workflow-header.tsx` | FEAT-8: when `status ∈ {running, paused}`, render a signpost ("Waiting for your approval → Inbox" on paused; "Watch progress below / Monitor" on running). |
| `src/components/apps/kit-view/slots/secondary.tsx` | If the runnable-card layout differs from the current secondary rendering. |
| `features/changelog.md` | Customer-voice entry per release conventions. |

**Row-insert gating (do not miss):** Agency Pro's `intake-pipeline` and `grant-pipeline-deep` are
**row-insert-triggered** (`manifest.yaml:38,49`). The header currently hides Run-now for row-insert
blueprints (`header.tsx:46`). The card list must replicate that gating — either hide the Run button
for row-insert blueprints or label them "runs automatically on new rows" instead of offering a
manual Run that fights the trigger contract.

---

## Build sequence (vertical slice first)

1. **Slice: one runnable card on the app home.** Make `LastRunCard` compact variant render a
   `RunNowButton` (respecting row-insert gating). Route Agency Pro to `workflow-hub` (Option A:
   one-line `manifest.yaml` change). Verify: install Agency Pro → app home shows 6 cards, each with
   a Run action, the row-insert ones gated. This proves the core redesign end to end.
2. **Guided layer:** flag the primary blueprint "Start here," add per-blueprint one-line
   descriptions (from manifest or a new binding), helper text on Run.
3. **FEAT-7 vocabulary:** blueprint-vs-workflow one-liner on the app home; after Create Workflow,
   emphasize Execute (helper text / visual emphasis on the draft workflow page).
4. **FEAT-8 signposting:** workflow-header signpost for `running`/`paused` → Inbox/progress.
5. **Copy pass** per the app-copy standard (grade 3-5, no em-dashes) on all new strings.

---

## Verification (end-to-end, non-negotiable)

**Smoke-budget applies.** `data.ts` (`loadRuntimeStateUncached`) is transitively runtime-registry-
adjacent; per CLAUDE.md any import reshaping there needs a real launch smoke, not just unit tests.

1. `npm run dev` → install Relay Agency Pro (needs entitlement; use the dev-key path from the
   walkthrough) → open the app home. **Assert:** all 6 blueprints appear as cards; the recommended
   one is flagged "Start here"; row-insert blueprints don't offer a fighting manual Run.
2. Click Run on a variables blueprint (New-Business) → `RunNowSheet` opens → fill → instantiate →
   land on the draft workflow → Execute is obvious → run proceeds.
3. Drive a HITL blueprint to a checkpoint → **assert** the workflow header signposts "→ Inbox" and
   the Inbox has the pending approval (reuses BUG-3's shipped channel).
4. Regression: confirm apps that legitimately use the ledger kit (real currency+date hero data)
   still render the finance hero — the routing change must not strip the ledger view from
   ledger-shaped apps.
5. Full unit suite green modulo the 8 documented baseline failures (HANDOFF "Known caveats").

---

## Open questions (decide during impl / with operator)

1. **Routing mechanism — Option A vs. ledger-hybrid.** A: flip `view.kit` to `workflow-hub`
   (smallest diff, but Agency Pro loses its finance hero panel entirely — is the month-end-close
   ledger view valuable enough to keep?). Hybrid: teach the ledger kit to render runnable blueprint
   cards *above* the ledger hero, so the finance app keeps its chart AND surfaces all 6 workflows.
   **Recommendation:** start with Option A for the vertical slice (proves the redesign cheaply);
   evaluate whether the ledger hero is worth a hybrid once the card home is visible. This is a
   product call — surface the A-vs-hybrid tradeoff to the operator with the working slice.
2. **Per-blueprint descriptions** — source from a new manifest field, the blueprint's own
   description, or the `view.bindings.secondary` entries? Cheapest is whatever the manifest already
   carries; a new field is a pack-schema change (raises `relayCore`).
3. **"Start here" selection** — first declared blueprint, an explicit manifest flag, or the
   least-gated/most-interactive one? (month-end-close is schedule-driven and the *least* rewarding
   first click — the walkthrough's BUG-2 dead end — so "first in manifest" is the wrong default here.)

---

## POSITIVE (do NOT regress)
- Agent profiles refusing to fabricate is correct behavior (walkthrough POSITIVE notes).
- License activation, entitlement-gated install, and first-run cost transparency all work — don't
  touch them.
- "renews" (not "expires") PLG framing on the license card — keep.
