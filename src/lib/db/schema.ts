import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { InferSelectModel } from "drizzle-orm";

// Customer dimension (Core): a first-class account/client a tenant runs ops for.
// `slug` is the stable, pack-addressable handle (a pack seed references a customer
// by slug; customerId FKs resolve through it). `industry` is free-text, NOT an enum
// — different packs introduce different verticals, so a Core-level enum would be a
// ceiling a pack cannot extend. See _SPECS/2026-06-30-132039_customer-dimension.md.
export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: text("status", { enum: ["active", "archived"] })
      .default("active")
      .notNull(),
    industry: text("industry"),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_customers_slug").on(table.slug),
    index("idx_customers_status").on(table.status),
  ]
);

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  workingDirectory: text("working_directory"),
  customerId: text("customer_id").references(() => customers.id),
  status: text("status", { enum: ["active", "paused", "completed"] })
    .default("active")
    .notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id),
    workflowId: text("workflow_id").references(() => workflows.id),
    scheduleId: text("schedule_id").references(() => schedules.id),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", {
      enum: ["planned", "queued", "running", "completed", "failed", "cancelled"],
    })
      .default("planned")
      .notNull(),
    assignedAgent: text("assigned_agent"),
    agentProfile: text("agent_profile"),
    /** Phase 4: links a row-triggered task back to its originating user_table_rows row. */
    contextRowId: text("context_row_id"),
    /** Runtime actually used for the most recent execution attempt. */
    effectiveRuntimeId: text("effective_runtime_id"),
    /** Model actually used for the most recent execution attempt. */
    effectiveModelId: text("effective_model_id"),
    /** Human-readable reason when execution fell back from the requested runtime/model. */
    runtimeFallbackReason: text("runtime_fallback_reason"),
    priority: integer("priority").default(2).notNull(),
    result: text("result"),
    sessionId: text("session_id"),
    resumeCount: integer("resume_count").default(0).notNull(),
    /** How this task was created: manual, scheduled, heartbeat, or workflow */
    sourceType: text("source_type", {
      enum: ["manual", "scheduled", "heartbeat", "workflow"],
    }),
    workflowRunNumber: integer("workflow_run_number"),
    /** Resolved per-task budget cap in USD — set by workflow engine for child tasks */
    maxBudgetUsd: real("max_budget_usd"),
    /** When the slot for this task was atomically claimed */
    slotClaimedAt: integer("slot_claimed_at", { mode: "timestamp" }),
    /** Wall-clock expiry; reaper aborts tasks whose lease has passed */
    leaseExpiresAt: integer("lease_expires_at", { mode: "timestamp" }),
    /**
     * Explicit terminal-state reason written by the runtime adapter at
     * failure/abort transitions (e.g. 'turn_limit_exceeded', 'lease_expired',
     * 'aborted', 'sdk_error'). Distinct from `result` — `result` holds the
     * agent's final output text, while `failureReason` holds a machine-readable
     * classifier that drives scheduler failure-streak logic without re-parsing
     * error prose.
     */
    failureReason: text("failure_reason"),
    /** Per-task turn budget copied from schedules.maxTurns at firing time */
    maxTurns: integer("max_turns"),
    /** Success criteria copied when this schedule firing or workflow run starts. */
    successCriteriaSnapshot: text("success_criteria_snapshot"),
    /**
     * Number of assistant-role frames in the runtime stream where the agent
     * produced content. Persisted at task completion. Null for pre-existing
     * rows or runtimes other than `claude-code`. See features/task-turn-observability.md
     * "Metric Definition" for the precise definition and why these counts are
     * far higher than "reasoning rounds".
     */
    turnCount: integer("turn_count"),
    /**
     * Total token usage (input + output) accumulated across the runtime stream,
     * persisted at task completion. Mirrors the same value the usage ledger writes
     * to its row but is denormalized here for cheap one-shot reads via get_task /
     * list_tasks. Null for pre-existing rows.
     */
    tokenCount: integer("token_count"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_tasks_status").on(table.status),
    index("idx_tasks_project_id").on(table.projectId),
    index("idx_tasks_workflow_id").on(table.workflowId),
    index("idx_tasks_schedule_id").on(table.scheduleId),
    index("idx_tasks_agent_profile").on(table.agentProfile),
    index("idx_tasks_running_scheduled").on(table.status, table.sourceType, table.leaseExpiresAt),
  ]
);

export const workflows = sqliteTable("workflows", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id),
  name: text("name").notNull(),
  definition: text("definition").notNull(),
  status: text("status", {
    enum: ["draft", "active", "paused", "completed", "failed"],
  })
    .default("draft")
    .notNull(),
  runNumber: integer("run_number").default(0).notNull(),
  /** Normalized Operations Receipt criteria JSON. Null/[] means no declared bar. */
  successCriteria: text("success_criteria"),
  /** Criteria copied atomically when the current workflow run is claimed. */
  successCriteriaRunSnapshot: text("success_criteria_run_snapshot"),
  /** Runtime to use for all steps (nullable — falls back to system default) */
  runtimeId: text("runtime_id"),
  /**
   * Epoch millisecond timestamp at which a paused (delayed) workflow is due to resume.
   * Null for workflows that are not waiting on a delay step. Indexed via
   * idx_workflows_resume_at (partial index on non-null values) so the scheduler tick
   * can efficiently find due workflows. See features/workflow-step-delays.md.
   */
  resumeAt: integer("resume_at"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const agentLogs = sqliteTable(
  "agent_logs",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").references(() => tasks.id),
    agentType: text("agent_type").notNull(),
    event: text("event").notNull(),
    payload: text("payload"),
    timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_agent_logs_task_id").on(table.taskId),
    index("idx_agent_logs_timestamp").on(table.timestamp),
  ]
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").references(() => tasks.id),
    type: text("type", {
      enum: [
        "permission_required",
        "task_completed",
        "task_failed",
        "agent_message",
        "budget_alert",
        "context_proposal",
        "context_proposal_batch",
        "tier_limit",
      ],
    }).notNull(),
    title: text("title").notNull(),
    body: text("body"),
    read: integer("read", { mode: "boolean" }).default(false).notNull(),
    toolName: text("tool_name"),
    toolInput: text("tool_input"),
    response: text("response"),
    respondedAt: integer("responded_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_notifications_task_id").on(table.taskId),
    index("idx_notifications_read").on(table.read),
  ]
);

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").references(() => tasks.id),
    projectId: text("project_id").references(() => projects.id),
    filename: text("filename").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    storagePath: text("storage_path").notNull(),
    version: integer("version").default(1).notNull(),
    direction: text("direction", { enum: ["input", "output"] })
      .default("input")
      .notNull(),
    category: text("category"),
    status: text("status", {
      enum: ["uploaded", "processing", "ready", "error"],
    })
      .default("uploaded")
      .notNull(),
    extractedText: text("extracted_text"),
    processedPath: text("processed_path"),
    processingError: text("processing_error"),
    source: text("source").default("upload"),
    conversationId: text("conversation_id").references(() => conversations.id),
    messageId: text("message_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_documents_task_id").on(table.taskId),
    index("idx_documents_project_id").on(table.projectId),
    index("idx_documents_source").on(table.source),
    index("idx_documents_conversation_id").on(table.conversationId),
  ]
);

