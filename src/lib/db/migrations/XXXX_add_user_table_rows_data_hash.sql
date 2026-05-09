-- F10: row-add idempotency. Add data_hash column + partial unique index.
-- Backfill of existing rows happens in JS-side bootstrap because SHA-256
-- of canonical JSON is not expressible in pure SQLite.
--
-- The index is PARTIAL (WHERE data_hash IS NOT NULL) so legacy rows
-- without a hash don't conflict. New rows always populate data_hash via
-- addRows() in src/lib/data/tables.ts.
--
-- Renumber to next sequential 0028_ at PR time per MEMORY.md
-- "db-migration-sequencing" guidance.

ALTER TABLE user_table_rows ADD COLUMN data_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_table_rows_table_data_hash
  ON user_table_rows(table_id, data_hash) WHERE data_hash IS NOT NULL;
