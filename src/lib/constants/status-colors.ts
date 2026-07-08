/**
 * Shared status-to-badge-variant mappings.
 * Single source of truth — consumed by every component that renders status badges.
 */

export const taskStatusVariant: Record<string, "default" | "secondary" | "destructive" | "outline" | "success"> = {
  planned: "outline",
  queued: "secondary",
  running: "default",
  completed: "success",
  failed: "destructive",
  cancelled: "secondary",
};

export const projectStatusVariant: Record<string, "default" | "secondary" | "outline"> = {
  active: "default",
  paused: "secondary",
  completed: "outline",
};

export const workflowStatusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  active: "default",
  running: "default",
  waiting: "secondary",
  stalled: "secondary",
  paused: "secondary",
  completed: "default",
  failed: "destructive",
};

export const scheduleStatusVariant: Record<string, "default" | "secondary" | "destructive" | "outline" | "success"> = {
  active: "default",
  paused: "secondary",
  completed: "success",
  expired: "outline",
};

export const patternLabels: Record<string, string> = {
  single: "Single Task",
  sequence: "Sequence",
  "planner-executor": "Planner → Executor",
  checkpoint: "Human-in-the-Loop",
  loop: "Autonomous Loop",
  parallel: "Parallel Research",
  swarm: "Multi-Agent Swarm",
};