export const schedules = sqliteTable(
  "schedules",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id),
    name: text("name").notNull(),
    prompt: text("prompt").notNull(),
    cronExpression: text("cron_expression").notNull(),
    assignedAgent: text("assigned_agent"),
    agentProfile: text("agent_profile"),
    recurs: integer("recurs", { mode: "boolean" }).default(true).notNull(),
    status: text("status", {
      enum: ["active", "paused", "completed", "expired"],
    })
      .default("active")
      .notNull(),
    maxFirings: integer("max_firings"),
    firingCount: integer("firing_count").default(0).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    lastFiredAt: integer("last_fired_at", { mode: "timestamp" }),
    nextFireAt: integer("next_fire_at", { mode: "timestamp" }),
    /** 'scheduled' (default, clock-driven) or 'heartbeat' (intelligence-driven) */
    type: text("type", { enum: ["scheduled", "heartbeat"] })
      .default("scheduled")
      .notNull(),
    /** JSON array of checklist items the agent evaluates (heartbeat only) */
    heartbeatChecklist: text("heartbeat_checklist"),
    /** Hour of day (0-23) when heartbeats are active */
    activeHoursStart: integer("active_hours_start"),
    /** Hour of day (0-23) when heartbeats stop */
    activeHoursEnd: integer("active_hours_end"),
    /** Timezone for active hours windowing */
    activeTimezone: text("active_timezone").default("UTC"),
    /** Consecutive suppressed (no-action) heartbeat runs */
    suppressionCount: integer("suppression_count").default(0).notNull(),
    /** Timestamp of last heartbeat run that produced action */
    lastActionAt: integer("last_action_at", { mode: "timestamp" }),
    /** Daily budget cap for heartbeat evaluations (in microdollars) */
    heartbeatBudgetPerDay: integer("heartbeat_budget_per_day"),
    /** Spend so far today for heartbeat evaluations (in microdollars) */
    heartbeatSpentToday: integer("heartbeat_spent_today").default(0).notNull(),
    /** When the daily heartbeat budget was last reset */
    heartbeatBudgetResetAt: integer("heartbeat_budget_reset_at", {
      mode: "timestamp",
    }),
    /** JSON array of channel config IDs for delivery after firing */
    deliveryChannels: text("delivery_channels"),
    /** Exponential moving average of turns used per child task firing */
    avgTurnsPerFiring: integer("avg_turns_per_firing"),
    /** Turns used by the most recent firing */
    lastTurnCount: integer("last_turn_count"),
    /** Consecutive failed firings (reset to 0 on success). Auto-pause at 3. */
    failureStreak: integer("failure_streak").default(0).notNull(),
    /** Detected reason for the most recent failure (turn_limit_exceeded, timeout, etc.) */
    lastFailureReason: text("last_failure_reason"),
    /** Hard cap on turns per firing; NULL inherits the global MAX_TURNS setting */
    maxTurns: integer("max_turns"),
    /** Timestamp when maxTurns was last edited — drives first-breach grace */
    maxTurnsSetAt: integer("max_turns_set_at", { mode: "timestamp" }),
    /** Wall-clock lease override in seconds; NULL inherits global default (1200s) */
    maxRunDurationSec: integer("max_run_duration_sec"),
    /** Normalized Operations Receipt criteria JSON. Null/[] means no declared bar. */
    successCriteria: text("success_criteria"),
    /**
     * Counter separate from failureStreak — increments only on maxTurns breach.
     * Reset to 0 on any non-breach outcome (successful run, generic failure, or
     * first-breach grace window after maxTurnsSetAt). Auto-pause at 5. This
     * higher threshold + grace window protects users from tripping auto-pause
     * via a misconfigured maxTurns edit.
     */
    turnBudgetBreachStreak: integer("turn_budget_breach_streak").default(0).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_schedules_status").on(table.status),
    index("idx_schedules_next_fire_at").on(table.nextFireAt),
    index("idx_schedules_project_id").on(table.projectId),
  ]
);

/**
 * Operator-owned metered-cost stop-losses for unattended app/schedule work.
 * Pack-authored values remain recommendations in AppManifest; only rows in
 * this table enforce. Claim fields serialize runs that share one policy and
 * expire so a crashed process cannot strand automation forever.
 */
export const usageBudgetPolicies = sqliteTable(
  "usage_budget_policies",
  {
    id: text("id").primaryKey(),
    scopeType: text("scope_type", { enum: ["app", "schedule"] }).notNull(),
    scopeId: text("scope_id").notNull(),
    appId: text("app_id"),
    scheduleId: text("schedule_id").references(() => schedules.id, {
      onDelete: "cascade",
    }),
    sourceRecommendationId: text("source_recommendation_id"),
    enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
    onExceed: text("on_exceed", { enum: ["pause", "notify"] })
      .default("pause")
      .notNull(),
    maxCostPerRunMicros: integer("max_cost_per_run_micros"),
    maxCostPerDayMicros: integer("max_cost_per_day_micros"),
    maxCostPerMonthMicros: integer("max_cost_per_month_micros"),
    notificationState: text("notification_state").default("{}").notNull(),
    lastBreachKind: text("last_breach_kind", {
      enum: ["run", "daily", "monthly", "measurement_unavailable"],
    }),
    lastBreachMessage: text("last_breach_message"),
    lastBreachAt: integer("last_breach_at", { mode: "timestamp" }),
    activeRunId: text("active_run_id"),
    activeScheduleId: text("active_schedule_id"),
    claimStartedAt: integer("claim_started_at", { mode: "timestamp" }),
    claimExpiresAt: integer("claim_expires_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_usage_budget_policies_scope").on(
      table.scopeType,
      table.scopeId
    ),
    index("idx_usage_budget_policies_app_id").on(table.appId),
    index("idx_usage_budget_policies_schedule_id").on(table.scheduleId),
    index("idx_usage_budget_policies_claim_expiry").on(table.claimExpiresAt),
  ]
);

