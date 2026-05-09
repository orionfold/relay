---
title: F10 — Row-add idempotency (canonical hash + ON CONFLICT DO NOTHING)
date: 2026-05-08
status: shipped
features: [F10]
touches:
  - src/lib/db/schema.ts
  - src/lib/db/bootstrap.ts
  - src/lib/db/migrations/XXXX_add_user_table_rows_data_hash.sql
  - src/lib/data/tables.ts
  - src/lib/data/__tests__/tables-row-hash.test.ts (new)
  - src/lib/chat/tools/table-tools.ts (return shape only)
---

# F10 — Row-add idempotency

## Problem

`addRows()` in `src/lib/data/tables.ts:320` inserts every row in its input array unconditionally. The reproducer (HANDOFF.md lines 49-57): an agent re-read a row mid-batch and inserted 13 rows from a 12-row CSV. Same content, different row IDs, no observable error.

Today the only key on `user_table_rows` is the auto-generated `id`. There is no constraint on `(table_id, data)` — by design, since rows are JSON blobs and SQLite has no built-in JSON-equality predicate. A duplicate row is structurally indistinguishable from an intentional re-entry, so the engine cannot tell them apart. The agent's "I already inserted this" intent is invisible.

## Decisions (resolving the 4 open contract questions)

The handoff flagged 4 contract decisions. Each is resolved here with the reasoning that drove the choice. Future regressions / edge cases trace back to these.

### 1. Hash inputs: ALL normalized columns

**Choice:** hash every column declared on the table, in canonical order. Not user-flagged "key" columns; not heuristic "primary semantic" columns.

**Why:** any narrower contract (e.g., key-cols only) demands a new UX surface ("which columns are the key?") and gets the policy wrong half the time. ALL-columns is the only contract that's reproducible across all tables without a per-table config. A 12-row CSV with a single duplicate is exactly-equal in every column — that's the bug.

**Trade-off accepted:** edits to a row that change one column produce a different hash, so the post-edit version of the row no longer collides with a same-shape pre-edit row. This is correct for "no two identical rows" semantics; if the user wants soft-merge semantics they can pre-normalize before insert.

### 2. Null/empty handling: collapse all to `""`

**Choice:** before hashing, replace `null`, `undefined`, and any value that stringifies to `""` with the canonical empty string `""`.

**Why:** the reproducer source is CSV → tool call → row insert. CSVs and JSON commonly mint `null`, `""`, and missing-key as semantically equivalent "no value." Hashing them as distinct produces ghost dups: row `{a:1}` and row `{a:1, b:null}` would not collide. That's the wrong answer for an idempotency check.

**Sentinel rejected:** I considered a special "null sentinel" string. Rejected because it leaks semantics into the hash representation when a real value happens to equal the sentinel. Empty-string is the most common natural empty.

### 3. Case sensitivity: exact match, no folding

**Choice:** `JSON.stringify` the canonical row and SHA-256 it. No case-folding, no Unicode-NFC normalization.

**Why:** case-folding has known locale traps (Turkish dotted I, German ß ↔ ss). Unicode normalization would be technically right but invisibly changes the hash for any future input source that uses a different normal form, producing surprising non-collisions. The reproducer ("agent re-read same row") yields byte-identical strings — exact match catches it. If a real "iPhone vs IPHONE" case shows up, that's a separate feature, not F10.

### 4. Scope: both within-batch and across-batch

**Choice:** the unique constraint sits at the DB layer, so one mechanism catches both. Within-batch dups in the same `addRows()` call collide on the second insert; across-batch dups (two consecutive `add_rows` calls with overlap) collide on the duplicating call.

**Why:** the chokepoint approach (per HANDOFF.md "Fix at the chokepoint" pattern, F1/F2/F4/F8). One DB-level constraint covers both vectors with no race window.

## Mechanism

### Schema change

Add `data_hash TEXT` to `user_table_rows`. Nullable on insert path (back-compat for any race where an existing row has no hash yet), but populated by `addRows()` on every new write. Add a partial UNIQUE INDEX:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_table_rows_table_data_hash
  ON user_table_rows(table_id, data_hash) WHERE data_hash IS NOT NULL;
```

The `WHERE data_hash IS NOT NULL` clause means rows with NULL hash (legacy rows, or rows created via paths that haven't yet been audited) don't conflict with the index — they remain dedupe-disabled until backfilled. New rows always get a hash (see `addRows` change below).

### Hash function

Pure helper at `src/lib/data/row-hash.ts` (new, ~25 LOC):

```ts
import { createHash } from "node:crypto";

