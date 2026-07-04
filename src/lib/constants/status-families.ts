/**
 * Status Families — 5 orthogonal status dimensions for ainative entities.
 * Each status maps to: label, Lucide icon name, semantic color token, badge variant.
 *
 * Used by the StatusChip component for unified rendering.
 */

import type { LucideIcon } from "lucide-react";
import {
  Circle,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  Pause,
  Ban,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  MessageSquare,
  Cpu,
  Zap,
  Layers,
  Eye,
  GitBranch,
  BotIcon,
  Play,
  Timer,
  CalendarX,
  CalendarCheck,
} from "lucide-react";

export type StatusFamily = "lifecycle" | "governance" | "runtime" | "risk" | "schedule";

export interface StatusDefinition {
  label: string;
  icon: LucideIcon;
  colorToken: string;
  badgeVariant: "default" | "secondary" | "destructive" | "outline" | "success";
  /** Whether to show a pulse/live indicator */
  live?: boolean;
}

// Neutral, non-pulsing surface token (used by planned/ready idle states).
const MUTED = "muted-foreground";

// ── Lifecycle statuses ───────────────────────────────────────────
export const lifecycleStatuses: Record<string, StatusDefinition> = {
  planned: {
    label: "Planned",
    icon: Circle,
    colorToken: MUTED,
    badgeVariant: "outline",
  },
  // BUG-2: installed & healthy with nothing in flight. Calm, NON-pulsing —
  // an idle app must not show the green "Running" ping. Neutral (muted) reads
  // as "steady/ready", not a success/completion state.
  ready: {
    label: "Ready",
    icon: CheckCircle2,
    colorToken: MUTED,
    badgeVariant: "outline",
  },
  queued: {
    label: "Queued",
    icon: Clock,
    colorToken: "muted-foreground",
    badgeVariant: "secondary",
  },
  running: {
    label: "Running",
    icon: Loader2,
    colorToken: "status-running",
    badgeVariant: "default",
    live: true,
  },
  active: {
    label: "Active",
    icon: Play,
    colorToken: "status-running",
    badgeVariant: "default",
    live: true,
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    colorToken: "status-completed",
    badgeVariant: "success",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    colorToken: "status-failed",
    badgeVariant: "destructive",
  },
  paused: {
    label: "Paused",
    icon: Pause,
    colorToken: "status-warning",
    badgeVariant: "secondary",
  },
  cancelled: {
    label: "Cancelled",
    icon: Ban,
    colorToken: "muted-foreground",
    badgeVariant: "secondary",
  },
  draft: {
    label: "Draft",
    icon: Circle,
    colorToken: "muted-foreground",
    badgeVariant: "outline",
  },
};

// ── Governance statuses ──────────────────────────────────────────
export const governanceStatuses: Record<string, StatusDefinition> = {
  pending_approval: {
    label: "Pending Approval",
    icon: ShieldAlert,
    colorToken: "status-warning",
    badgeVariant: "outline",
    live: true,
  },
  approved: {
    label: "Approved",
    icon: ShieldCheck,
    colorToken: "status-completed",
    badgeVariant: "success",
  },
  denied: {
    label: "Denied",
    icon: ShieldX,
    colorToken: "status-failed",
    badgeVariant: "destructive",
  },
  needs_input: {
    label: "Needs Input",
    icon: MessageSquare,
    colorToken: "status-warning",
    badgeVariant: "outline",
    live: true,
  },
};

// ── Runtime statuses ─────────────────────────────────────────────
export const runtimeStatuses: Record<string, StatusDefinition> = {
  claude: {
    label: "Claude",
    icon: Cpu,
    colorToken: "primary",
    badgeVariant: "default",
  },
  codex: {
    label: "Codex",
    icon: Zap,
    colorToken: "primary",
    badgeVariant: "default",
  },
  hybrid: {
    label: "Hybrid",
    icon: Layers,
    colorToken: "primary",
    badgeVariant: "secondary",
  },
};

// ── Risk tier statuses ───────────────────────────────────────────
export const riskStatuses: Record<string, StatusDefinition> = {
  read_only: {
    label: "Read Only",
    icon: Eye,
    colorToken: "status-completed",
    badgeVariant: "outline",
  },
  git_safe: {
    label: "Git Safe",
    icon: GitBranch,
    colorToken: "status-warning",
    badgeVariant: "secondary",
  },
  full_auto: {
    label: "Full Auto",
    icon: BotIcon,
    colorToken: "status-failed",
    badgeVariant: "destructive",
  },
};

// ── Schedule statuses ────────────────────────────────────────────
export const scheduleStatuses: Record<string, StatusDefinition> = {
  active: {
    label: "Active",
    icon: Timer,
    colorToken: "status-running",
    badgeVariant: "default",
    live: true,
  },
  paused: {
    label: "Paused",
    icon: Pause,
    colorToken: "status-warning",
    badgeVariant: "secondary",
  },
  completed: {
    label: "Completed",
    icon: CalendarCheck,
    colorToken: "status-completed",
    badgeVariant: "success",
  },
  expired: {
    label: "Expired",
    icon: CalendarX,
    colorToken: "muted-foreground",
    badgeVariant: "outline",
  },
};

// ── Lookup ───────────────────────────────────────────────────────
const familyMap: Record<StatusFamily, Record<string, StatusDefinition>> = {
  lifecycle: lifecycleStatuses,
  governance: governanceStatuses,
  runtime: runtimeStatuses,
  risk: riskStatuses,
  schedule: scheduleStatuses,
};

/**
 * Look up a status definition by family and status key.
 * Returns undefined if not found.
 */
export function getStatusDef(
  family: StatusFamily,
  status: string
): StatusDefinition | undefined {
  return familyMap[family]?.[status];
}

/**
 * Auto-detect which family a status belongs to.
 * Checks lifecycle first (most common), then governance, schedule, runtime, risk.
 */
export function autoDetectFamily(status: string): StatusFamily | undefined {
  if (lifecycleStatuses[status]) return "lifecycle";
  if (governanceStatuses[status]) return "governance";
  if (scheduleStatuses[status]) return "schedule";
  if (runtimeStatuses[status]) return "runtime";
  if (riskStatuses[status]) return "risk";
  return undefined;
}
