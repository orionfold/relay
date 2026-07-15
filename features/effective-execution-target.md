---
title: Preview and honor the effective execution target
status: completed
priority: P1
milestone: post-mvp
source: _IDEAS/triage.md#TRIAGE-023
dependencies: [distributed-ollama-diagnostic]
---

# G-056 — Preview and honor the effective execution target

## Description

Relay must tell an operator which profile, runtime, and model will execute a
task or workflow before execution begins, then persist and report the same
target after launch. An explicit runtime is an instruction, not a preference:
if it is unavailable or lacks a required capability, Relay blocks and names the
problem instead of silently running on another provider.

Manual routing disables automatic selection and uses Relay's default runtime.
It is not a hidden per-run provider picker. Automatic modes may choose a
healthy compatible runtime, but the reason and resulting target remain visible.

## Operator decision

Scope mode is **HOLD**. The operator instructed Relay to complete the next goal
in the series. G-056 therefore takes the conservative rescue policy:

- an incompatible or unavailable explicit target always blocks;
- Relay may show compatible alternatives, but execution requires the operator
  to explicitly edit/select one;
- no automatic or implicit one-run fallback is permitted for an explicit
  target;
- public trust/cost/privacy copy remains outside this goal.

## What already exists

- `resolveTaskExecutionTarget()` already filters configured runtimes and probes
  availability.
- Tasks already persist requested runtime (`assignedAgent`), effective runtime,
  effective model, and fallback reason.
- Workflow steps already support a runtime override and create ordinary child
  tasks, so the task receipt remains the durable execution record.
- Task detail already renders requested/effective runtime badges and usage.
- `resolveOllamaModel()` already selects a configured or actually pulled model
  without inventing a phantom model.
- The runtime-module-graph smoke already proves task, workflow, and Chat module
  loading through a real Next process.

## Target contract

```text
saved task/workflow definition
        |
        v
requested profile + runtime + model
        |
        v
capability + configuration + health + model resolution
        |
        +-- blocked -> named reason -> operator edits target -> retry preview
        |
        v
effective profile + runtime + model + selection reason
        |
        v
execute route revalidates before state claim
        |
        v
task fields -> Monitor/detail -> usage ledger -> workflow child receipt
```

### Runtime precedence

- Task: explicit `assignedAgent`; otherwise Manual/default or automatic routing.
- Workflow step: `step.runtimeId`, then legacy `step.assignedAgent`, then
  `workflow.runtimeId`, then Manual/default or automatic routing.
- Resume: the previous effective runtime is authoritative; unavailable resume
  blocks and instructs the operator to use Retry for a fresh target.

### States

- `ready / explicit`: requested and effective runtime match.
- `ready / manual-default`: auto-routing is off; default runtime is healthy.
- `ready / automatic`: Relay selected a healthy compatible target and explains
  why.
- `blocked / capability`: runtime lacks Bash/filesystem or profile support.
- `blocked / configuration`: runtime is not configured.
- `blocked / availability`: configured runtime probe failed.
- `blocked / model`: no real model can be resolved.

## Error & Rescue Registry

| Error | Trigger | Impact | Rescue |
|---|---|---|---|
| `RuntimeCapabilityMismatchError` | Explicit runtime lacks profile support, Bash, or filesystem tools | Run is not claimed | Name missing capability; edit profile/runtime |
| `RuntimeUnavailableError` | Explicit/default runtime is unconfigured or unhealthy | Run is not claimed | Configure/test runtime or explicitly choose another |
| `OllamaModelNotConfiguredError` | No configured or pulled Ollama model | Run is not claimed | Pull/select a real model in Settings |
| Target changes after preview | Settings/profile/runtime health changes before execute | Stale preview must not authorize a different target | Execute route re-resolves and returns the new named state |
| Workflow step target fails | Any executable step is incompatible before claim | Entire workflow stays unclaimed | Name the step and edit its target/profile |
| Module-load cycle via chat-tools import | Static chat-tools import enters runtime registry graph | First real request crashes | Keep new contract modules free of chat-tool imports; use dynamic import if later required |
| Receipt/model drift | Adapter or usage ledger resolves a different model | UI and accounting disagree | Persist target model before launch and have adapter honor it |

## Acceptance Criteria

- [x] Task preview shows requested and effective profile/runtime/model plus the
  selection mode/reason before Run.
- [x] Workflow preview shows every executable step target before Run/Re-run;
  delay steps are excluded.
- [x] Manual routing explicitly says auto-routing is disabled and uses the
  default runtime.
- [x] Every compatible explicit runtime override is honored without fallback.
- [x] Incompatible/unavailable explicit targets block before state claim with a
  named error and an explicit edit-target rescue.
- [x] `document-writer` + Ollama names the missing filesystem capability.
- [x] Workflow runtime precedence is identical in preview, persisted child task,
  and dispatch.
- [x] Task effective runtime/model match the usage ledger and visible receipts.
- [x] Empty Ollama default remains empty in provider/settings summaries and
  preview resolves an actually pulled model rather than `llama3`.
- [x] Resume retains the prior effective runtime and blocks if it is unavailable.
- [x] Task and workflow detail previews work at desktop and 390px in dark theme,
  use semantic theme tokens, retain keyboard-visible controls, and add no cursor
  switching behavior.
- [x] A deterministic resolver regression proves Manual/default independently;
  the real runtime-graph smoke proves explicit Ollama task/workflow execution
  without a module-load cycle.

## Completion evidence — 2026-07-14

- Resolver, dispatch, route, workflow-precedence, provider-summary, and preview
  regressions pass, including explicit target/model pins, stale profiles,
  Manual/default, launch fallback boundaries, and the Ollama filesystem guard.
- Full Vitest membership passes: 423 files, 3,267 tests, one skipped.
- TypeScript, design-token validation, and `git diff --check` pass.
- `npm run test:runtime-graph` passes through a real Next process with an
  explicit Ollama task and workflow (`requested = effective = ollama`, model
  `relay-smoke`) and a normal `stream.completed` Chat termination.
- Browser verification passed for a ready task, a blocked stale-profile task,
  and a four-step workflow at desktop and 390px in dark mode. Run/Re-run stayed
  disabled until target resolution, blocked runs named the rescue, ready runs
  enabled, and no checked surface overflowed horizontally.

## NOT in scope

- Chat turn model fallback — G-072 owns the cross-provider Chat contract.
- New runtime/provider adapters — G-069 owns LiteLLM and LM Studio.
- A new task-level model picker or schema migration — tasks currently derive
  model from profile/runtime settings; effective model is persisted.
- Public claims about Ollama privacy, locality, or infrastructure cost — require
  a separate public-copy gate.
- Customer three-host LAN validation — G-057 closed with that topology
  unavailable.

## References

- `_IDEAS/backlog.md` — G-056
- `features/distributed-ollama-diagnostic.md` — G-057 evidence
- TDR-001, TDR-006, TDR-031, TDR-032
