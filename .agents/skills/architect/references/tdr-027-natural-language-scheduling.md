---
id: TDR-027
title: Natural language schedule parsing with layered fallback
date: 2026-04-02
status: accepted
category: workflow
---

# TDR-027: Natural language schedule parsing with layered fallback

## Context

Cron expressions are powerful but hostile to non-technical users. Schedule creation needed to accept plain-English expressions while maintaining deterministic, predictable behavior.

## Decision

Schedule parsing uses a layered fallback strategy — all deterministic, no LLM dependency:

**Layer 1: NLP regex patterns** (`nlp-parser.ts`): Deterministic pattern matching for common expressions ("every weekday at 9am", "twice daily", "every 2 hours during business hours"). Returns `{ cronExpression, description, confidence: 1.0 }`. Covers ~80% of natural language inputs.

**Layer 2: Interval parser** (`interval-parser.ts`): Simple interval syntax fallback ("5m", "2h", "1d"). Used when NLP patterns don't match.

**Layer 3: Raw cron** (existing): Direct cron expression input for power users.

For heartbeat schedules, the HEARTBEAT.md format (`heartbeat-parser.ts`) defines both schedule and checklist in structured Markdown — H2 headings as schedule expressions, list items as checklist items. This format is human-readable and version-controllable.

All parsers output a standard `{ cronExpression, description, confidence }` tuple. The UI shows a parse preview before committing.

## Consequences

- Non-technical users can create schedules without learning cron syntax.
- All parsing is deterministic with clear confidence signals — no LLM variability.
- The layered fallback means graceful degradation: NLP → interval → raw cron.
- HEARTBEAT.md format enables checklist-as-code patterns (stored in repos, diffable).
- Adding new NLP patterns requires only extending the regex map in `nlp-parser.ts`.

## Alternatives Considered

- **LLM-based NL → cron translation** — non-deterministic; same input could produce different cron expressions; hard to debug.
- **Calendar picker UI only** — can't express complex recurrence patterns easily.
- **External NLP library (e.g., chrono-node)** — dependency overhead; regex patterns are sufficient for scheduling-domain expressions.

## References

- `src/lib/schedules/nlp-parser.ts` — NLP regex pattern matcher
- `src/lib/schedules/interval-parser.ts` — simple interval parser
- `src/lib/schedules/heartbeat-parser.ts` — HEARTBEAT.md format parser
- `src/lib/schedules/__tests__/nlp-parser.test.ts` — NLP parser tests
