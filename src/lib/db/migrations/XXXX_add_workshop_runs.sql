CREATE TABLE IF NOT EXISTS `workshop_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `edition_id` text NOT NULL,
  `edition_version` text NOT NULL,
  `edition_hash` text NOT NULL,
  `status` text DEFAULT 'ready' NOT NULL,
  `checkpoint_state` text DEFAULT '{}' NOT NULL,
  `project_id` text,
  `app_id` text,
  `workflow_id` text,
  `receipt_id` text,
  `fallback_used` integer DEFAULT 0 NOT NULL,
  `last_error_code` text,
  `last_error_message` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `completed_at` integer,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`receipt_id`) REFERENCES `operations_receipts`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE INDEX IF NOT EXISTS `idx_workshop_runs_edition`
  ON `workshop_runs` (`edition_id`, `edition_version`);
CREATE INDEX IF NOT EXISTS `idx_workshop_runs_status`
  ON `workshop_runs` (`status`);
