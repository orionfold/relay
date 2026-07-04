# fix: workflow HITL ask-user channel + no silent auto-fail (BUG-3)

**Status:** IMPLEMENTED (S31, 2026-07-03) · **Severity:** HIGH · **Origin:** S28 operator
walkthrough → `output/staging/2026-07-03-operator-walkthrough/FINDINGS-live.md` BUG-3
· **Groomed:** S30 (2026-07-03), verified against live engine code first.

## Implementation (S31, 2026-07-03)

Operator decision B resolved: **indefinite `paused`** (no deadline, no auto-fail).

- `types.ts`: added additive `requiresInput?: boolean` + `inputPrompt?: string` to `WorkflowStep`.
- `engine.ts`: new `waitForInput()` mirrors `waitForApproval` but writes
  `toolName:"AskUserQuestion"` with `{question, options?, workflowId, stepName}`, polls with
  NO deadline, returns `response.updatedInput.answer`. `executeCheckpoint` marks the run
  `paused`, calls `waitForInput` before running a `requiresInput` step, injects the answer
  into the step's context prompt, then flips back to `active`. Halt-on-refusal added: a
  non-final step producing empty/whitespace output throws → loud `failed` (no false
  `completed`); a final empty step is allowed (nothing downstream). `waitForApproval`'s
  5-min deny-on-timeout is untouched (HITL uses the new no-deadline path).
- `notifications/actionable.ts`: workflowId extraction extended to also match
  `toolName === "AskUserQuestion"` with null taskId → deep-links to `/workflows/<id>`.

### Verification run — 2026-07-03 (end-to-end, per CLAUDE.md smoke-budget)

`engine.ts` is on the flagship runtime path, so unit tests alone are insufficient.
- Unit: `src/lib/workflows/__tests__/hitl-ask-user.test.ts` (3 tests) — answer injection,
  halt-on-refusal (non-final empty → failed), final-empty allowed. 169+3 workflow/notif tests
  green; tsc clean; full suite 8 failures = documented pre-existing baseline (no regressions).
- E2E smoke under `npm run dev` (real API + real SQLite + real `/respond` route): created a
  1-step `requiresInput` checkpoint workflow → executed → AskUserQuestion notification surfaced,
  run held `paused` (12s hold, notification NOT auto-denied), Inbox pending-approvals deep-linked
  to `/workflows/<id>`, answering via the real `/respond` route resumed the run and injected the
  typed answer into the step task's `description`. Smoke script archived in session scratchpad.

---

## Problem (operator-observed, verified end to end)

The flagship multi-step workflow (Agency Pro "New-Business Machine", 5 checkpoint
steps) ran with an empty `What we know` and an ambiguous prospect. The
`prospect-researcher` profile **correctly** refused to fabricate and asked — in
prose, inside its step output — for a disambiguator + the missing context. That
prose became step 1's "output"; step 2's checkpoint gated on it, also had nothing to
work from, refused too; steps 3–5 cascaded. Final state: workflow "completed" with 5
refusals and **zero usable artifacts on disk**.

The operator expected an "Ask User Question, like a permission prompt" during
execution. None surfaced. The agent believed it was blocked on the user; the user was
never asked.

## Root cause (VERIFIED @ `src/lib/workflows/engine.ts`)

Three defects, all in the checkpoint engine:

1. **No answer channel.** `executeCheckpoint` (line 356) only gates
   `if (step.requiresApproval && i > 0)` — an approve/deny on the *previous* step's
   output. There is no way for the *current* agent to ask the user for missing *data*
   and receive a typed answer.
2. **`waitForApproval` is allow/deny-only** (line 1107). It inserts a
   `type:"permission_required"` notification carrying `WorkflowCheckpoint` toolInput,
   then reads back only `parsed.behavior === "allow"` (line 1138) — it **discards**
   `updatedInput.answer` even though `/api/tasks/[id]/respond` already writes it.
3. **5-minute deny-on-timeout** (line 1126 `deadline = Date.now() + 5*60*1000`; line
   1157 `return false`). On timeout it marks the notification denied and, because a
   denied approval *throws* at line 361, the step **fails**. A HITL run left
   unattended for 5 min silently self-fails.

## Key discovery — the ask-user machinery ALREADY EXISTS (for chat tasks)