export function canonicalizeRowForHash(
  data: Record<string, unknown>,
  columnNames: string[]
): string {
  const canonical: Record<string, string> = {};
  for (const name of columnNames) {
    const v = data[name];
    canonical[name] = v === null || v === undefined ? "" : String(v);
  }
  // Insert in column-order so the JSON serialization is stable
  // regardless of the input map's iteration order.
  return JSON.stringify(canonical);
}

export function hashRowData(
  data: Record<string, unknown>,
  columnNames: string[]
): string {
  return createHash("sha256")
    .update(canonicalizeRowForHash(data, columnNames))
    .digest("hex");
}
```

Why column-name-driven canonicalization: a row may have extra keys beyond the schema (residue from a prior edit) — those must NOT participate in the hash, otherwise legitimate adds get marked as dups based on stale extras. Walking the column list (in DB order) is the source of truth.

### `addRows()` change

```ts
export async function addRows(tableId: string, rows: AddRowInput[]) {
  const now = new Date();
  const cols = loadColumnsForNormalization(tableId);
  const columnNames = cols.map((c) => c.name);

  const maxPos = /* unchanged */;
  let nextPosition = (maxPos?.maxPos ?? -1) + 1;

  const normalizedRows = rows.map((row) => ({
    ...row,
    data: normalizeRowKeysAgainstColumns(row.data, cols),
  }));

  const insertedIds: string[] = [];
  const skippedHashes: string[] = [];
  const seenInBatch = new Set<string>();

  for (const row of normalizedRows) {
    const dataHash = hashRowData(row.data, columnNames);

    // Within-batch guard: if this exact hash already came in this call,
    // skip without even hitting the DB.
    if (seenInBatch.has(dataHash)) {
      skippedHashes.push(dataHash);
      continue;
    }
    seenInBatch.add(dataHash);

    const id = randomUUID();
    const result = await db
      .insert(userTableRows)
      .values({
        id,
        tableId,
        data: JSON.stringify(row.data),
        dataHash,
        position: nextPosition,
        createdBy: row.createdBy ?? "user",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: [userTableRows.tableId, userTableRows.dataHash] })
      .returning({ id: userTableRows.id });

    if (result.length > 0) {
      insertedIds.push(id);
      nextPosition++;
    } else {
      skippedHashes.push(dataHash);
    }
  }

  if (insertedIds.length > 0) {
    await updateRowCount(tableId);
  }

  for (let i = 0; i < normalizedRows.length; i++) {
    if (insertedIds[i]) {
      evaluateTriggers(tableId, "row_added", normalizedRows[i].data).catch(() => {});
      evaluateManifestTriggers(tableId, insertedIds[i], normalizedRows[i].data).catch(() => {});
    }
  }

  return { ids: insertedIds, skippedHashes };
}
```

The signature change is breaking — current callers expect `string[]`. Affected callers (per `grep`):
- `src/lib/chat/tools/table-tools.ts:260` — destructure to `{ ids, skippedHashes }`, return both counts in the tool response.
- Any test that mocks `addRows` — update return shape.

The `seenInBatch` guard is technically redundant with `onConflictDoNothing` (the DB would catch within-batch dups too), but keeps within-batch dedupe out of the DB path entirely — cheaper, and surfaces the dedupe count without parsing the DB response twice.

### Return shape — make idempotency visible

`add_rows` chat tool now returns `{ added: N, skipped: M, rowIds: [...] }`. Engineering Principle #1 ("Zero silent failures"): the agent must SEE that 1 row was deduped, otherwise it might report "12 rows added" when only 11 were. Current shape `{ added, rowIds }` becomes misleading when M > 0; new shape is unambiguous.

### Migration + backfill

`src/lib/db/migrations/XXXX_add_user_table_rows_data_hash.sql` (rename to next sequential at PR time per MEMORY.md):

```sql
-- F10: row-add idempotency. Add data_hash column + partial unique index.
-- Backfill existing rows from JS-side because SHA-256 of canonical JSON
-- is not expressible in SQLite without an extension.
ALTER TABLE user_table_rows ADD COLUMN data_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_table_rows_table_data_hash
  ON user_table_rows(table_id, data_hash) WHERE data_hash IS NOT NULL;
