# fix: table-trigger dispatch + compose trigger-create fail on any non-:3000 instance (getBaseUrl localhost fallback)

**Status:** IMPLEMENTED + VERIFIED (2026-07-04) · **Priority:** P1 (HIGH) · **Milestone:** next patch (0.25.x)
**Source:** staging Mode B run 2026-07-03, bundle `output/staging/2026-07-03/R2/` (findings R2-3 + R2-2, verified against HEAD `3e0f438c`) · **Public issue:** #29
**Dependencies:** none. Runtime-registry-adjacent? No (data/table subsystem), but a real-launch smoke on a non-3000 port is REQUIRED to verify (see below).

## Description (verified mechanism, not the raw symptom)

Table row-insert triggers silently fail to dispatch, and the compose agent's own `create_trigger`
tool silently fails, on **any Relay instance not reachable at `http://localhost:3000`** — i.e. any
customer using `--port <other>`, `--hostname 0.0.0.0`, a container, or a reverse proxy.

**One root cause, three sites** — an internal self-HTTP call built from a hardcoded base-URL fallback:

```ts
function getBaseUrl(): string {
  return process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}
```

- `src/lib/tables/trigger-evaluator.ts:216` — the trigger DISPATCHER. Fetches `${getBaseUrl()}/api/tasks`
  (`:150`, `create_task` action) and `${getBaseUrl()}/api/workflows/${workflowId}/execute` (`:190`,
  `run_workflow` action). Failure caught + logged at `:80` as `[triggers] Failed to fire trigger …:
  TypeError: fetch failed`; the trigger's `fire_count` stays 0.
- `src/lib/chat/tools/table-tools.ts:1069-1071` — **byte-identical** copy. The compose `create_trigger`
  tool (`:928`) POSTs `${getBaseUrl()}/api/tables/${tableId}/triggers` at `:945`, with **no retry**
  (`:958`) and no cross-call atomicity → compose leaves a table+workflow but an un-wired trigger (R2-2).
- `src/lib/chat/tools/table-tools.ts:602` — a second inline copy of the same fallback.

**Why it's silent (Principle #1 violation):** the dispatcher swallows the error into a server-log line;
the UI trigger card still shows "active" + toggle on + "0 fires". A customer's "high-risk visit
automatically triggers a follow-up" promise quietly does nothing, with no browser-visible signal.

**Scope (corrected during verify):** blueprint-based `run_workflow` triggers are IMMUNE — they dispatch
in-process via `dispatchBlueprintForRow` (`trigger-evaluator.ts:162-187`), no HTTP. Only `create_task`
triggers and legacy `config.workflowId`-based `run_workflow` triggers are affected.

**The routes are healthy** — the fault is only the base URL. Proven at run time:
`curl -X POST http://localhost:3000/api/workflows/<id>/execute → 000 (connection refused)` vs
`curl -X POST http://127.0.0.1:3199/api/workflows/<id>/execute → 202 Accepted`.

The CLI launch path sets NEITHER env var (`bin/cli.ts:455-467` sets `PORT`/`RELAY_DATA_DIR`/…;
`scripts/staging.mjs` neither), so the `:3000` fallback is always used unless the customer manually exports.

## Repro
1. Launch Relay on a non-3000 port (`relay --port 3210`, or the staging harness on `:3199`).
2. Create a table with a `row_added` → `run_workflow` (workflowId) or `create_task` trigger, active.
3. Insert a row matching the trigger condition (`POST /api/tables/<id>/rows` → 201).
4. Observe: `fire_count` stays 0, no dispatch, server.log `[triggers] Failed to fire trigger …: TypeError: fetch failed`.

## Proposed fix
Derive the self-origin instead of hardcoding `:3000`. `PORT` is already in the child env
(`bin/cli.ts:459`), and `bin/cli.ts:415` computes `bindHost` from `--hostname`. Cheapest correct fix:

1. Thread `RELAY_SELF_BASE_URL` (e.g. `http://127.0.0.1:${actualPort}`) into the child env at
   `bin/cli.ts:455-467`, built from the known bind host/port.
2. Update `getBaseUrl()` at all THREE sites (`trigger-evaluator.ts:216`, `table-tools.ts:1069`, `:602`)
   to prefer `process.env.RELAY_SELF_BASE_URL`, falling back to `http://127.0.0.1:${process.env.PORT ?? 3000}`
   (loopback + real port) rather than a bare `:3000`. Extract to ONE shared helper (DRY — Principle #6, third use).
3. (Optional, R2-2) add retry-with-backoff on the compose `create_trigger` internal call so a transient
   fetch failure doesn't permanently leave the app half-wired; and/or surface the specific unbuilt primitive
   in the compose summary as a retry action.

## Verification (REQUIRED — real launch, not unit test)
Unit tests mock `fetch`, so the base-URL fallback never resolves to a real socket — they pass today and
would keep passing with the bug present. MUST verify with a real launch on a non-3000 port:
`relay --port 3210` (or the staging harness) → create trigger → insert matching row → assert `fire_count`
increments AND the workflow/task actually dispatches (visible in /monitor + /inbox). This is the
smoke-budget class in CLAUDE.md.

## Implementation + verification run — 2026-07-04

**Fix shipped** (all against HEAD `3e0f438c`, on `main`):
- New zero-import leaf `src/lib/http/self-base-url.ts` exports `getSelfBaseUrl()`: precedence
  `RELAY_SELF_BASE_URL` → `NEXTAUTH_URL` → `NEXT_PUBLIC_APP_URL` → `http://127.0.0.1:${PORT}` →
  `http://127.0.0.1:3000`. Import-free because `table-tools.ts` is runtime-catalog-reachable
  (memory `shared-constant-zero-import-leaf`).
- All 3 sites now delegate to it: `trigger-evaluator.ts` (2 self-fetches + deleted local `getBaseUrl`),
  `table-tools.ts:602` inline copy + the shared `getBaseUrl()` helper (11 call sites: charts/triggers/
  templates/export — all were broken, all fixed by the one helper-body swap).
- `bin/cli.ts` threads `RELAY_SELF_BASE_URL: buildSidecarUrl(actualPort, "127.0.0.1")` into the child env.
- Unit test `src/lib/http/__tests__/self-base-url.test.ts` guards the precedence (4 cases).

**Un-masked a SECOND latent bug (same `create_task` dispatch path):** once the self-call actually reached
the server, `POST /api/tasks` returned **400** — the trigger sent `projectId: config.projectId ?? null`,
but `createTaskSchema` wants `string | undefined` (null is rejected). This 400'd on EVERY port (even
:3000), silently swallowed. Fixed by omitting the key when absent (`...(config.projectId ? {projectId} : {})`).
The port bug had been masking it — the socket died before the body was ever validated.

**Real-launch smoke (the required gate):** `next dev --port 3210 --hostname 127.0.0.1` with `PORT=3210` +
an isolated data dir. Created a table → `create_task` trigger (condition `risk == high`) → inserted a
matching row via `POST /api/tables/:id/rows`. Result: `fireCount` → 1 AND a task titled "Follow up on
high-risk lead #29" was actually created; server.log shows `POST /api/tasks 201` (the pre-fix `400` at
log line 278 vs the post-fix `201` proves the projectId fix; the self-call reaching :3210 at all proves
the base-URL fix — the old `:3000` fallback would have produced no `/api/tasks` POST line at all).
Tests: 104 (helper+tables+data) + 331 (chat) green.

**Not done (optional, per spec step 3 / R2-2):** retry-with-backoff on the compose `create_trigger`
internal call, and surfacing the swallowed non-2xx. The base-URL root cause is fixed; these are
robustness hardening left for follow-up.