export type UsageBudgetPolicyRow = InferSelectModel<typeof usageBudgetPolicies>;

export const operationsReceipts = sqliteTable(
  "operations_receipts",
  {
    id: text("id").primaryKey(),
    sourceKey: text("source_key").notNull(),
    ownerType: text("owner_type", { enum: ["schedule", "workflow"] }).notNull(),
    scheduleId: text("schedule_id").references(() => schedules.id, {
      onDelete: "set null",
    }),
    workflowId: text("workflow_id").references(() => workflows.id, {
      onDelete: "set null",
    }),
    taskId: text("task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    workflowRunNumber: integer("workflow_run_number"),
    verdict: text("verdict", {
      enum: ["passed", "at_risk", "failed"],
    }).notNull(),
    criteriaSnapshot: text("criteria_snapshot").notNull(),
    evidence: text("evidence").notNull(),
    summary: text("summary").notNull(),
    nextAction: text("next_action").notNull(),
    startedAt: integer("started_at", { mode: "timestamp" }),
    finishedAt: integer("finished_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_operations_receipts_source_key").on(table.sourceKey),
    index("idx_operations_receipts_schedule_finished").on(
      table.scheduleId,
      table.finishedAt
    ),
    index("idx_operations_receipts_workflow_finished").on(
      table.workflowId,
      table.finishedAt
    ),
  ]
);

export type OperationsReceiptRow = InferSelectModel<typeof operationsReceipts>;

export const workshopRuns = sqliteTable(
  "workshop_runs",
  {
    id: text("id").primaryKey(),
    editionId: text("edition_id").notNull(),
    editionVersion: text("edition_version").notNull(),
    editionHash: text("edition_hash").notNull(),
    status: text("status", {
      enum: ["ready", "active", "completed", "at_risk", "failed"],
    })
      .default("ready")
      .notNull(),
    checkpointState: text("checkpoint_state").default("{}").notNull(),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    appId: text("app_id"),
    workflowId: text("workflow_id").references(() => workflows.id, {
      onDelete: "set null",
    }),
    receiptId: text("receipt_id").references(() => operationsReceipts.id, {
      onDelete: "set null",
    }),
    fallbackUsed: integer("fallback_used", { mode: "boolean" })
      .default(false)
      .notNull(),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp" }),
  },
  (table) => [
    index("idx_workshop_runs_edition").on(
      table.editionId,
      table.editionVersion
    ),
    index("idx_workshop_runs_status").on(table.status),
  ]
);

export type WorkshopRunRow = InferSelectModel<typeof workshopRuns>;

export const workflowReceiptRuns = sqliteTable(
  "workflow_receipt_runs",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    runNumber: integer("run_number").notNull(),
    criteriaSnapshot: text("criteria_snapshot").notNull(),
    terminalStatus: text("terminal_status", {
      enum: ["completed", "failed"],
    }),
    startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
    finishedAt: integer("finished_at", { mode: "timestamp" }),
  },
  (table) => [
    uniqueIndex("idx_workflow_receipt_runs_owner_run").on(
      table.workflowId,
      table.runNumber
    ),
  ]
);

export const learnedContext = sqliteTable(
  "learned_context",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id").notNull(),
    version: integer("version").notNull(),
    content: text("content"),
    diff: text("diff"),
    changeType: text("change_type", {
      enum: [
        "proposal",
        "approved",
        "rejected",
        "rollback",
        "summarization",
      ],
    }).notNull(),
    sourceTaskId: text("source_task_id").references(() => tasks.id),
    proposalNotificationId: text("proposal_notification_id"),
    proposedAdditions: text("proposed_additions"),
    approvedBy: text("approved_by"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_learned_context_profile_version").on(
      table.profileId,
      table.version
    ),
    index("idx_learned_context_change_type").on(table.changeType),
  ]
);

export const agentMemory = sqliteTable(
  "agent_memory",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id").notNull(),
    category: text("category", {
      enum: ["fact", "preference", "pattern", "outcome"],
    }).notNull(),
    content: text("content").notNull(),
    confidence: integer("confidence").default(700).notNull(), // 0-1000 scale (700 = 0.7)
    sourceTaskId: text("source_task_id").references(() => tasks.id),
    tags: text("tags"), // JSON array
    lastAccessedAt: integer("last_accessed_at", { mode: "timestamp" }),
    accessCount: integer("access_count").default(0).notNull(),
    decayRate: integer("decay_rate").default(10).notNull(), // per-day decay in thousandths (10 = 0.01/day)
    status: text("status", {
      enum: ["active", "decayed", "archived", "rejected"],
    })
      .default("active")
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_agent_memory_profile_status").on(table.profileId, table.status),
    index("idx_agent_memory_confidence").on(table.confidence),
  ]
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const usageLedger = sqliteTable(
  "usage_ledger",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").references(() => tasks.id),
    workflowId: text("workflow_id").references(() => workflows.id),
    scheduleId: text("schedule_id").references(() => schedules.id),
    projectId: text("project_id").references(() => projects.id),
    customerId: text("customer_id").references(() => customers.id),
    activityType: text("activity_type", {
      enum: [
        "task_run",
        "task_resume",
        "workflow_step",
        "scheduled_firing",
        "task_assist",
        "profile_test",
        "pattern_extraction",
        "context_summarization",
        "chat_turn",
        "profile_assist",
        "manual_force_bypass",
      ],
    }).notNull(),
    runtimeId: text("runtime_id").notNull(),
    providerId: text("provider_id").notNull(),
    modelId: text("model_id"),
    status: text("status", {
      enum: ["completed", "failed", "cancelled", "blocked", "unknown_pricing"],
    }).notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    costMicros: integer("cost_micros"),
    pricingVersion: text("pricing_version"),
    usageCompleteness: text("usage_completeness", {
      enum: ["complete", "partial", "unavailable"],
    })
      .default("partial")
      .notNull(),
    usageSource: text("usage_source"),
    usageDetails: text("usage_details"),
    startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
    finishedAt: integer("finished_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_usage_ledger_task_id").on(table.taskId),
    index("idx_usage_ledger_activity_type").on(table.activityType),
    index("idx_usage_ledger_runtime_id").on(table.runtimeId),
    index("idx_usage_ledger_provider_model").on(table.providerId, table.modelId),
    index("idx_usage_ledger_finished_at").on(table.finishedAt),
  ]
);

