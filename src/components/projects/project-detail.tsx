"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { ClipboardList, ChevronDown, ChevronRight, GitBranch } from "lucide-react";
import { taskStatusVariant } from "@/lib/constants/status-colors";
import { SectionHeading } from "@/components/shared/section-heading";

interface Task {
  id: string;
  title: string;
  status: string;
  priority: number;
  description: string | null;
  workflowId: string | null;
  workflowName: string | null;
  workflowStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProjectDetailClientProps {
  tasks: Task[];
  projectId: string;
}

interface WorkflowGroup {
  workflowId: string;
  workflowName: string;
  workflowStatus: string;
  tasks: Task[];
}

const priorityLabels = ["P0", "P1", "P2", "P3"];

function TaskCard({ task }: { task: Task }) {
  const router = useRouter();

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/tasks/${task.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/tasks/${task.id}`);
        }
      }}
    >
      <Card className="p-3 transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-muted-foreground w-6">
            {priorityLabels[task.priority] ?? "P3"}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium truncate">{task.title}</p>
              {task.workflowId && task.workflowName && (
                <Link
                  href={`/workflows/${task.workflowId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0"
                >
                  <Badge variant="outline" className="text-[10px] gap-1 hover:bg-accent">
                    <GitBranch className="h-2.5 w-2.5" />
                    {task.workflowName}
                  </Badge>
                </Link>
              )}
            </div>
            {task.description && (
              <p className="text-xs text-muted-foreground truncate">
                {task.description}
              </p>
            )}
          </div>
          <Badge variant={taskStatusVariant[task.status] ?? "secondary"} className="text-xs">
            {task.status}
          </Badge>
        </div>
      </Card>
    </div>
  );
}

function WorkflowGroupSection({ group }: { group: WorkflowGroup }) {
  const isCompleted = group.workflowStatus === "completed";
  const [collapsed, setCollapsed] = useState(isCompleted);

  return (
    <div className="space-y-2">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full text-left group"
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
        <Link
          href={`/workflows/${group.workflowId}`}
          onClick={(e) => e.stopPropagation()}
          className="text-sm font-medium hover:underline"
        >
          {group.workflowName}
        </Link>
        <Badge
          variant={taskStatusVariant[group.workflowStatus] ?? "secondary"}
          className="text-[10px]"
        >
          {group.workflowStatus}
        </Badge>
        <span className="text-xs text-muted-foreground ml-auto">
          {group.tasks.length} task{group.tasks.length !== 1 ? "s" : ""}
        </span>
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-2 pl-5 border-l border-border ml-1.5">
          {group.tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProjectDetailClient({ tasks }: ProjectDetailClientProps) {
  const { standaloneTasks, workflowGroups } = useMemo(() => {
    const standalone: Task[] = [];
    const groupMap = new Map<string, WorkflowGroup>();

    for (const task of tasks) {
      if (!task.workflowId) {
        standalone.push(task);
      } else {
        const existing = groupMap.get(task.workflowId);
        if (existing) {
          existing.tasks.push(task);
        } else {
          groupMap.set(task.workflowId, {
            workflowId: task.workflowId,
            workflowName: task.workflowName ?? "Unnamed Workflow",
            workflowStatus: task.workflowStatus ?? "draft",
            tasks: [task],
          });
        }
      }
    }

    return {
      standaloneTasks: standalone,
      workflowGroups: Array.from(groupMap.values()),
    };
  }, [tasks]);

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        heading="No tasks yet"
        description="Create a task and assign it to this project."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Standalone Tasks */}
      {standaloneTasks.length > 0 && (
        <div>
          <SectionHeading>Standalone Tasks ({standaloneTasks.length})</SectionHeading>
          <div className="flex flex-col gap-3">
            {standaloneTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </div>
      )}

      {/* Workflow Tasks */}
      {workflowGroups.length > 0 && (
        <div>
          <SectionHeading>Workflow Tasks</SectionHeading>
          <div className="flex flex-col gap-4">
            {workflowGroups.map((group) => (
              <WorkflowGroupSection key={group.workflowId} group={group} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
