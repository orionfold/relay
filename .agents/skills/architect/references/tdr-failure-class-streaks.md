# TDR: Auto-pause streak counts per failure class

**Status:** Accepted
**Date:** 2026-04-08

## Context

The original scheduler had a single `failureStreak` that tripped auto-pause after 3 consecutive failures regardless of cause. Sharing this counter across genuinely-failing runs and misconfigured `maxTurns` values is a footgun: a user who sets `maxTurns=10` on a schedule averaging 40 would trip auto-pause in 3 firings — potentially within 3 minutes on a `* * * * *` cron — before they realized the config took effect.

## Decision

Split the streak counter per failure class:
- `failureStreak` — generic failures (SDK error, timeout, auth, etc.). Auto-pause threshold: 3.
- `turnBudgetBreachStreak` — turn-limit exceeded. Auto-pause threshold: 5, with first-breach grace: breaches in the first 2 cron intervals after a `maxTurnsSetAt` edit are logged only.

Future failure modes (e.g. context window exceeded, MCP tool failures) should each get their own counter if the appropriate auto-pause threshold differs from the generic 3.

## Consequences

- `schedules` schema grows one counter column per named failure class.
- The runtime adapter must write explicit `failure_reason` at terminal transitions so the classifier has reliable input — string-matching error text is fragile.