export const views = sqliteTable(
  "views",
  {
    id: text("id").primaryKey(),
    /** Surface this view belongs to (e.g., "tasks", "documents", "workflows") */
    surface: text("surface").notNull(),
    /** User-assigned name for the view */
    name: text("name").notNull(),
    /** JSON-serialized filter state */
    filters: text("filters"),
    /** JSON-serialized sort state (column + direction) */
    sorting: text("sorting"),
    /** JSON-serialized column visibility state */
    columns: text("columns"),
    /** Density preference: compact | comfortable | spacious */
    density: text("density", {
      enum: ["compact", "comfortable", "spacious"],
    }).default("comfortable"),
    /** Whether this is the default view for the surface */
    isDefault: integer("is_default", { mode: "boolean" }).default(false).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_views_surface").on(table.surface),
    index("idx_views_surface_default").on(table.surface, table.isDefault),
  ]
);

// ── Environment onboarding tables ──────────────────────────────────────

export const environmentScans = sqliteTable(
  "environment_scans",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id),
    scanPath: text("scan_path").notNull(),
    persona: text("persona").notNull(), // JSON array of ToolPersona[]
    scanStatus: text("scan_status", {
      enum: ["running", "completed", "failed"],
    })
      .default("running")
      .notNull(),
    artifactCount: integer("artifact_count").default(0).notNull(),
    durationMs: integer("duration_ms"),
    errors: text("errors"), // JSON array of ScanError[]
    scannedAt: integer("scanned_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_env_scans_project_id").on(table.projectId),
    index("idx_env_scans_scanned_at").on(table.scannedAt),
  ]
);

export const environmentArtifacts = sqliteTable(
  "environment_artifacts",
  {
    id: text("id").primaryKey(),
    scanId: text("scan_id")
      .references(() => environmentScans.id)
      .notNull(),
    tool: text("tool").notNull(), // ToolPersona
    category: text("category").notNull(), // ArtifactCategory
    scope: text("scope").notNull(), // ArtifactScope
    name: text("name").notNull(),
    relPath: text("rel_path").notNull(),
    absPath: text("abs_path").notNull(),
    contentHash: text("content_hash").notNull(),
    preview: text("preview"),
    metadata: text("metadata"), // JSON
    sizeBytes: integer("size_bytes").default(0).notNull(),
    modifiedAt: integer("modified_at").notNull(), // epoch ms
    linkedProfileId: text("linked_profile_id"), // profile ID if this artifact is linked to a profile
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_env_artifacts_scan_id").on(table.scanId),
    index("idx_env_artifacts_category").on(table.category),
    index("idx_env_artifacts_tool").on(table.tool),
    index("idx_env_artifacts_scan_tool").on(table.scanId, table.tool),
    index("idx_env_artifacts_scan_category").on(table.scanId, table.category),
    index("idx_env_artifacts_linked_profile").on(table.linkedProfileId),
  ]
);

export const environmentCheckpoints = sqliteTable(
  "environment_checkpoints",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id),
    label: text("label").notNull(),
    checkpointType: text("checkpoint_type", {
      enum: ["pre-sync", "manual", "pre-onboard"],
    }).notNull(),
    gitTag: text("git_tag"),
    gitCommitSha: text("git_commit_sha"),
    backupPath: text("backup_path"),
    filesCount: integer("files_count").default(0).notNull(),
    status: text("status", {
      enum: ["active", "rolled_back", "superseded"],
    })
      .default("active")
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_env_checkpoints_project_status").on(
      table.projectId,
      table.status
    ),
  ]
);

