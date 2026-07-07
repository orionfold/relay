---
name: writing-plans-overrides
description: "Project-level overrides for the superpowers writing-plans skill. Adds scope challenge step and required plan sections to every implementation plan."
---

# Writing Plans — Project Overrides

These overrides augment the base `superpowers:writing-plans` skill. Apply these rules IN ADDITION to the plugin's base behavior.

## Scope Challenge Step

Before writing the plan, perform a scope challenge. Ask these questions (internally or to the user):

1. **Is this overbuilt?** — Are there components in the spec that add complexity without proportional value?
2. **Can we reuse existing code?** — Grep the codebase for utilities, patterns, or components that already solve part of this.
3. **Can scope be compressed?** — Is there a simpler architecture that delivers 80% of the value?

Present the challenge result with three paths:
- **REDUCE scope** — [what to cut and why]
- **PROCEED as-is** — [confirmation that scope is right-sized]
- **EXPAND scope** — [what's missing that would make this significantly more valuable]

Wait for user confirmation before proceeding to plan writing.

## Required Plan Sections

Every plan must include these sections (in addition to the standard task structure):

- **"NOT in scope"** — explicit list of what this plan does NOT cover, with rationale for each deferral
- **"What already exists"** — code, utilities, and patterns found during scope challenge that can be reused
- **Error & Rescue Registry** (for non-trivial features) — table mapping failure modes to recovery strategies

## Smoke-Test Budget for Runtime-Registry-Adjacent Features

If the plan's "What already exists" or "Files touched" list mentions **any** of these modules, the plan MUST include an explicit end-to-end smoke-test step in its verification section — not just unit tests:

- `src/lib/agents/Codex-agent.ts`
- `src/lib/agents/runtime/Codex.ts` (or any other adapter under `src/lib/agents/runtime/`)
- `src/lib/agents/runtime/catalog.ts` / `index.ts`
- `src/lib/workflows/engine.ts`
- `src/lib/workflows/loop-executor.ts`
- Any module that statically imports `@/lib/chat/ainative-tools` or `@/lib/chat/tools/*`

**Why:** These modules sit in a tight import cycle with the runtime registry. A static import from any of them into `@/lib/chat/ainative-tools` triggers `ReferenceError: Cannot access 'claudeRuntimeAdapter' before initialization` at Next.js request time. **Unit tests that `vi.mock("@/lib/chat/ainative-tools", ...)` structurally cannot catch this cycle** — the real module is replaced by the test harness and the cycle is never evaluated.

**What the smoke-test step must do:**
1. Start `npm run dev` on a free port (`PORT=3010 npm run dev` avoids colliding with parallel instances).
2. Trigger at least one real task via chat/MCP/UI that exercises the modified code path.
3. Confirm no `ReferenceError` or missing-tools error appears in the dev server output.
4. Record the verification run in the feature spec's References section with task ID, runtime used, and outcome.

**What the plan must include when flagged:**
- A dedicated task (not just a bullet) for the smoke step, with start/stop dev-server instructions and the exact prompt to trigger.
- A note in the Error & Rescue Registry that explicitly lists "module-load cycle via chat-tools import" as a failure mode, with the dynamic-`await import()` pattern as the recovery.

**Reference:** TDR-032 and the verification run in `features/task-runtime-ainative-mcp-injection.md`. Precedent: commits `092f925` → `2b5ae42` — the feature shipped with 34/34 passing unit tests and 0 TypeScript errors, yet crashed at the first real task execution because of a cycle introduced by a static import. Only the smoke test caught it.
