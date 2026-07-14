ALTER TABLE schedules ADD COLUMN success_criteria TEXT;
ALTER TABLE workflows ADD COLUMN success_criteria TEXT;
ALTER TABLE workflows ADD COLUMN success_criteria_run_snapshot TEXT;
ALTER TABLE tasks ADD COLUMN success_criteria_snapshot TEXT;

CREATE TABLE IF NOT EXISTS operations_receipts (
  id TEXT PRIMARY KEY NOT NULL,
  source_key TEXT NOT NULL,
  owner_type TEXT NOT NULL,
  schedule_id TEXT,
  workflow_id TEXT,
  task_id TEXT,
  workflow_run_number INTEGER,
  verdict TEXT NOT NULL,
  criteria_snapshot TEXT NOT NULL,
  evidence TEXT NOT NULL,
  summary TEXT NOT NULL,
  next_action TEXT NOT NULL,
  started_at INTEGER,
  finished_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON UPDATE NO ACTION ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_operations_receipts_source_key
  ON operations_receipts(source_key);
CREATE INDEX IF NOT EXISTS idx_operations_receipts_schedule_finished
  ON operations_receipts(schedule_id, finished_at);
CREATE INDEX IF NOT EXISTS idx_operations_receipts_workflow_finished
  ON operations_receipts(workflow_id, finished_at);

CREATE TABLE IF NOT EXISTS workflow_receipt_runs (
  id TEXT PRIMARY KEY NOT NULL,
  workflow_id TEXT NOT NULL,
  run_number INTEGER NOT NULL,
  criteria_snapshot TEXT NOT NULL,
  terminal_status TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_receipt_runs_owner_run
  ON workflow_receipt_runs(workflow_id, run_number);