export const environmentSyncOps = sqliteTable(
  "environment_sync_ops",
  {
    id: text("id").primaryKey(),
    checkpointId: text("checkpoint_id")
      .references(() => environmentCheckpoints.id)
      .notNull(),
    artifactId: text("artifact_id").references(() => environmentArtifacts.id),
    operation: text("operation", {
      enum: ["create", "update", "delete", "sync"],
    }).notNull(),
    targetTool: text("target_tool").notNull(),
    targetPath: text("target_path").notNull(),
    diffPreview: text("diff_preview"),
    status: text("status", {
      enum: ["pending", "applied", "failed", "rolled_back"],
    })
      .default("pending")
      .notNull(),
    error: text("error"),
    appliedAt: integer("applied_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("idx_env_sync_ops_checkpoint_id").on(table.checkpointId)]
);

export const environmentTemplates = sqliteTable(
  "environment_templates",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    manifest: text("manifest").notNull(), // JSON: { skills, mcpServers, permissions, instructions }
    scope: text("scope", { enum: ["user", "shared"] })
      .default("user")
      .notNull(),
    artifactCount: integer("artifact_count").default(0).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("idx_env_templates_scope").on(table.scope)]
);

// ── Chat conversation tables ───────────────────────────────────────────

export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id),
    title: text("title"),
    runtimeId: text("runtime_id").notNull(),
    modelId: text("model_id"),
    status: text("status", { enum: ["active", "archived"] })
      .default("active")
      .notNull(),
    sessionId: text("session_id"),
    contextScope: text("context_scope"), // JSON: context config overrides
    /**
     * Opaque skill ID of the ainative-activated skill for this conversation.
     * When set, the context builder injects that skill's SKILL.md into the
     * Tier 0 system prompt every turn. Primary use case is Ollama (no
     * SDK-native skill support); Claude and Codex can also use it as a
     * programmatic skill-activation path alongside their native Skill tools.
     *
     * See `features/chat-ollama-native-skills.md`.
     */
    activeSkillId: text("active_skill_id"),
    /**
     * Composition v1 — array of additionally-activated skill IDs (beyond
     * the legacy `activeSkillId`). Default `[]`. Read paths merge legacy
     * + new and dedupe via `mergeActiveSkillIds`. Stored as JSON text.
     *
     * See `features/chat-skill-composition.md`.
     */
    activeSkillIds: text("active_skill_ids", { mode: "json" })
      .$type<string[]>()
      .default([] as unknown as string[]),
    /**
     * Branching v1 — parent of this conversation in the branch tree.
     * NULL for root (linear) conversations. When set, the context builder
     * walks the ancestor chain to reconstruct the prefix transcript.
     *
     * See `features/chat-conversation-branches.md`.
     */
    parentConversationId: text("parent_conversation_id"),
    /**
     * The assistant message in the parent conversation that this branch
     * forked from. Messages with `createdAt <= branchedFromMessage.createdAt`
     * in the parent are included as prefix; later messages are not.
     * NULL iff `parentConversationId` is NULL.
     */
    branchedFromMessageId: text("branched_from_message_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_conversations_project_id").on(table.projectId),
    index("idx_conversations_status").on(table.status),
    index("idx_conversations_updated_at").on(table.updatedAt),
    index("idx_conversations_parent_id").on(table.parentConversationId),
  ]
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .references(() => conversations.id)
      .notNull(),
    role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
    content: text("content").notNull(),
    metadata: text("metadata"), // JSON: token counts, model used, etc.
    status: text("status", {
      enum: ["pending", "streaming", "complete", "error"],
    })
      .default("complete")
      .notNull(),
    /**
     * Branching v1 — when an assistant+user message pair is rewound via
     * Cmd-Z, both messages get this timestamp set. The context builder
     * filters `WHERE rewoundAt IS NULL` so the agent never sees the
     * rewound turns again. NULL for the common (non-rewound) case.
     *
     * Stored at millisecond resolution (`timestamp_ms`) — not seconds —
     * because two rewind actions can fire well within the same second
     * and `restoreLatestRewoundPair` needs to identify a single pair by
     * its exact rewoundAt timestamp.
     *
     * See `features/chat-conversation-branches.md`.
     */
    rewoundAt: integer("rewound_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_chat_messages_conversation_id").on(table.conversationId),
    index("idx_chat_messages_conversation_created").on(
      table.conversationId,
      table.createdAt
    ),
  ]
);

// ── Profile test results ──────────────────────────────────────────────────

export const profileTestResults = sqliteTable(
  "profile_test_results",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id").notNull(),
    runtimeId: text("runtime_id").notNull(),
    reportJson: text("report_json").notNull(),
    totalPassed: integer("total_passed").default(0).notNull(),
    totalFailed: integer("total_failed").default(0).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_profile_test_results_profile_runtime").on(
      table.profileId,
      table.runtimeId
    ),
  ]
);

export const repoImports = sqliteTable(
  "repo_imports",
  {
    id: text("id").primaryKey(),
    repoUrl: text("repo_url").notNull(),
    repoOwner: text("repo_owner").notNull(),
    repoName: text("repo_name").notNull(),
    branch: text("branch").notNull(),
    commitSha: text("commit_sha").notNull(),
    profileIds: text("profile_ids").notNull(), // JSON array of imported profile IDs
    skillCount: integer("skill_count").notNull(),
    lastCheckedAt: integer("last_checked_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_repo_imports_repo_url").on(table.repoUrl),
    index("idx_repo_imports_owner_name").on(table.repoOwner, table.repoName),
  ]
);

// ── Multi-Channel Delivery ────────────────────────────────────────────

export const channelConfigs = sqliteTable(
  "channel_configs",
  {
    id: text("id").primaryKey(),
    channelType: text("channel_type", { enum: ["slack", "telegram", "webhook"] }).notNull(),
    name: text("name").notNull(),
    // SECURITY: The config JSON contains credentials (botToken, signingSecret, webhookSecret)
    // stored as plaintext. A future improvement should encrypt these at rest.
    // All API responses MUST mask sensitive fields via maskChannelConfig() before returning.
    config: text("config").notNull(), // JSON: { webhookUrl?, botToken?, chatId?, channelId?, signingSecret?, webhookSecret? }
    status: text("status", { enum: ["active", "disabled"] }).default("active").notNull(),
    testStatus: text("test_status", { enum: ["untested", "ok", "failed"] }).default("untested").notNull(),
    direction: text("direction", { enum: ["outbound", "bidirectional"] }).default("outbound").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_channel_configs_type").on(table.channelType),
  ]
);

export type ChannelConfigRow = InferSelectModel<typeof channelConfigs>;

// ── Bidirectional Channel Chat ────────────────────────────────────────

export const channelBindings = sqliteTable(
  "channel_bindings",
  {
    id: text("id").primaryKey(),
    channelConfigId: text("channel_config_id").references(() => channelConfigs.id).notNull(),
    conversationId: text("conversation_id").references(() => conversations.id).notNull(),
    externalThreadId: text("external_thread_id"),
    runtimeId: text("runtime_id").notNull(),
    modelId: text("model_id"),
    profileId: text("profile_id"),
    status: text("status", { enum: ["active", "paused", "archived"] }).default("active").notNull(),
    pendingRequestId: text("pending_request_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_channel_bindings_config").on(table.channelConfigId),
    index("idx_channel_bindings_conversation").on(table.conversationId),
    uniqueIndex("idx_channel_bindings_config_thread").on(table.channelConfigId, table.externalThreadId),
  ]
);

export type ChannelBindingRow = InferSelectModel<typeof channelBindings>;

// ── Generator/Publisher Substrate (TDR-039) ───────────────────────────

export const publishTargets = sqliteTable(
  "publish_targets",
  {
    // Composite `plugin:<id>:<target>` for pack-seeded rows.
    id: text("id").primaryKey(),
    // Logical app/project id — apps are file-based, so no SQL FK.
    appId: text("app_id").notNull(),
    targetType: text("target_type", { enum: ["github-pages", "github-repo"] }).notNull(),
    // New GitHub targets store repository coordinates only. Credentials live
    // once, encrypted, in Settings. Legacy rows may still contain a token, so
    // every API response remains masked and the resolver keeps a fallback
    // only until the operator explicitly adopts/disconnects shared setup.
    config: text("config").notNull(), // JSON: { owner?, repo?, branch?, directory? }
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_publish_targets_app").on(table.appId),
  ]
);

