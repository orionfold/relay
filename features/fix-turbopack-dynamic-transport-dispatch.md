---
title: Fix Turbopack dynamic transport-dispatch warning
status: planned
priority: P1
milestone: post-mvp
source: output/operator-walkthrough-feedback-2026-07-07.md
dependencies: [provider-runtime-abstraction]
---

# Fix Turbopack Dynamic Transport-Dispatch Warning

## Description

During the walkthrough, Next.js Turbopack repeatedly warned from
`src/lib/plugins/transport-dispatch.ts`: `Module not found: Can't resolve <dynamic>`. The app
continued serving routes and the browser console stayed clean, but the warning appears across Home,
Tasks, Packs, app detail, instrumentation, and runtime import traces.

Because the import path is transitively reachable from runtime registry and workflow modules, the
fix must preserve the module-load-cycle guardrails in `AGENTS.md`: no static import from
`src/lib/agents/*` into chat-tools style modules, and an end-to-end dev smoke after any import
reshape.

## User Story

As a Relay developer, I want dev-server warnings to identify real issues so that repeated dynamic
import noise does not hide regressions.

## Technical Approach

- Inspect `transport-dispatch.ts` for dynamic `import()` or computed module specifiers that
  Turbopack cannot statically analyze.
- Replace unsupported dynamic import shapes with explicit registries or guarded dynamic imports
  that preserve lazy behavior.
- Check every import trace for runtime-registry-adjacent blast radius.
- Add a focused test or build assertion where practical.
- Run `npm run dev` and execute a real task/route smoke per the runtime-registry smoke budget.

## Acceptance Criteria

- [ ] `npm run dev` no longer emits `Can't resolve <dynamic>` for `transport-dispatch.ts`.
- [ ] Runtime plugin transport dispatch still resolves supported transports.
- [ ] Unsupported transports fail with a named visible error.
- [ ] No new module-load cycle is introduced through `@/lib/agents/runtime/catalog.ts`.
- [ ] End-to-end dev smoke covers at least one route importing workflow/runtime code.

## Scope Boundaries

**Included:**
- Transport dispatch import shape and tests/smoke around it.

**Excluded:**
- New plugin transport types.
- Broader Turbopack upgrade work.

## References

- `output/operator-walkthrough-feedback-2026-07-07.md`
- `AGENTS.md` runtime-registry smoke-test budget
