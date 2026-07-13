---
title: Task run history on task detail
status: completed
priority: P1
milestone: post-mvp
source: _IDEAS/backlog.md G-006 and G-041 / GitHub #47
dependencies: []
---

# Task run history on task detail

## Description

Task detail should be the durable place to understand what happened to one task. Today it shows the task's latest state and aggregate usage, while prior execution evidence lives in the Monitor stream or raw database-backed endpoints. Add a bounded, scan-friendly run history that combines durable execution rows from `usage_ledger` with the associated `agent_logs`.

This is historical inspection, not a second live-stream console. A currently running attempt appears immediately and links to Monitor for live following; completed attempts retain their status, timestamps, runtime/model metadata, and expandable recorded events.

## User Story

As an operator, I want to inspect a task's previous attempts and logs on its detail page so that I can understand success, failure, retries, and prior activity without reconstructing it elsewhere.

## Technical Approach

- Add a server-only task-history query that selects the bounded recent execution ledger rows and associated task logs.
- Treat task-run, task-resume, workflow-step, and scheduled-firing ledger entries as execution attempts; exclude assist and background accounting entries.
- Synthesize the active attempt from task status and post-ledger logs until its terminal ledger row is written.
- Expose the query through a task-scoped JSON route so the client can refresh history while the task is running.
- Render an opaque operational section on task detail with compact attempt summaries and expandable, read-only log snapshots.
- Preserve explicit empty, unavailable/pruned, truncated-history, and route-failure states.

## Acceptance Criteria

- [x] A never-run task shows an explicit `No runs yet` state.
- [x] A running task shows a current running attempt and a link to its filtered Monitor stream.
- [x] Completed, failed, and cancelled attempts show status, start/finish timestamps, duration, runtime/model metadata when known, and their associated logs.
- [x] Multiple attempts are ordered newest first and individually expandable without mixing their logs.
- [x] An attempt whose detailed logs are absent says that logs are unavailable or may have been pruned.
- [x] A terminal task with no remaining execution rows shows an explicit unavailable-history state rather than appearing never run.
- [x] The client refreshes history during execution and surfaces fetch failures instead of silently freezing.
- [x] Query/route tests and browser checks cover never-run, running, completed, failed, and multiple-run states.

## Scope Boundaries

**Included:**

- Task-scoped durable attempt summaries and logs.
- A bounded recent-history response with an explicit omitted-count notice.
- Current-run refresh behavior and Monitor handoff.

**Excluded:**

- Replacing Monitor's live stream, filters, or auto-scroll.
- New run-history persistence or a schema migration.
- Cross-task analytics, search, or long-term log-retention policy changes.

## References

- Goals: `_IDEAS/backlog.md` G-006 and G-041
- Existing data: `src/lib/db/schema.ts` (`usageLedger`, `agentLogs`)
- Existing live surface: `src/app/monitor/page.tsx`

## G-041 semantic-history hardening — 2026-07-12

G-041 made the G-006 history portable across every task-inspection surface and bounded by rendered
meaning rather than only raw row count:

- Full task detail and the task-summary sheet use the same `TaskRunHistory` component and
  `useTaskRunHistory` lifecycle. The hook aborts pending requests and clears polling when a panel is
  closed, a task changes, or the component unmounts.
- Stream token fragments collapse into contiguous `Response ×N` events. Tool calls, runtime events,
  permission requests and decisions, failures, and terminal events retain their chronological
  positions. The raw `agent_logs` and Monitor stream are unchanged.
- At most 20 attempts and 160 semantic events enter the response/DOM. Individual source payloads
  are bounded at 2,000 characters and visibly marked `trimmed`; filtered Monitor is always
  available for complete diagnostics.
- Both attempt and event disclosures have explicit Enter/Space behavior in addition to pointer
  activation and visible focus treatment.

Verification used 14 focused tests plus TypeScript and the production build. The existing live
delegated research task rendered 20 semantic events while retaining hundreds of raw records,
including its Agent delegation, WebFetch calls, denied Bash permission, completion, and usage.
Full-page and side-panel checks at desktop and 390px had no horizontal overflow, and the filtered
Monitor handoff and browser console were clean. Evidence screenshots are stored in
`output/g041-task-history-desktop.png` and `output/g041-task-history-390.png`.