export type PublishTargetRow = InferSelectModel<typeof publishTargets>;

export const deployments = sqliteTable(
  "deployments",
  {
    id: text("id").primaryKey(),
    appId: text("app_id").notNull(),
    targetId: text("target_id").references(() => publishTargets.id).notNull(),
    status: text("status", {
      enum: ["pending", "publishing", "success", "failed"],
    }).default("pending").notNull(),
    url: text("url"),
    finalUrl: text("final_url"),
    commit: text("commit_sha"),
    artifactHash: text("artifact_hash"),
    generatorConfig: text("generator_config"),
    pageSlug: text("page_slug"),
    startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
    finishedAt: integer("finished_at", { mode: "timestamp" }),
    error: text("error"),
  },
  (table) => [
    index("idx_deployments_app").on(table.appId),
    index("idx_deployments_target").on(table.targetId),
    index("idx_deployments_app_page").on(table.appId, table.pageSlug),
  ]
);

export type DeploymentRow = InferSelectModel<typeof deployments>;

// ── Agent Async Handoffs ──────────────────────────────────────────────

export const agentMessages = sqliteTable(
  "agent_messages",
  {
    id: text("id").primaryKey(),
    fromProfileId: text("from_profile_id").notNull(),
    toProfileId: text("to_profile_id").notNull(),
    taskId: text("task_id").references(() => tasks.id),
    targetTaskId: text("target_task_id").references(() => tasks.id),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    attachments: text("attachments"), // JSON
    priority: integer("priority").default(2).notNull(),
    status: text("status", {
      enum: ["pending", "accepted", "in_progress", "completed", "rejected", "expired"],
    }).default("pending").notNull(),
    requiresApproval: integer("requires_approval", { mode: "boolean" }).default(false).notNull(),
    approvedBy: text("approved_by"),
    parentMessageId: text("parent_message_id"),
    chainDepth: integer("chain_depth").default(0).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    respondedAt: integer("responded_at", { mode: "timestamp" }),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
  },
  (table) => [
    index("idx_agent_messages_to_status").on(table.toProfileId, table.status),
    index("idx_agent_messages_task").on(table.taskId),
  ]
);

// ── Workflow Document Pool ───────────────────────────────────────────

export const workflowDocumentInputs = sqliteTable(
  "workflow_document_inputs",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id")
      .references(() => workflows.id)
      .notNull(),
    documentId: text("document_id")
      .references(() => documents.id)
      .notNull(),
    /** null = document available to all steps; set = scoped to specific step */
    stepId: text("step_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_wdi_workflow").on(table.workflowId),
    index("idx_wdi_document").on(table.documentId),
    uniqueIndex("idx_wdi_workflow_doc_step").on(
      table.workflowId,
      table.documentId,
      table.stepId
    ),
  ]
);

export type WorkflowDocumentInputRow = InferSelectModel<typeof workflowDocumentInputs>;

export const scheduleDocumentInputs = sqliteTable(
  "schedule_document_inputs",
  {
    id: text("id").primaryKey(),
    scheduleId: text("schedule_id")
      .references(() => schedules.id)
      .notNull(),
    documentId: text("document_id")
      .references(() => documents.id)
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_sdi_schedule").on(table.scheduleId),
    uniqueIndex("idx_sdi_schedule_doc").on(
      table.scheduleId,
      table.documentId
    ),
  ]
);

export type ScheduleDocumentInputRow = InferSelectModel<typeof scheduleDocumentInputs>;

export const projectDocumentDefaults = sqliteTable(
  "project_document_defaults",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .references(() => projects.id)
      .notNull(),
    documentId: text("document_id")
      .references(() => documents.id)
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_pdd_project").on(table.projectId),
    uniqueIndex("idx_pdd_project_doc").on(
      table.projectId,
      table.documentId
    ),
  ]
);

export type ProjectDocumentDefaultRow = InferSelectModel<typeof projectDocumentDefaults>;

// ── User-Defined Tables (structured data) ───────────────────────────────

export const userTables = sqliteTable(
  "user_tables",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id),
    name: text("name").notNull(),
    description: text("description"),
    /** JSON array of column definitions — denormalized for fast reads */
    columnSchema: text("column_schema").notNull().default("[]"),
    /** Denormalized row count for list views */
    rowCount: integer("row_count").default(0).notNull(),
    /** How this table was created */
    source: text("source", {
      enum: ["manual", "imported", "agent", "template"],
    })
      .default("manual")
      .notNull(),
    /** Template ID if created from a template */
    templateId: text("template_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_user_tables_project_id").on(table.projectId),
    index("idx_user_tables_source").on(table.source),
  ]
);