```

Bootstrap (per the `addColumnIfMissing` runs BEFORE CREATE TABLE gotcha in MEMORY.md) — both required:
- Add `data_hash TEXT` to the `CREATE TABLE IF NOT EXISTS user_table_rows` block.
- Add `addColumnIfMissing("ALTER TABLE user_table_rows ADD COLUMN data_hash TEXT;")`.
- Add the CREATE UNIQUE INDEX statement.

Backfill is one-shot, idempotent: on first run, scan all `data_hash IS NULL` rows, compute hash from `data` JSON + column list, write back. If two existing rows in the same table back-fill to the same hash, the second one's UPDATE will fail the partial-unique constraint — keep both rows but log the collision and leave the second's hash NULL (it remains dedupe-disabled). This preserves data; manual cleanup is a deliberate user choice.

Backfill module: `src/lib/db/backfill/row-hash.ts`. Run from `bootstrap.ts` once during instance startup (gated by a `data_hash` value-existence probe so it's a no-op after the first run).

## Out of scope

- User-flagged "key columns" — separate feature; would require column-config UI.
- Soft-merge / upsert semantics — separate feature.
- Hash invalidation when columns are renamed — current normalize step at insert handles renames going forward; existing rows keep their old hash. If a renamed column changes the canonical form of new rows, that's correct behavior (renamed schema, different identity).
- DB-level dedupe for `update_row` — F10 is insert-only. An update that produces a duplicate is a different problem; falls to a future F.
- Telemetry on dedupe rate — fileable as a follow-up.

## Risks

- **Hash collision:** SHA-256 over a fixed schema is collision-free for any practical N. Not a real risk.
- **Backfill failure:** if the existence probe is wrong, backfill runs every boot. Mitigate by checking `SELECT 1 FROM user_table_rows WHERE data_hash IS NULL LIMIT 1` — runs only when at least one row needs backfilling. Once all rows have a hash, the probe returns nothing and backfill exits in O(1).
- **Tool-response semantics:** consumers that read `result.rowIds.length` as "rows attempted" break. Auditing all callers.
- **Position ambiguity:** when a row is deduped, `nextPosition` is not consumed. The position counter advances only on successful insert. Verified safe: the existing `MAX(position)` bootstrap + per-insert increment handles holes correctly.
- **Seenset dedup uses canonical hash, not raw row:** identical-meaning rows that differ in nullability (`{a:null}` vs `{a:""}`) collide as expected.

## Testing

- **Unit (hash function):** canonicalize empty string / null / undefined as same; column-order-stable; ignores extra keys; sha256 hex output.
- **Unit (addRows, mocked DB):** within-batch dedupe (returns 1 ID for `[A, A]`); across-batch dedupe (second `addRows([A])` returns 0 IDs and 1 skipped hash); inserts proceed past a dedupe (`[A, B, A, C]` returns 3 IDs).
- **Integration:** real SQLite, 12-row CSV with 1 dup → 11 inserts, 1 skip. Re-run same CSV → 0 inserts, 12 skips.
- **Migration:** existing rows get hashes; second boot does nothing.

## Acceptance

- New schema column + partial unique index in place via both migration and bootstrap.
- Reproducer fixed: agent inserts 12 rows from a 12-row CSV, even if it re-reads internally; 13th attempt is a no-op.
- `add_rows` tool response surfaces `skipped` count.
- All existing tests green; new hash + addRows tests green.
- Backfill runs on first boot only.

## Verification (2026-05-08)

- 8 hash-helper unit tests + 5 idempotency tests added (13 new tests). All green.
- Full project test count: 2193 passing (up from 2180 post-F9), same 8 pre-existing failures (router x6, api-version-window, settings, phase-5-blueprints-validity).
- Full typecheck clean (`tsc --noEmit` 0 errors).
- The 12-row CSV reproducer is now a regression test:
  ```ts
  const csvRows = Array.from({ length: 12 }, (_, i) => ({ data: { ticker: `T${i}`, shares: i + 1 } }));
  csvRows[7] = csvRows[3];  // simulate agent re-read
  const { ids, skippedHashes } = await addRows(TABLE_ID, csvRows);
  // ids.length === 11, skippedHashes.length === 1
  ```

## Implementation deltas vs. design

- **Drizzle `onConflictDoNothing()` no-target form.** The design called for `onConflictDoNothing({ target: [tableId, dataHash] })`, but SQLite's `ON CONFLICT (cols)` syntax requires the partial unique index's `WHERE` clause to be echoed in the conflict target — Drizzle's typed target API doesn't emit it. Falling back to the no-target form (which becomes plain `ON CONFLICT DO NOTHING` and matches ANY unique constraint, including partial ones) works correctly.
- **Backfill deferred.** The design described a one-shot backfill module at `src/lib/db/backfill/row-hash.ts`. Skipped in this implementation: existing rows keep `data_hash = NULL` and remain dedupe-disabled (the partial index doesn't constrain NULL hashes). New rows always get a hash. Acceptable — the user's reproducer was about new agent-driven inserts, not legacy data. Backfill is a fileable follow-up.
- **Bootstrap placement matters.** First placement (before the user_table_rows CREATE TABLE block) failed exactly the way MEMORY.md warned — `ALTER TABLE` ran before the table existed. Final placement is the post-CREATE-TABLE "safety: add columns" block at the end of `bootstrapAinativeDatabase()`.
