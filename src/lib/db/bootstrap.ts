import type Database from "better-sqlite3";
import { readMigrationFiles } from "drizzle-orm/migrator";

const LEGACY_DATA_TABLES = [
  "customers",
  "projects",
  "tasks",
  "workflows",
  "agent_logs",
  "notifications",
  "settings",
  "documents",
  "schedules",
  "usage_ledger",
  "learned_context",
  "views",
  "environment_scans",
  "environment_artifacts",
  "environment_checkpoints",
  "environment_sync_ops",
  "environment_templates",
  "conversations",
  "chat_messages",
  "profile_test_results",
  "repo_imports",
  "agent_memory",
  "channel_configs",
  "channel_bindings",
  "agent_messages",
  "workflow_document_inputs",
  "schedule_document_inputs",
  "project_document_defaults",
  "user_tables",
  "user_table_columns",
  "user_table_rows",
  "user_table_views",
  "user_table_relationships",
  "user_table_templates",
  "user_table_imports",
  "table_document_inputs",
  "task_table_inputs",
  "workflow_table_inputs",
  "schedule_table_inputs",
  "user_table_triggers",
  "user_table_row_history",
  "snapshots",
  "workflow_execution_stats",
  "schedule_firing_metrics",
  "publish_targets",
  "deployments",
] as const;