export const userTableColumns = sqliteTable(
  "user_table_columns",
  {
    id: text("id").primaryKey(),
    tableId: text("table_id")
      .references(() => userTables.id)
      .notNull(),
    name: text("name").notNull(),
    displayName: text("display_name").notNull(),
    dataType: text("data_type", {
      enum: [
        "text",
        "number",
        "date",
        "boolean",
        "select",
        "url",
        "email",
        "relation",
        "computed",
      ],
    }).notNull(),
    position: integer("position").notNull(),
    required: integer("required", { mode: "boolean" }).default(false).notNull(),
    defaultValue: text("default_value"),
    /** JSON config for type-specific settings (select options, formula, relation target, etc.) */
    config: text("config"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_user_table_columns_table_id").on(table.tableId),
    index("idx_user_table_columns_position").on(table.tableId, table.position),
  ]
);

export const userTableRows = sqliteTable(
  "user_table_rows",
  {
    id: text("id").primaryKey(),
    tableId: text("table_id")
      .references(() => userTables.id)
      .notNull(),
    /** JSON object with column values keyed by column name */
    data: text("data").notNull().default("{}"),
    /** SHA-256 of canonicalized data (F10 idempotency). Nullable for legacy
     * rows pre-backfill; new rows always populate it. */
    dataHash: text("data_hash"),
    position: integer("position").notNull(),
    /** Who created this row: 'user' or agent profile ID */
    createdBy: text("created_by").default("user"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_user_table_rows_table_id").on(table.tableId),
    index("idx_user_table_rows_position").on(table.tableId, table.position),
  ]
);

export const userTableViews = sqliteTable(
  "user_table_views",
  {
    id: text("id").primaryKey(),
    tableId: text("table_id")
      .references(() => userTables.id)
      .notNull(),
    name: text("name").notNull(),
    type: text("type", { enum: ["grid", "chart", "joined"] })
      .default("grid")
      .notNull(),
    /** JSON config: filters, sorting, column visibility, chart config, join config */
    config: text("config"),
    isDefault: integer("is_default", { mode: "boolean" })
      .default(false)
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_user_table_views_table_id").on(table.tableId),
  ]
);

export const userTableRelationships = sqliteTable(
  "user_table_relationships",
  {
    id: text("id").primaryKey(),
    fromTableId: text("from_table_id")
      .references(() => userTables.id)
      .notNull(),
    fromColumn: text("from_column").notNull(),
    toTableId: text("to_table_id")
      .references(() => userTables.id)
      .notNull(),
    toColumn: text("to_column").notNull(),
    relationshipType: text("relationship_type", {
      enum: ["one_to_one", "one_to_many", "many_to_many"],
    }).notNull(),
    /** JSON config for display column, cascade behavior, etc. */
    config: text("config"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_user_table_rels_from").on(table.fromTableId),
    index("idx_user_table_rels_to").on(table.toTableId),
  ]
);

export const userTableTemplates = sqliteTable(
  "user_table_templates",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category", {
      enum: ["business", "personal", "pm", "finance", "content"],
    }).notNull(),
    /** JSON array of column definitions */
    columnSchema: text("column_schema").notNull(),
    /** JSON array of sample row data */
    sampleData: text("sample_data"),
    scope: text("scope", { enum: ["system", "user"] })
      .default("system")
      .notNull(),
    icon: text("icon"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_user_table_templates_category").on(table.category),
    index("idx_user_table_templates_scope").on(table.scope),
  ]
);

export const userTableImports = sqliteTable(
  "user_table_imports",
  {
    id: text("id").primaryKey(),
    tableId: text("table_id")
      .references(() => userTables.id)
      .notNull(),
    documentId: text("document_id").references(() => documents.id),
    /** Number of rows imported */
    rowCount: integer("row_count").default(0).notNull(),
    /** Number of rows that failed validation */
    errorCount: integer("error_count").default(0).notNull(),
    /** JSON array of error details */
    errors: text("errors"),
    status: text("status", { enum: ["pending", "completed", "failed"] })
      .default("pending")
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_user_table_imports_table_id").on(table.tableId),
  ]
);

// ── Table Junction Tables ───────────────────────────────────────────────

export const tableDocumentInputs = sqliteTable(
  "table_document_inputs",
  {
    id: text("id").primaryKey(),
    tableId: text("table_id")
      .references(() => userTables.id)
      .notNull(),
    documentId: text("document_id")
      .references(() => documents.id)
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_tdi_table").on(table.tableId),
    uniqueIndex("idx_tdi_table_doc").on(table.tableId, table.documentId),
  ]
);

export const taskTableInputs = sqliteTable(
  "task_table_inputs",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .references(() => tasks.id)
      .notNull(),
    tableId: text("table_id")
      .references(() => userTables.id)
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_tti_task").on(table.taskId),
    uniqueIndex("idx_tti_task_table").on(table.taskId, table.tableId),
  ]
);

export const workflowTableInputs = sqliteTable(
  "workflow_table_inputs",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id")
      .references(() => workflows.id)
      .notNull(),
    tableId: text("table_id")
      .references(() => userTables.id)
      .notNull(),
    /** null = table available to all steps; set = scoped to specific step */
    stepId: text("step_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_wti_workflow").on(table.workflowId),
    uniqueIndex("idx_wti_workflow_table_step").on(
      table.workflowId,
      table.tableId,
      table.stepId
    ),
  ]
);

export const scheduleTableInputs = sqliteTable(
  "schedule_table_inputs",
  {
    id: text("id").primaryKey(),
    scheduleId: text("schedule_id")
      .references(() => schedules.id)
      .notNull(),
    tableId: text("table_id")
      .references(() => userTables.id)
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_sti_schedule").on(table.scheduleId),
    uniqueIndex("idx_sti_schedule_table").on(
      table.scheduleId,
      table.tableId
    ),
  ]
);

// ── Table Workflow Triggers ──────────────────────────────────────────

export const userTableTriggers = sqliteTable(
  "user_table_triggers",
  {
    id: text("id").primaryKey(),
    tableId: text("table_id")
      .references(() => userTables.id)
      .notNull(),
    name: text("name").notNull(),
    triggerEvent: text("trigger_event", {
      enum: ["row_added", "row_updated", "row_deleted"],
    }).notNull(),
    /** JSON condition using filter format (null = always fire) */
    condition: text("condition"),
    actionType: text("action_type", {
      enum: ["run_workflow", "create_task"],
    }).notNull(),
    /** JSON config: { workflowId } or { title, description, projectId } */
    actionConfig: text("action_config").notNull(),
    status: text("status", { enum: ["active", "paused"] })
      .default("active")
      .notNull(),
    fireCount: integer("fire_count").default(0).notNull(),
    lastFiredAt: integer("last_fired_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_user_table_triggers_table_id").on(table.tableId),
    index("idx_user_table_triggers_status").on(table.status),
  ]
);

// ── Table Row Version History ────────────────────────────────────────

