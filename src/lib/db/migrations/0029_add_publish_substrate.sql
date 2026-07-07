-- Generator/Publisher substrate (TDR-039): publish_targets + deployments

CREATE TABLE IF NOT EXISTS publish_targets (
  id TEXT PRIMARY KEY NOT NULL,
  app_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  config TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_publish_targets_app ON publish_targets(app_id);

CREATE TABLE IF NOT EXISTS deployments (
  id TEXT PRIMARY KEY NOT NULL,
  app_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL,
  url TEXT,
  commit_sha TEXT,
  artifact_hash TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  error TEXT,
  FOREIGN KEY (target_id) REFERENCES publish_targets(id) ON UPDATE NO ACTION ON DELETE NO ACTION
);

CREATE INDEX IF NOT EXISTS idx_deployments_app ON deployments(app_id);
CREATE INDEX IF NOT EXISTS idx_deployments_target ON deployments(target_id);