export function bootstrapAinativeDatabase(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      status TEXT DEFAULT 'active' NOT NULL,
      industry TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_slug ON customers(slug);
    CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'active' NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT,
      workflow_id TEXT,
      schedule_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'planned' NOT NULL,
      assigned_agent TEXT,
      agent_profile TEXT,
      effective_runtime_id TEXT,
      effective_model_id TEXT,
      runtime_fallback_reason TEXT,
      context_row_id TEXT,
      priority INTEGER DEFAULT 2 NOT NULL,
      result TEXT,
      session_id TEXT,
      resume_count INTEGER DEFAULT 0 NOT NULL,
      workflow_run_number INTEGER,
      max_budget_usd REAL,
      turn_count INTEGER,
      token_count INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT,
      name TEXT NOT NULL,
      definition TEXT NOT NULL,
      status TEXT DEFAULT 'draft' NOT NULL,
      run_number INTEGER DEFAULT 0 NOT NULL,
      runtime_id TEXT,
      resume_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE TABLE IF NOT EXISTS agent_logs (
      id TEXT PRIMARY KEY NOT NULL,
      task_id TEXT,
      agent_type TEXT NOT NULL,
      event TEXT NOT NULL,
      payload TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY NOT NULL,
      task_id TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      read INTEGER DEFAULT 0 NOT NULL,
      tool_name TEXT,
      tool_input TEXT,
      response TEXT,
      responded_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_agent_logs_task_id ON agent_logs(task_id);
    CREATE INDEX IF NOT EXISTS idx_agent_logs_timestamp ON agent_logs(timestamp);

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY NOT NULL,
      task_id TEXT,
      project_id TEXT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      version INTEGER DEFAULT 1 NOT NULL,
      direction TEXT DEFAULT 'input' NOT NULL,
      category TEXT,
      status TEXT DEFAULT 'uploaded' NOT NULL,
      extracted_text TEXT,
      processed_path TEXT,
      processing_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      assigned_agent TEXT,
      agent_profile TEXT,
      recurs INTEGER DEFAULT 1 NOT NULL,
      status TEXT DEFAULT 'active' NOT NULL,
      max_firings INTEGER,
      firing_count INTEGER DEFAULT 0 NOT NULL,
      expires_at INTEGER,
      last_fired_at INTEGER,
      next_fire_at INTEGER,
      type TEXT DEFAULT 'scheduled' NOT NULL,
      heartbeat_checklist TEXT,
      active_hours_start INTEGER,
      active_hours_end INTEGER,
      active_timezone TEXT DEFAULT 'UTC',
      suppression_count INTEGER DEFAULT 0 NOT NULL,
      last_action_at INTEGER,
      heartbeat_budget_per_day INTEGER,
      heartbeat_spent_today INTEGER DEFAULT 0 NOT NULL,
      heartbeat_budget_reset_at INTEGER,
      avg_turns_per_firing INTEGER,
      last_turn_count INTEGER,
      failure_streak INTEGER DEFAULT 0 NOT NULL,
      last_failure_reason TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_schedules_status ON schedules(status);
    CREATE INDEX IF NOT EXISTS idx_schedules_next_fire_at ON schedules(next_fire_at);
    CREATE INDEX IF NOT EXISTS idx_schedules_project_id ON schedules(project_id);

    -- schedule_firing_metrics is placed here (between schedules indexes and
    -- notifications indexes) to satisfy its foreign-key dependency on schedules.
    -- Future tables with FK dependencies should follow the same "place after
    -- parent table" discipline rather than batching all CREATE TABLE at the top.
    CREATE TABLE IF NOT EXISTS schedule_firing_metrics (
      id TEXT PRIMARY KEY NOT NULL,
      schedule_id TEXT NOT NULL,
      task_id TEXT,
      fired_at INTEGER NOT NULL,
      slot_claimed_at INTEGER,
      completed_at INTEGER,
      slot_wait_ms INTEGER,
      duration_ms INTEGER,
      turn_count INTEGER,
      max_turns_at_firing INTEGER,
      event_loop_lag_ms REAL,
      peak_rss_mb INTEGER,
      chat_streams_active INTEGER,
      concurrent_schedules INTEGER,
      failure_reason TEXT,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_sfm_schedule_time ON schedule_firing_metrics(schedule_id, fired_at);

    CREATE INDEX IF NOT EXISTS idx_notifications_task_id ON notifications(task_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
    CREATE INDEX IF NOT EXISTS idx_documents_task_id ON documents(task_id);
    CREATE INDEX IF NOT EXISTS idx_documents_project_id ON documents(project_id);

    CREATE TABLE IF NOT EXISTS usage_ledger (
      id TEXT PRIMARY KEY NOT NULL,
      task_id TEXT,
      workflow_id TEXT,
      schedule_id TEXT,
      project_id TEXT,
      activity_type TEXT NOT NULL,
      runtime_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      model_id TEXT,
      status TEXT NOT NULL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      total_tokens INTEGER,
      cost_micros INTEGER,
      pricing_version TEXT,
      started_at INTEGER NOT NULL,
      finished_at INTEGER NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_usage_ledger_task_id ON usage_ledger(task_id);
    CREATE INDEX IF NOT EXISTS idx_usage_ledger_activity_type ON usage_ledger(activity_type);
    CREATE INDEX IF NOT EXISTS idx_usage_ledger_runtime_id ON usage_ledger(runtime_id);
    CREATE INDEX IF NOT EXISTS idx_usage_ledger_provider_model ON usage_ledger(provider_id, model_id);
    CREATE INDEX IF NOT EXISTS idx_usage_ledger_finished_at ON usage_ledger(finished_at);

    CREATE TABLE IF NOT EXISTS learned_context (
      id TEXT PRIMARY KEY NOT NULL,
      profile_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      content TEXT,
      diff TEXT,
      change_type TEXT NOT NULL,
      source_task_id TEXT,
      proposal_notification_id TEXT,
      proposed_additions TEXT,
      approved_by TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (source_task_id) REFERENCES tasks(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_learned_context_profile_version ON learned_context(profile_id, version);
    CREATE INDEX IF NOT EXISTS idx_learned_context_change_type ON learned_context(change_type);

    CREATE TABLE IF NOT EXISTS views (
      id TEXT PRIMARY KEY NOT NULL,
      surface TEXT NOT NULL,
      name TEXT NOT NULL,
      filters TEXT,
      sorting TEXT,
      columns TEXT,
      density TEXT DEFAULT 'comfortable',
      is_default INTEGER DEFAULT 0 NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_views_surface ON views(surface);
    CREATE INDEX IF NOT EXISTS idx_views_surface_default ON views(surface, is_default);

  `);

  const addColumnIfMissing = (ddl: string) => {
    try {
      sqlite.exec(ddl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Two expected outcomes, both fine: "duplicate column" (the column is
      // already there) and "no such table" (fresh DB — some ALTERs run before
      // their CREATE, which includes the column; see the branching-columns
      // comment below). Anything else is a real failure and must stay loud.
      if (!msg.includes("duplicate column") && !msg.includes("no such table")) {
        console.error("[bootstrap] ALTER TABLE failed:", msg);
      }
    }
  };

  addColumnIfMissing(`ALTER TABLE tasks ADD COLUMN agent_profile TEXT;`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_agent_profile ON tasks(agent_profile);`);
  addColumnIfMissing(`ALTER TABLE tasks ADD COLUMN effective_runtime_id TEXT;`);
  addColumnIfMissing(`ALTER TABLE tasks ADD COLUMN effective_model_id TEXT;`);
  addColumnIfMissing(`ALTER TABLE tasks ADD COLUMN runtime_fallback_reason TEXT;`);

  addColumnIfMissing(`ALTER TABLE tasks ADD COLUMN workflow_id TEXT REFERENCES workflows(id);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_workflow_id ON tasks(workflow_id);`);

  addColumnIfMissing(`ALTER TABLE tasks ADD COLUMN schedule_id TEXT REFERENCES schedules(id);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_schedule_id ON tasks(schedule_id);`);

  addColumnIfMissing(`ALTER TABLE projects ADD COLUMN working_directory TEXT;`);
  addColumnIfMissing(`ALTER TABLE schedules ADD COLUMN assigned_agent TEXT;`);

  // Customer dimension: nullable FK on projects + usage_ledger (zero-regression for
  // existing rows). The customers table is created in the exec block above, so these
  // ALTERs resolve their REFERENCES target. See _SPECS/customer-dimension.md.
  addColumnIfMissing(`ALTER TABLE projects ADD COLUMN customer_id TEXT REFERENCES customers(id);`);
  addColumnIfMissing(`ALTER TABLE usage_ledger ADD COLUMN customer_id TEXT REFERENCES customers(id);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_usage_ledger_customer_id ON usage_ledger(customer_id);`);

  // Heartbeat scheduler columns
  addColumnIfMissing(`ALTER TABLE schedules ADD COLUMN type TEXT DEFAULT 'scheduled' NOT NULL;`);
  addColumnIfMissing(`ALTER TABLE schedules ADD COLUMN heartbeat_checklist TEXT;`);
  addColumnIfMissing(`ALTER TABLE schedules ADD COLUMN active_hours_start INTEGER;`);
  addColumnIfMissing(`ALTER TABLE schedules ADD COLUMN active_hours_end INTEGER;`);
  addColumnIfMissing(`ALTER TABLE schedules ADD COLUMN active_timezone TEXT DEFAULT 'UTC';`);
  addColumnIfMissing(`ALTER TABLE schedules ADD COLUMN suppression_count INTEGER DEFAULT 0 NOT NULL;`);
  addColumnIfMissing(`ALTER TABLE schedules ADD COLUMN last_action_at INTEGER;`);
  addColumnIfMissing(`ALTER TABLE schedules ADD COLUMN heartbeat_budget_per_day INTEGER;`);
  addColumnIfMissing(`ALTER TABLE schedules ADD COLUMN heartbeat_spent_today INTEGER DEFAULT 0 NOT NULL;`);
  addColumnIfMissing(`ALTER TABLE schedules ADD COLUMN heartbeat_budget_reset_at INTEGER;`);

  // Task source type
  addColumnIfMissing(`ALTER TABLE tasks ADD COLUMN source_type TEXT;`);
  addColumnIfMissing(`ALTER TABLE workflows ADD COLUMN run_number INTEGER DEFAULT 0 NOT NULL;`);
  addColumnIfMissing(`ALTER TABLE tasks ADD COLUMN workflow_run_number INTEGER;`);
  addColumnIfMissing(`ALTER TABLE documents ADD COLUMN version INTEGER NOT NULL DEFAULT 1;`);
  addColumnIfMissing(`ALTER TABLE documents ADD COLUMN source TEXT DEFAULT 'upload';`);
  addColumnIfMissing(`ALTER TABLE documents ADD COLUMN conversation_id TEXT REFERENCES conversations(id);`);
  addColumnIfMissing(`ALTER TABLE documents ADD COLUMN message_id TEXT;`);
  // chat-ollama-native-skills: conversation-scoped active skill binding.
  // Ollama can't use the SDK's native skill support, so we inject the
  // selected skill's SKILL.md into Tier 0 of the system prompt on every
  // turn while this column is set. Same machinery is usable from Claude
  // and Codex as a programmatic skill-activation path.
  addColumnIfMissing(`ALTER TABLE conversations ADD COLUMN active_skill_id TEXT;`);
  // chat-skill-composition v1: array of additionally-activated skill IDs
  // beyond the legacy active_skill_id. Default empty JSON array.
  addColumnIfMissing(`ALTER TABLE conversations ADD COLUMN active_skill_ids TEXT DEFAULT '[]';`);
  // chat-conversation-branches v1: parent + branchedFrom pointers for forward-only
  // branching, plus rewound_at on chat_messages for ⌘Z/⌘⇧Z. All nullable; root
  // (linear) conversations leave them NULL and behave identically to today. The
  // matching index on parent_conversation_id is created inline in the CREATE
  // TABLE block below — adding it here would run before the table exists on
  // fresh DBs (addColumnIfMissing precedes the conversations CREATE TABLE).
  addColumnIfMissing(`ALTER TABLE conversations ADD COLUMN parent_conversation_id TEXT;`);
  addColumnIfMissing(`ALTER TABLE conversations ADD COLUMN branched_from_message_id TEXT;`);
  addColumnIfMissing(`ALTER TABLE chat_messages ADD COLUMN rewound_at INTEGER;`);
  // Workflow step delays — resume_at for schedule-based delay resumption.
  // The partial index on resume_at is created by migration 0024 for fresh DBs;
  // existing DBs that don't run migrations will do a small table scan instead.
  addColumnIfMissing(`ALTER TABLE workflows ADD COLUMN resume_at INTEGER;`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_documents_conversation_id ON documents(conversation_id);`);

  // ── Environment onboarding tables ──────────────────────────────────────
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS environment_scans (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT,
      scan_path TEXT NOT NULL,
      persona TEXT NOT NULL,
      scan_status TEXT DEFAULT 'running' NOT NULL,
      artifact_count INTEGER DEFAULT 0 NOT NULL,
      duration_ms INTEGER,
      errors TEXT,
      scanned_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_env_scans_project_id ON environment_scans(project_id);
    CREATE INDEX IF NOT EXISTS idx_env_scans_scanned_at ON environment_scans(scanned_at);

    CREATE TABLE IF NOT EXISTS environment_artifacts (
      id TEXT PRIMARY KEY NOT NULL,
      scan_id TEXT NOT NULL,
      tool TEXT NOT NULL,
      category TEXT NOT NULL,
      scope TEXT NOT NULL,
      name TEXT NOT NULL,
      rel_path TEXT NOT NULL,
      abs_path TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      preview TEXT,
      metadata TEXT,
      size_bytes INTEGER DEFAULT 0 NOT NULL,
      modified_at INTEGER NOT NULL,
      linked_profile_id TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (scan_id) REFERENCES environment_scans(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_env_artifacts_scan_id ON environment_artifacts(scan_id);
    CREATE INDEX IF NOT EXISTS idx_env_artifacts_category ON environment_artifacts(category);
    CREATE INDEX IF NOT EXISTS idx_env_artifacts_tool ON environment_artifacts(tool);
    CREATE INDEX IF NOT EXISTS idx_env_artifacts_scan_tool ON environment_artifacts(scan_id, tool);
    CREATE INDEX IF NOT EXISTS idx_env_artifacts_scan_category ON environment_artifacts(scan_id, category);

    CREATE TABLE IF NOT EXISTS environment_checkpoints (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT,
      label TEXT NOT NULL,
      checkpoint_type TEXT NOT NULL,
      git_tag TEXT,
      git_commit_sha TEXT,
      backup_path TEXT,
      files_count INTEGER DEFAULT 0 NOT NULL,
      status TEXT DEFAULT 'active' NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_env_checkpoints_project_status ON environment_checkpoints(project_id, status);

    CREATE TABLE IF NOT EXISTS environment_sync_ops (
      id TEXT PRIMARY KEY NOT NULL,
      checkpoint_id TEXT NOT NULL,
      artifact_id TEXT,
      operation TEXT NOT NULL,
      target_tool TEXT NOT NULL,
      target_path TEXT NOT NULL,
      diff_preview TEXT,
      status TEXT DEFAULT 'pending' NOT NULL,
      error TEXT,
      applied_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (checkpoint_id) REFERENCES environment_checkpoints(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
      FOREIGN KEY (artifact_id) REFERENCES environment_artifacts(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_env_sync_ops_checkpoint_id ON environment_sync_ops(checkpoint_id);

    CREATE TABLE IF NOT EXISTS environment_templates (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      manifest TEXT NOT NULL,
      scope TEXT DEFAULT 'user' NOT NULL,
      artifact_count INTEGER DEFAULT 0 NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_env_templates_scope ON environment_templates(scope);
  `);

  addColumnIfMissing(`ALTER TABLE environment_artifacts ADD COLUMN linked_profile_id TEXT;`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_env_artifacts_linked_profile ON environment_artifacts(linked_profile_id);`);

  // ── Chat conversation tables ────────────────────────────────────────────
  // Drop legacy conversations/messages tables (incompatible schema from earlier attempt)
  const legacyConv = sqlite.prepare(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='conversations'`
  ).get() as { sql: string } | undefined;
  if (legacyConv && !legacyConv.sql.includes("runtime_id")) {
    sqlite.exec(`DROP TABLE IF EXISTS messages`);
    sqlite.exec(`DROP TABLE IF EXISTS conversations`);
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT,
      title TEXT,
      runtime_id TEXT NOT NULL,
      model_id TEXT,
      status TEXT DEFAULT 'active' NOT NULL,
      session_id TEXT,
      context_scope TEXT,
      active_skill_id TEXT,
      active_skill_ids TEXT DEFAULT '[]',
      parent_conversation_id TEXT,
      branched_from_message_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_project_id ON conversations(project_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
    CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at);
    CREATE INDEX IF NOT EXISTS idx_conversations_parent_id ON conversations(parent_conversation_id);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      status TEXT DEFAULT 'complete' NOT NULL,
      rewound_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON chat_messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created ON chat_messages(conversation_id, created_at);
  `);

  // ── Repo imports (skills repo import tracking) ─────────────────────
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS repo_imports (
      id TEXT PRIMARY KEY NOT NULL,
      repo_url TEXT NOT NULL,
      repo_owner TEXT NOT NULL,
      repo_name TEXT NOT NULL,
      branch TEXT NOT NULL,
      commit_sha TEXT NOT NULL,
      profile_ids TEXT NOT NULL,
      skill_count INTEGER NOT NULL,
      last_checked_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_repo_imports_repo_url ON repo_imports(repo_url);
    CREATE INDEX IF NOT EXISTS idx_repo_imports_owner_name ON repo_imports(repo_owner, repo_name);
  `);

  // ── Agent episodic memory ────────────────────────────────────────────
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agent_memory (
      id TEXT PRIMARY KEY NOT NULL,
      profile_id TEXT NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      confidence INTEGER DEFAULT 700 NOT NULL,
      source_task_id TEXT,
      tags TEXT,
      last_accessed_at INTEGER,
      access_count INTEGER DEFAULT 0 NOT NULL,
      decay_rate INTEGER DEFAULT 10 NOT NULL,
      status TEXT DEFAULT 'active' NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (source_task_id) REFERENCES tasks(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_agent_memory_profile_status ON agent_memory(profile_id, status);
    CREATE INDEX IF NOT EXISTS idx_agent_memory_confidence ON agent_memory(confidence);
  `);

  // ── Profile test results ────────────────────────────────────────────
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS profile_test_results (
      id TEXT PRIMARY KEY NOT NULL,
      profile_id TEXT NOT NULL,
      runtime_id TEXT NOT NULL,
      report_json TEXT NOT NULL,
      total_passed INTEGER DEFAULT 0 NOT NULL,
      total_failed INTEGER DEFAULT 0 NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_profile_test_results_profile_runtime ON profile_test_results(profile_id, runtime_id);
  `);

  // ── Multi-Channel Delivery ────────────────────────────────────────────
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS channel_configs (
      id TEXT PRIMARY KEY NOT NULL,
      channel_type TEXT NOT NULL,
      name TEXT NOT NULL,
      config TEXT NOT NULL,
      status TEXT DEFAULT 'active' NOT NULL,
      test_status TEXT DEFAULT 'untested' NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_channel_configs_type ON channel_configs(channel_type);
  `);

  addColumnIfMissing(`ALTER TABLE schedules ADD COLUMN delivery_channels TEXT;`);
  // Schedule health-monitoring columns (collision-prevention feature).
  // Nullable so existing rows backfill cleanly; failure_streak defaults to 0
  // so the auto-pause logic treats existing schedules as "no failures yet".
  addColumnIfMissing(`ALTER TABLE schedules ADD COLUMN avg_turns_per_firing INTEGER;`);
  addColumnIfMissing(`ALTER TABLE schedules ADD COLUMN last_turn_count INTEGER;`);
  addColumnIfMissing(`ALTER TABLE schedules ADD COLUMN failure_streak INTEGER DEFAULT 0 NOT NULL;`);
  addColumnIfMissing(`ALTER TABLE schedules ADD COLUMN last_failure_reason TEXT;`);
  addColumnIfMissing(`ALTER TABLE channel_configs ADD COLUMN direction TEXT DEFAULT 'outbound' NOT NULL;`);

  // ── Schedule Orchestration columns ───────────────────────────────────────
  addColumnIfMissing(`ALTER TABLE tasks ADD COLUMN slot_claimed_at INTEGER;`);
  addColumnIfMissing(`ALTER TABLE tasks ADD COLUMN lease_expires_at INTEGER;`);
  addColumnIfMissing(`ALTER TABLE tasks ADD COLUMN failure_reason TEXT;`);
  addColumnIfMissing(`ALTER TABLE tasks ADD COLUMN max_turns INTEGER;`);
  // Per-task observability — see features/task-turn-observability.md
  addColumnIfMissing(`ALTER TABLE tasks ADD COLUMN turn_count INTEGER;`);
  addColumnIfMissing(`ALTER TABLE tasks ADD COLUMN token_count INTEGER;`);
  // Phase 4: link row-triggered tasks back to their originating user_table_rows row
  addColumnIfMissing(`ALTER TABLE tasks ADD COLUMN context_row_id TEXT;`);
  addColumnIfMissing(`ALTER TABLE schedules ADD COLUMN max_turns INTEGER;`);
  addColumnIfMissing(`ALTER TABLE schedules ADD COLUMN max_turns_set_at INTEGER;`);
  addColumnIfMissing(`ALTER TABLE schedules ADD COLUMN max_run_duration_sec INTEGER;`);
  addColumnIfMissing(`ALTER TABLE schedules ADD COLUMN turn_budget_breach_streak INTEGER DEFAULT 0 NOT NULL;`);
  // Create the composite index for lease-reaper queries (idempotent)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_running_scheduled ON tasks(status, source_type, lease_expires_at);`);

  // ── Bidirectional Channel Chat ──────────────────────────────────────────
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS channel_bindings (
      id TEXT PRIMARY KEY NOT NULL,
      channel_config_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      external_thread_id TEXT,
      runtime_id TEXT NOT NULL,
      model_id TEXT,
      profile_id TEXT,
      status TEXT DEFAULT 'active' NOT NULL,
      pending_request_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (channel_config_id) REFERENCES channel_configs(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_channel_bindings_config ON channel_bindings(channel_config_id);
    CREATE INDEX IF NOT EXISTS idx_channel_bindings_conversation ON channel_bindings(conversation_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_bindings_config_thread ON channel_bindings(channel_config_id, external_thread_id);
  `);

  // ── Generator/Publisher Substrate (TDR-039) ─────────────────────────
  sqlite.exec(`
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
      final_url TEXT,
      commit_sha TEXT,
      artifact_hash TEXT,
      generator_config TEXT,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      error TEXT,
      FOREIGN KEY (target_id) REFERENCES publish_targets(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_deployments_app ON deployments(app_id);
    CREATE INDEX IF NOT EXISTS idx_deployments_target ON deployments(target_id);
  `);
  addColumnIfMissing(`ALTER TABLE deployments ADD COLUMN final_url TEXT;`);
  addColumnIfMissing(`ALTER TABLE deployments ADD COLUMN generator_config TEXT;`);

  // ── Agent Async Handoffs ──────────────────────────────────────────────
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agent_messages (
      id TEXT PRIMARY KEY NOT NULL,
      from_profile_id TEXT NOT NULL,
      to_profile_id TEXT NOT NULL,
      task_id TEXT,
      target_task_id TEXT,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      attachments TEXT,
      priority INTEGER DEFAULT 2 NOT NULL,
      status TEXT DEFAULT 'pending' NOT NULL,
      requires_approval INTEGER DEFAULT 0 NOT NULL,
      approved_by TEXT,
      parent_message_id TEXT,
      chain_depth INTEGER DEFAULT 0 NOT NULL,
      created_at INTEGER NOT NULL,
      responded_at INTEGER,
      expires_at INTEGER,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
      FOREIGN KEY (target_task_id) REFERENCES tasks(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_agent_messages_to_status ON agent_messages(to_profile_id, status);
    CREATE INDEX IF NOT EXISTS idx_agent_messages_task ON agent_messages(task_id);
  `);

  // ── Workflow Document Pool ──────────────────────────────────────────
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS workflow_document_inputs (
      id TEXT PRIMARY KEY NOT NULL,
      workflow_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      step_id TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_wdi_workflow ON workflow_document_inputs(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_wdi_document ON workflow_document_inputs(document_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wdi_workflow_doc_step ON workflow_document_inputs(workflow_id, document_id, step_id);

    CREATE TABLE IF NOT EXISTS schedule_document_inputs (
      id TEXT PRIMARY KEY NOT NULL,
      schedule_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_sdi_schedule ON schedule_document_inputs(schedule_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sdi_schedule_doc ON schedule_document_inputs(schedule_id, document_id);

    CREATE TABLE IF NOT EXISTS project_document_defaults (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_pdd_project ON project_document_defaults(project_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pdd_project_doc ON project_document_defaults(project_id, document_id);
  `);

  // ── User-Defined Tables (structured data) ──────────────────────────────
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS user_tables (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      column_schema TEXT NOT NULL DEFAULT '[]',
      row_count INTEGER DEFAULT 0 NOT NULL,
      source TEXT DEFAULT 'manual' NOT NULL,
      template_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_user_tables_project_id ON user_tables(project_id);
    CREATE INDEX IF NOT EXISTS idx_user_tables_source ON user_tables(source);

    CREATE TABLE IF NOT EXISTS user_table_columns (
      id TEXT PRIMARY KEY NOT NULL,
      table_id TEXT NOT NULL,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      data_type TEXT NOT NULL,
      position INTEGER NOT NULL,
      required INTEGER DEFAULT 0 NOT NULL,
      default_value TEXT,
      config TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (table_id) REFERENCES user_tables(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_user_table_columns_table_id ON user_table_columns(table_id);
    CREATE INDEX IF NOT EXISTS idx_user_table_columns_position ON user_table_columns(table_id, position);

    CREATE TABLE IF NOT EXISTS user_table_rows (
      id TEXT PRIMARY KEY NOT NULL,
      table_id TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      data_hash TEXT,
      position INTEGER NOT NULL,
      created_by TEXT DEFAULT 'user',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (table_id) REFERENCES user_tables(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_user_table_rows_table_id ON user_table_rows(table_id);
    CREATE INDEX IF NOT EXISTS idx_user_table_rows_position ON user_table_rows(table_id, position);

    CREATE TABLE IF NOT EXISTS user_table_views (
      id TEXT PRIMARY KEY NOT NULL,
      table_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'grid' NOT NULL,
      config TEXT,
      is_default INTEGER DEFAULT 0 NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (table_id) REFERENCES user_tables(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_user_table_views_table_id ON user_table_views(table_id);

    CREATE TABLE IF NOT EXISTS user_table_relationships (
      id TEXT PRIMARY KEY NOT NULL,
      from_table_id TEXT NOT NULL,
      from_column TEXT NOT NULL,
      to_table_id TEXT NOT NULL,
      to_column TEXT NOT NULL,
      relationship_type TEXT NOT NULL,
      config TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (from_table_id) REFERENCES user_tables(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
      FOREIGN KEY (to_table_id) REFERENCES user_tables(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_user_table_rels_from ON user_table_relationships(from_table_id);
    CREATE INDEX IF NOT EXISTS idx_user_table_rels_to ON user_table_relationships(to_table_id);

    CREATE TABLE IF NOT EXISTS user_table_templates (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      column_schema TEXT NOT NULL,
      sample_data TEXT,
      scope TEXT DEFAULT 'system' NOT NULL,
      icon TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_user_table_templates_category ON user_table_templates(category);
    CREATE INDEX IF NOT EXISTS idx_user_table_templates_scope ON user_table_templates(scope);

    CREATE TABLE IF NOT EXISTS user_table_imports (
      id TEXT PRIMARY KEY NOT NULL,
      table_id TEXT NOT NULL,
      document_id TEXT,
      row_count INTEGER DEFAULT 0 NOT NULL,
      error_count INTEGER DEFAULT 0 NOT NULL,
      errors TEXT,
      status TEXT DEFAULT 'pending' NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (table_id) REFERENCES user_tables(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_user_table_imports_table_id ON user_table_imports(table_id);

    CREATE TABLE IF NOT EXISTS table_document_inputs (
      id TEXT PRIMARY KEY NOT NULL,
      table_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (table_id) REFERENCES user_tables(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_tdi_table ON table_document_inputs(table_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tdi_table_doc ON table_document_inputs(table_id, document_id);

    CREATE TABLE IF NOT EXISTS task_table_inputs (
      id TEXT PRIMARY KEY NOT NULL,
      task_id TEXT NOT NULL,
      table_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
      FOREIGN KEY (table_id) REFERENCES user_tables(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_tti_task ON task_table_inputs(task_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tti_task_table ON task_table_inputs(task_id, table_id);

    CREATE TABLE IF NOT EXISTS workflow_table_inputs (
      id TEXT PRIMARY KEY NOT NULL,
      workflow_id TEXT NOT NULL,
      table_id TEXT NOT NULL,
      step_id TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
      FOREIGN KEY (table_id) REFERENCES user_tables(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_wti_workflow ON workflow_table_inputs(workflow_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wti_workflow_table_step ON workflow_table_inputs(workflow_id, table_id, step_id);

    CREATE TABLE IF NOT EXISTS schedule_table_inputs (
      id TEXT PRIMARY KEY NOT NULL,
      schedule_id TEXT NOT NULL,
      table_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
      FOREIGN KEY (table_id) REFERENCES user_tables(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_sti_schedule ON schedule_table_inputs(schedule_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sti_schedule_table ON schedule_table_inputs(schedule_id, table_id);

    CREATE TABLE IF NOT EXISTS user_table_triggers (
      id TEXT PRIMARY KEY NOT NULL,
      table_id TEXT NOT NULL,
      name TEXT NOT NULL,
      trigger_event TEXT NOT NULL,
      condition TEXT,
      action_type TEXT NOT NULL,
      action_config TEXT NOT NULL,
      status TEXT DEFAULT 'active' NOT NULL,
      fire_count INTEGER DEFAULT 0 NOT NULL,
      last_fired_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (table_id) REFERENCES user_tables(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_user_table_triggers_table_id ON user_table_triggers(table_id);
    CREATE INDEX IF NOT EXISTS idx_user_table_triggers_status ON user_table_triggers(status);

    CREATE TABLE IF NOT EXISTS user_table_row_history (
      id TEXT PRIMARY KEY NOT NULL,
      row_id TEXT NOT NULL,
      table_id TEXT NOT NULL,
      previous_data TEXT NOT NULL,
      changed_by TEXT DEFAULT 'user',
      change_type TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (table_id) REFERENCES user_tables(id) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX IF NOT EXISTS idx_row_history_row_id ON user_table_row_history(row_id);
    CREATE INDEX IF NOT EXISTS idx_row_history_table_id ON user_table_row_history(table_id);
    CREATE INDEX IF NOT EXISTS idx_row_history_created_at ON user_table_row_history(created_at);

    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY NOT NULL,
      label TEXT NOT NULL,
      type TEXT DEFAULT 'manual' NOT NULL,
      status TEXT DEFAULT 'in_progress' NOT NULL,
      file_path TEXT NOT NULL,
      size_bytes INTEGER DEFAULT 0 NOT NULL,
      db_size_bytes INTEGER DEFAULT 0 NOT NULL,
      files_size_bytes INTEGER DEFAULT 0 NOT NULL,
      file_count INTEGER DEFAULT 0 NOT NULL,
      error TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_type ON snapshots(type);
    CREATE INDEX IF NOT EXISTS idx_snapshots_created_at ON snapshots(created_at);

    CREATE TABLE IF NOT EXISTS workflow_execution_stats (
      id TEXT PRIMARY KEY,
      pattern TEXT NOT NULL,
      step_count INTEGER NOT NULL,
      avg_docs_per_step REAL,
      avg_cost_per_step_micros INTEGER,
      avg_duration_per_step_ms INTEGER,
      success_rate REAL,
      common_failures TEXT,
      runtime_breakdown TEXT,
      sample_count INTEGER NOT NULL DEFAULT 0,
      last_updated TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Safety: add columns that may be missing on existing databases.
  // SQLite ALTER TABLE ADD COLUMN is a no-op if column exists (throws, caught).
  for (const alter of [
    "ALTER TABLE tasks ADD COLUMN max_budget_usd REAL",
    "ALTER TABLE workflows ADD COLUMN runtime_id TEXT",
    // F10: row-add idempotency — see src/lib/data/row-hash.ts and addRows().
    // The partial UNIQUE INDEX is created below on every boot.
    "ALTER TABLE user_table_rows ADD COLUMN data_hash TEXT",
  ]) {
    try { sqlite.exec(alter); } catch { /* column already exists — expected */ }
  }

  // F10: partial unique index. Idempotent — IF NOT EXISTS guards re-runs.
  // Lives here (after ALTER) so legacy DBs without data_hash get the column
  // first, then the index. The partial WHERE clause means rows pre-backfill
  // don't conflict with each other.
  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_table_rows_table_data_hash
      ON user_table_rows(table_id, data_hash) WHERE data_hash IS NOT NULL;
  `);
}

export function hasLegacyTables(sqlite: Database.Database): boolean {
  const placeholders = LEGACY_DATA_TABLES.map(() => "?").join(", ");
  const row = sqlite
    .prepare(
      `SELECT COUNT(*) AS count
       FROM sqlite_master
       WHERE type = 'table' AND name IN (${placeholders})`
    )
    .get(...LEGACY_DATA_TABLES) as { count: number };

  return row.count > 0;
}

export function hasMigrationHistory(
  sqlite: Database.Database,
  migrationsTable = "__drizzle_migrations"
): boolean {
  const tableRow = sqlite
    .prepare(
      `SELECT COUNT(*) AS count
       FROM sqlite_master
       WHERE type = 'table' AND name = ?`
    )
    .get(migrationsTable) as { count: number };

  if (tableRow.count === 0) {
    return false;
  }

  const row = sqlite
    .prepare(`SELECT COUNT(*) AS count FROM ${migrationsTable}`)
    .get() as { count: number };

  return row.count > 0;
}

export function markAllMigrationsApplied(
  sqlite: Database.Database,
  migrationsFolder: string,
  migrationsTable = "__drizzle_migrations"
): void {
  const migrations = readMigrationFiles({ migrationsFolder, migrationsTable });

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ${migrationsTable} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at NUMERIC
    )
  `);

  const existing = sqlite
    .prepare(`SELECT hash, created_at FROM ${migrationsTable}`)
    .all() as Array<{ hash: string; created_at: number }>;
  const seen = new Set(existing.map((row) => `${row.hash}:${row.created_at}`));
  const insert = sqlite.prepare(
    `INSERT INTO ${migrationsTable} (hash, created_at) VALUES (?, ?)`
  );

  for (const migration of migrations) {
    const key = `${migration.hash}:${migration.folderMillis}`;
    if (!seen.has(key)) {
      insert.run(migration.hash, migration.folderMillis);
    }
  }
}