export const userTableRowHistory = sqliteTable(
  "user_table_row_history",
  {
    id: text("id").primaryKey(),
    rowId: text("row_id").notNull(),
    tableId: text("table_id")
      .references(() => userTables.id)
      .notNull(),
    /** JSON snapshot of the row data before the change */
    previousData: text("previous_data").notNull(),
    changedBy: text("changed_by").default("user"),
    changeType: text("change_type", { enum: ["update", "delete"] }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_row_history_row_id").on(table.rowId),
    index("idx_row_history_table_id").on(table.tableId),
    index("idx_row_history_created_at").on(table.createdAt),
  ]
);

// Shared types derived from schema — use these in components instead of `as any`
export type CustomerRow = InferSelectModel<typeof customers>;
export type ProjectRow = InferSelectModel<typeof projects>;
export type TaskRow = InferSelectModel<typeof tasks>;
export type WorkflowRow = InferSelectModel<typeof workflows>;
export type AgentLogRow = InferSelectModel<typeof agentLogs>;
export type NotificationRow = InferSelectModel<typeof notifications>;
export type DocumentRow = InferSelectModel<typeof documents>;
export type ScheduleRow = InferSelectModel<typeof schedules>;
export type SettingsRow = InferSelectModel<typeof settings>;
export type LearnedContextRow = InferSelectModel<typeof learnedContext>;
export type AgentMemoryRow = InferSelectModel<typeof agentMemory>;
export type UsageLedgerRow = InferSelectModel<typeof usageLedger>;
export type ViewRow = InferSelectModel<typeof views>;
export type EnvironmentScanRow = InferSelectModel<typeof environmentScans>;
export type EnvironmentArtifactRow = InferSelectModel<typeof environmentArtifacts>;
export type EnvironmentCheckpointRow = InferSelectModel<typeof environmentCheckpoints>;
export type EnvironmentSyncOpRow = InferSelectModel<typeof environmentSyncOps>;
export type EnvironmentTemplateRow = InferSelectModel<typeof environmentTemplates>;
export type ConversationRow = InferSelectModel<typeof conversations>;
export type ChatMessageRow = InferSelectModel<typeof chatMessages>;
export type ProfileTestResultRow = InferSelectModel<typeof profileTestResults>;
export type RepoImportRow = InferSelectModel<typeof repoImports>;
export type AgentMessageRow = InferSelectModel<typeof agentMessages>;
export type UserTableRow = InferSelectModel<typeof userTables>;
export type UserTableColumnRow = InferSelectModel<typeof userTableColumns>;
export type UserTableRowRow = InferSelectModel<typeof userTableRows>;
export type UserTableViewRow = InferSelectModel<typeof userTableViews>;
export type UserTableRelationshipRow = InferSelectModel<typeof userTableRelationships>;
export type UserTableTemplateRow = InferSelectModel<typeof userTableTemplates>;
export type UserTableImportRow = InferSelectModel<typeof userTableImports>;
export type TableDocumentInputRow = InferSelectModel<typeof tableDocumentInputs>;
export type TaskTableInputRow = InferSelectModel<typeof taskTableInputs>;
export type WorkflowTableInputRow = InferSelectModel<typeof workflowTableInputs>;
export type ScheduleTableInputRow = InferSelectModel<typeof scheduleTableInputs>;
export type UserTableTriggerRow = InferSelectModel<typeof userTableTriggers>;
export type UserTableRowHistoryRow = InferSelectModel<typeof userTableRowHistory>;

// ── Snapshots ──────────────────────────────────────────────────────────

export const snapshots = sqliteTable(
  "snapshots",
  {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    type: text("type", { enum: ["manual", "auto"] })
      .default("manual")
      .notNull(),
    status: text("status", { enum: ["in_progress", "completed", "failed"] })
      .default("in_progress")
      .notNull(),
    filePath: text("file_path").notNull(),
    sizeBytes: integer("size_bytes").default(0).notNull(),
    dbSizeBytes: integer("db_size_bytes").default(0).notNull(),
    filesSizeBytes: integer("files_size_bytes").default(0).notNull(),
    fileCount: integer("file_count").default(0).notNull(),
    error: text("error"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_snapshots_type").on(table.type),
    index("idx_snapshots_created_at").on(table.createdAt),
  ]
);

export type SnapshotRow = InferSelectModel<typeof snapshots>;

// ── Workflow Execution Stats ─────────────────────────────────────────

export const workflowExecutionStats = sqliteTable("workflow_execution_stats", {
  id: text("id").primaryKey(),
  /** Workflow pattern: sequence, parallel, swarm, etc. */
  pattern: text("pattern").notNull(),
  /** Number of steps in the workflow */
  stepCount: integer("step_count").notNull(),
  /** Average documents injected per step */
  avgDocsPerStep: real("avg_docs_per_step"),
  /** Average cost per step in microdollars */
  avgCostPerStepMicros: integer("avg_cost_per_step_micros"),
  /** Average duration per step in milliseconds */
  avgDurationPerStepMs: integer("avg_duration_per_step_ms"),
  /** Success rate (0.0 to 1.0) */
  successRate: real("success_rate"),
  /** JSON: common failure types and counts, e.g., {"budget_exceeded": 4, "timeout": 1} */
  commonFailures: text("common_failures"),
  /** JSON: per-runtime success rates, e.g., {"claude-code": 0.92, "openai-direct": 0.71} */
  runtimeBreakdown: text("runtime_breakdown"),
  /** Number of workflow runs included in these stats */
  sampleCount: integer("sample_count").notNull().default(0),
  lastUpdated: text("last_updated").notNull(),
  createdAt: text("created_at").notNull(),
});

export type WorkflowExecutionStatsRow = InferSelectModel<typeof workflowExecutionStats>;

// ── Schedule Firing Metrics ───────────────────────────────────────────

export const scheduleFiringMetrics = sqliteTable(
  "schedule_firing_metrics",
  {
    id: text("id").primaryKey(),
    scheduleId: text("schedule_id")
      .references(() => schedules.id)
      .notNull(),
    taskId: text("task_id").references(() => tasks.id),
    firedAt: integer("fired_at", { mode: "timestamp" }).notNull(),
    slotClaimedAt: integer("slot_claimed_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    slotWaitMs: integer("slot_wait_ms"),
    durationMs: integer("duration_ms"),
    turnCount: integer("turn_count"),
    maxTurnsAtFiring: integer("max_turns_at_firing"),
    eventLoopLagMs: real("event_loop_lag_ms"),
    peakRssMb: integer("peak_rss_mb"),
    chatStreamsActive: integer("chat_streams_active"),
    concurrentSchedules: integer("concurrent_schedules"),
    failureReason: text("failure_reason"),
  },
  (table) => [
    index("idx_sfm_schedule_time").on(table.scheduleId, table.firedAt),
  ]
);

export type ScheduleFiringMetricRow = InferSelectModel<typeof scheduleFiringMetrics>;
