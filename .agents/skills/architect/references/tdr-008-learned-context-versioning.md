---
id: TDR-008
title: Learned context versioning with proposal-approve flow
date: 2026-03-30
status: accepted
category: agent-system
---

# TDR-008: Learned context versioning with proposal-approve flow

## Context

Agents learn patterns during task execution that could improve future performance. Need a supervised (not autonomous) mechanism for context accumulation.

## Decision

Learned context follows a proposal to approval flow. Pattern extraction identifies reusable knowledge from completed tasks. Proposals are created as learnedContext rows with changeType="proposal" and a notification is sent. Humans approve/reject in the inbox. Approved context is versioned (auto-incrementing per profile) and injected into future task prompts. Auto-summarization triggers at 75% of the 8KB character limit.

## Consequences

- Human supervision prevents hallucinated patterns from accumulating.
- Version history enables rollback.
- Notification-based approval reuses existing human-in-the-loop infrastructure.
- Learning sessions buffer proposals during workflows to prevent notification spam.

## Alternatives Considered

- **Autonomous context accumulation** — no human oversight, risky.
- **RAG over past task outputs** — complex, less precise.
- **No learning at all** — misses improvement opportunity.

## References

- `src/lib/agents/learned-context.ts`
- `src/lib/agents/pattern-extractor.ts`
- `src/lib/agents/learning-session.ts`