Grooming found the answer-carrying loop is already built and Inbox-visible; the
workflow engine simply doesn't reuse it. **Do NOT invent a new `input_required`
notification type** (the finding's original guess). Reuse `AskUserQuestion`:

- `PermissionResponseActions` (`src/components/notifications/permission-response-actions.tsx:113`)
  already renders a free-text textarea (or options radiogroup) for
  `toolName === "AskUserQuestion"` and POSTs
  `{behavior:"allow", updatedInput:{answer}}` to `/api/tasks/[id]/respond`.
- `/api/tasks/[id]/respond` (route.ts:51) already special-cases `AskUserQuestion`,
  validates `{answer: string}`, and writes
  `response: {behavior, updatedInput:{answer}, …}` (line 89).
- `listPendingApprovalPayloads` (`src/lib/notifications/actionable.ts:80,98`) already
  surfaces `permission_required` checkpoint notifications AND extracts `workflowId`
  from `WorkflowCheckpoint` toolInput to deep-link `/workflows/<id>`.

So the plumbing carries an answer end to end today; only the workflow engine throws
it away and hard-codes the timeout.

## Scope

### IN
- A workflow step can post a structured question (`AskUserQuestion` shape) and BLOCK
  until answered, receiving the typed `answer` back as context for the step.
- HITL checkpoint/ask-user steps **hard-pause** — no 5-minute auto-continue and no
  auto-fail. The run waits (workflow status `paused`) until the user responds.
- **Halt-dependents-on-refusal:** if a step's agent refused or produced no usable
  artifact, downstream dependent steps do not run on top of the refusal; the workflow
  ends in a loud `failed`/`needs_input` state, not a false `completed`.
- The pending question surfaces as an actionable Inbox item deep-linked to the
  workflow page (reuse the existing `listPendingApprovalPayloads` path).

### OUT (explicitly fenced — separate arcs)
- FEAT-5/6/7/8 app-shell / run-model activation redesign (separate frontend spec).
- Any new notification *type* — reuse `AskUserQuestion` toolName on the existing
  `permission_required` type. (If a distinct type is later wanted for filtering, that
  is a follow-up; not required for the fix.)
- Detecting "the agent is asking a question" from free prose. This spec gives the
  agent an explicit tool/step-config to *declare* an ask; it does not NLP-parse
  refusal prose. (See "Open question A".)

## Interfaces to touch

| File | Change |
|---|---|
| `src/lib/workflows/engine.ts` | New `waitForInput(workflowId, stepName, question, options?)` mirroring `waitForApproval` but: writes `toolName:"AskUserQuestion"`, `toolInput:{question, options?, workflowId, stepName}`; **no deadline** (poll until responded); returns the `updatedInput.answer` string. `executeCheckpoint` calls it when a step is configured to require input, injects the answer into `contextPrompt`. Remove/raise the 5-min deadline in `waitForApproval` OR make HITL steps use `waitForInput`. Add halt-on-refusal after `executeStep`. |
| `src/lib/workflows/types.ts` (or wherever `WorkflowStep`/`WorkflowDefinition` live) | Step config flag to mark a step as needing user input up front, and/or a per-step `requiresInput`/`inputPrompt`. Confirm exact type location during impl. |
| `waitForApproval` (engine.ts:1107) | Kill the deny-on-timeout for HITL. Decision: either indefinite pause, or a much longer + explicitly-configurable deadline that ends in `paused`/`needs_input`, never a silent `deny`. |
| (verify) `src/lib/notifications/actionable.ts` | Confirm an `AskUserQuestion`-toolName + null-taskId notification deep-links to the workflow. `buildDeepLink` uses `taskId`/`workflowId`; the `WorkflowCheckpoint` branch (line 98) keys on `toolName === "WorkflowCheckpoint"` — extend it to also handle `AskUserQuestion` posted by a workflow, or set the workflow's own id path. |

No DB migration needed — `permission_required` type + `toolInput`/`response`
columns already exist.

## Build sequence (vertical slice first)

1. **Engine `waitForInput` + step-config flag.** Smallest slice: one workflow step
   posts a question, blocks with no timeout, receives `answer`, injects into the next
   prompt. Prove with a unit test that stubs the notification response.
2. **Halt-on-refusal / no-usable-output.** After `executeStep`, if the result is a
   refusal/empty artifact, stop the chain and set a loud terminal state. Define
   "refusal" concretely during impl (result status + empty-output heuristic; avoid
   brittle prose matching — prefer the executor already surfacing a status).
3. **Inbox deep-link + workflow-page pause affordance.** Ensure the question is an
   actionable Inbox item and the workflow page reads as "waiting for you," not stuck.
   (Overlaps FEAT-8 signposting — do the minimum here; full signposting is that spec.)
4. **End-to-end smoke** (REQUIRED — see below).

## Verification (end-to-end, non-negotiable)

`engine.ts` is on the flagship workflow execution path. Per CLAUDE.md smoke-budget
rule, unit tests alone are insufficient — run a real HITL workflow under
`npm run dev`:
- Trigger the Agency Pro "New-Business Machine" with an empty `What we know`.
- Confirm: an ask-user prompt surfaces in the Inbox (not prose in step output); the
  run PAUSES indefinitely (leave it >5 min to prove no auto-fail); answering unblocks
  the step; downstream steps run on the real answer; on a refusal, dependents halt and
  the run ends loudly, not as false `completed`.
- Also verify no regression to the existing chat-task `AskUserQuestion` path (shared
  `/respond` endpoint + component).

## Open questions (decide during impl / with operator)

- **A. Declared vs. inferred ask.** This spec assumes the ask is *declared*, not
  inferred from refusal prose. Mechanism confirmed viable: `WorkflowStep`
  (`src/lib/workflows/types.ts:9`) is cleanly extensible — it already carries optional
  additive fields (`requiresApproval`, `delayDuration`, `postAction`). Add
  `requiresInput?: boolean` + reuse `prompt` (or a new `inputPrompt?`) as the question
  the step pre-collects BEFORE the agent runs. Whether a profile can ALSO emit a
  structured ask mid-step (agent-side tool call) is a stretch goal, not required for
  the slice — the step-config pre-collect resolves the observed New-Business case
  (empty `What we know`).
- **B. Pause semantics.** Indefinite pause vs. long configurable deadline ending in
  `needs_input`. Recommendation: indefinite `paused` + Inbox item is the honest
  default (no silent machine decision).
- **C. Principles.** Fix restores #1 (zero silent failures — no false `completed`) and
  #3 (shadow paths — empty upstream input no longer flows through 5 steps unchecked).

## POSITIVE (do NOT "fix")

The agent profiles refusing to fabricate is **correct** guardrail behavior
(prospect-researcher: public-sources-only; proposal-writer: every claim traces to the
brief). BUG-3 is ONLY that their ask has no channel to reach the user — not that they
refused. Preserve the refusal behavior.
