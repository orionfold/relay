CREATE TABLE IF NOT EXISTS usage_budget_policies (
  id TEXT PRIMARY KEY NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  app_id TEXT,
  schedule_id TEXT,
  source_recommendation_id TEXT,
  enabled INTEGER DEFAULT 1 NOT NULL,
  on_exceed TEXT DEFAULT 'pause' NOT NULL,
  max_cost_per_run_micros INTEGER,
  max_cost_per_day_micros INTEGER,
  max_cost_per_month_micros INTEGER,
  notification_state TEXT DEFAULT '{}' NOT NULL,
  last_breach_kind TEXT,
  last_breach_message TEXT,
  last_breach_at INTEGER,
  active_run_id TEXT,
  active_schedule_id TEXT,
  claim_started_at INTEGER,
  claim_expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_budget_policies_scope
  ON usage_budget_policies(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_usage_budget_policies_app_id
  ON usage_budget_policies(app_id);
CREATE INDEX IF NOT EXISTS idx_usage_budget_policies_schedule_id
  ON usage_budget_policies(schedule_id);
CREATE INDEX IF NOT EXISTS idx_usage_budget_policies_claim_expiry
  ON usage_budget_policies(claim_expires_at);
