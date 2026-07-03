---
title: Fix — snapshot restore self-deadlocks on its own pre-restore safety snapshot (100% reproducible)
status: fixed
priority: P1
milestone: mvp
issue: https://github.com/orionfold/relay/issues/24
source: staging Mode B run 2026-07-03, bundle output/staging/2026-07-03-suite/ (JS5-RESTORE, verified CORRECTED against HEAD f00fdaa3)
dependencies: []
---

# Fix: snapshot restore always returns 500 — re-entrant lock deadlock

## Description (verified mechanism, not the raw symptom)

`POST /api/snapshots/[id]/restore` returns **HTTP 500 "Another snapshot operation
is already in progress"** on **every** call — restore can never succeed.

The raw staging finding guessed a "stuck/desynced module boolean" or "async race."
Code-verification against HEAD **corrected** the cause to a deterministic
re-entrant deadlock:

1. `restoreFromSnapshot()` (`src/lib/snapshots/snapshot-manager.ts:351`) passes the
   entry lock-check (lock is false) and sets `snapshotLock = true` at `:373`.
2. At `:377` it calls `createSnapshot("pre-restore-…", "auto")` to take a safety
   snapshot before overwriting the DB.
3. `createSnapshot` (`:111-112`) checks `if (snapshotLock) throw new Error("Another
   snapshot operation is already in progress")` — which is now `true` because restore
   set it at step 1. It throws.
4. Both `finally` blocks release the lock, but the error has already propagated out.
5. The route's catch-all (`src/app/api/snapshots/[id]/restore/route.ts:53`) maps the
   generic `Error` to **500** (with the same string the route's own guard would have
   returned as **409** at `:17`).

This explains the diagnostic that misled the raw finding: a fresh `createSnapshot`
returns **201** moments before (nothing holds the lock), yet restore returns **500**
(restore itself holds the lock before calling create). It is not a race — it is a
self-deadlock that fires 100% of the time.

## Repro

1. Any running instance (staging: `:3199`). Take a snapshot (`POST /api/snapshots`).
2. `POST /api/snapshots/<id>/restore` → 500 "Another snapshot operation is already in
   progress" — every time, regardless of prior state or concurrent activity.

## Proposed fix

- Give `createSnapshot` an internal re-entrant path that skips the mutex when called
  from within an already-locked operation (e.g. `createSnapshotUnlocked()` used by
  `restoreFromSnapshot`'s pre-restore step), OR restructure `restoreFromSnapshot` to
  take the safety snapshot **before** acquiring the restore lock.
- Name the errors (CLAUDE.md principle #2): a `SnapshotBusyError` (→ 409) distinct
  from any genuine failure, so the route never conflates "someone else is snapshotting"
  (409) with a code defect (500). Map `SnapshotBusyError` → 409 in the route.
- Add a regression test: create → restore round-trip must succeed and repopulate the
  DB (the staging JS5 round-trip the pass could not complete).

## Principle
CLAUDE.md #2 (every error has a name) — an unnamed `Error` conflates lock-contention
with a deadlock; #1-adjacent (the failure is loud but misdiagnostic).
