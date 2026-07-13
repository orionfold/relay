import { Badge } from "@/components/ui/badge";
import {
  Circle,
  ArrowUp,
  ArrowDown,
  Minus,
  ArrowDownLeft,
  ArrowUpRight,
  DollarSign,
  Timer,
  Cpu,
  Paperclip,
  CalendarClock,
  CalendarCheck,
  AlertTriangle,
} from "lucide-react";
import { taskStatusVariant } from "@/lib/constants/status-colors";
import { formatCompactDateTime } from "@/lib/utils/format-timestamp";
import { TaskBentoCell } from "./task-bento-cell";
import type { TaskItem } from "./task-card";
import type { DocumentRow } from "@/lib/db/schema";
import { getRuntimeCatalogEntry } from "@/lib/agents/runtime/catalog";

const priorityConfig: Record<number, { icon: typeof ArrowUp; label: string }> = {
  0: { icon: ArrowUp, label: "P0 Critical" },
  1: { icon: ArrowUp, label: "P1 High" },
  2: { icon: Minus, label: "P2 Medium" },
  3: { icon: ArrowDown, label: "P3 Low" },
};

const statusColorMap: Record<string, string> = {
  planned: "text-muted-foreground",
  queued: "text-muted-foreground",
  running: "text-status-running",
  completed: "text-status-completed",
  failed: "text-destructive",
  cancelled: "text-muted-foreground",
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(micros: number): string {
  const dollars = micros / 1_000_000;
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  if (dollars < 1) return `$${dollars.toFixed(3)}`;
  return `$${dollars.toFixed(2)}`;
}

function formatDuration(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 0) return "0s";
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remainSecs}s`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
}

function truncateModel(modelId: string): string {
  // "claude-sonnet-4-20250514" -> "claude-sonnet-4"
  return modelId.replace(/-\d{8}$/, "");
}

interface TaskBentoGridProps {
  task: TaskItem;
  docs: DocumentRow[];
}

export function TaskBentoGrid({ task, docs }: TaskBentoGridProps) {
  const usage = task.usage;
  const usageIsPartial = usage?.completeness === "partial";
  const usageIsUnavailable = usage?.completeness === "unavailable";
  const usagePrefix = usageIsPartial ? "≥" : "";
  const costPrefix = usageIsPartial && !usage?.providerReportedCost ? "≥" : "";
  const priority = priorityConfig[task.priority] ?? priorityConfig[2];
  const PriorityIcon = priority.icon;

  const inputDocs = docs.filter((d) => d.direction === "input");
  const outputDocs = docs.filter((d) => d.direction === "output");
  const modelId = task.effectiveModelId ?? usage?.modelId ?? null;
  const docSummary =
    inputDocs.length > 0 && outputDocs.length > 0
      ? `${inputDocs.length} in / ${outputDocs.length} out`
      : inputDocs.length > 0
        ? `${inputDocs.length} input`
        : `${outputDocs.length} output`;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {/* Always shown */}
      <TaskBentoCell
        icon={Circle}
        iconClassName={statusColorMap[task.status]}
        label="Status"
        value={
          <Badge variant={taskStatusVariant[task.status] ?? "secondary"} className="text-xs">
            {task.status}
          </Badge>
        }
      />

      <TaskBentoCell
        icon={PriorityIcon}
        label="Priority"
        value={priority.label}
      />

      {/* Usage-dependent cells */}
      {usage?.inputTokens != null && (
        <TaskBentoCell
          icon={ArrowDownLeft}
          label="Input Tokens"
          value={`${usagePrefix}${formatTokens(usage.inputTokens)}`}
        />
      )}

      {usage?.outputTokens != null && (
        <TaskBentoCell
          icon={ArrowUpRight}
          label="Output Tokens"
          value={`${usagePrefix}${formatTokens(usage.outputTokens)}`}
        />
      )}

      {usage?.costMicros != null && (
        <TaskBentoCell
          icon={DollarSign}
          label={
            usage.providerReportedCost
              ? "Reported Cost"
              : usageIsPartial
                ? "Known Cost"
                : "Est. Cost"
          }
          value={`${costPrefix}${formatCost(usage.costMicros)}`}
        />
      )}

      {(usageIsPartial || usageIsUnavailable) && (
        <TaskBentoCell
          icon={AlertTriangle}
          iconClassName="text-status-warning"
          label="Usage Receipt"
          value={usageIsPartial ? "Partial" : "Unavailable"}
          subLabel={
            usageIsPartial
              ? usage.providerReportedCost
                ? "Token/model detail is partial; cost is runtime-reported."
                : "Known minimum; delegated usage may be missing."
              : "The runtime returned no accountable usage."
          }
        />
      )}

      {usage?.startedAt && (
        <TaskBentoCell
          icon={CalendarClock}
          label="Started At"
          value={formatCompactDateTime(usage.startedAt)}
        />
      )}

      {usage?.finishedAt && (
        <TaskBentoCell
          icon={CalendarCheck}
          label="Finished At"
          value={formatCompactDateTime(usage.finishedAt)}
        />
      )}

      {usage?.startedAt && usage?.finishedAt && (
        <TaskBentoCell
          icon={Timer}
          label="Duration"
          value={formatDuration(usage.startedAt, usage.finishedAt)}
        />
      )}

      {task.effectiveRuntimeId && (
        <TaskBentoCell
          icon={Cpu}
          label="Runtime Used"
          value={getRuntimeCatalogEntry(task.effectiveRuntimeId as never).label}
        />
      )}

      {modelId && (
        <TaskBentoCell
          icon={Cpu}
          label="Model"
          value={<span className="text-sm font-semibold">{truncateModel(modelId)}</span>}
        />
      )}

      {docs.length > 0 && (
        <TaskBentoCell
          icon={Paperclip}
          label="Documents"
          value={docSummary}
        />
      )}
    </div>
  );
}
