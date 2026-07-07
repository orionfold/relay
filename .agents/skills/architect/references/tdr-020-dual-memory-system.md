---
id: TDR-020
title: Dual memory system — episodic vs behavioral learned context
date: 2026-04-02
status: accepted
category: agent-system
---

# TDR-020: Dual memory system — episodic vs behavioral learned context

## Context

Agents need two kinds of memory: curated behavioral patterns (how to perform tasks better over time) and granular episodic knowledge (facts, preferences, patterns, outcomes discovered during execution). These have different lifecycles, confidence models, and retrieval patterns.

## Decision

Two complementary memory stores serve different purposes:

**Behavioral memory** (`learnedContext` table, TDR-008): Human-curated via proposal/approval flow. Produces a single versioned document per profile. High-trust, low-volume. Content is a monolithic text blob that grows via diffs. Auto-summarization at 75% of 8KB limit.

**Episodic memory** (`agentMemory` table): Automatic, per-memory confidence scoring. Categories: `fact`, `preference`, `pattern`, `outcome`. Each memory has:
- **Confidence** (0-1000 integer scale, default 700): represents trust level.
- **Decay rate** (`decayRate` in thousandths per day, default 10 = 0.01/day): configurable per-memory temporal decay.
- **Access tracking** (`lastAccessedAt`, `accessCount`): memories accessed more frequently resist decay.
- **Status lifecycle**: `active` → `decayed` → `archived` | `rejected`.

Retrieval (`src/lib/agents/memory/retrieval.ts`) scores by confidence, recency (exponential decay), and tag overlap with task context. Extraction (`extractor.ts`) generates candidate memories from task results. Decay processing (`decay.ts`) runs periodically to transition memories.

The two systems are deliberately not unified: learned context is curated and deterministic; episodic memory is probabilistic and self-managing.

## Consequences

- Agents accumulate knowledge automatically without human approval overhead.
- Confidence decay prevents stale memories from polluting retrieval.
- The dual system means agents have both "institutional knowledge" (learned context) and "personal experience" (episodic memory).
- Retrieval must balance both sources — learned context is always included; episodic memories are filtered by relevance score.

## Alternatives Considered

- **Single unified memory store** — conflates curated and automatic knowledge; makes approval flow impractical for high-volume facts.
- **Vector database for semantic retrieval** — external dependency; tag-based filtering with confidence scoring is sufficient for current scale.
- **No decay mechanism** — memory bloat over time; irrelevant old memories crowd out useful recent ones.

## References

- `src/lib/agents/memory/retrieval.ts` — relevance-scored episodic retrieval
- `src/lib/agents/memory/extractor.ts` — memory extraction from task results
- `src/lib/agents/memory/decay.ts` — confidence decay processing
- `src/lib/db/schema.ts` — `agentMemory` table
- TDR-008 — learned context versioning (behavioral memory)
