---
id: TDR-016
title: Learning session buffering for batch notifications
date: 2026-03-30
status: accepted
category: agent-system
---

# TDR-016: Learning session buffering for batch notifications

## Context

Workflow execution involves multiple sequential tasks. Each task may extract patterns worth learning. Creating a notification per pattern during a multi-step workflow floods the inbox.

## Decision

Learning sessions wrap workflow execution. openLearningSession(workflowId) starts a buffer. During execution, bufferProposal() collects context proposals in memory. closeLearningSession(workflowId) flushes all proposals as a single batch notification.

## Consequences

- Users see one "N patterns extracted" notification per workflow instead of N individual ones.
- Proposals are still individually reviewable in the batch.
- Session state is in-memory (lost on crash — acceptable since proposals are best-effort).

## Alternatives Considered

- **Individual notifications per proposal** — inbox spam.
- **Auto-approve all proposals during workflows** — bypasses human oversight.
- **Queue proposals in database** — over-engineered for in-process buffering.

## References

- `src/lib/agents/learning-session.ts`
- `src/lib/workflows/engine.ts` (opens/closes sessions)
