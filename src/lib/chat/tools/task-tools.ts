import { defineTool } from "../tool-registry";
import { z } from "zod";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { ok, err, resolveEntityId, type ToolContext } from "./helpers";
import {
  isAgentRuntimeId,
  SUPPORTED_AGENT_RUNTIMES,
} from "@/lib/agents/runtime/catalog";
import { getProfile, listProfiles } from "@/lib/agents/profiles/registry";

const VALID_TASK_STATUSES = [
  "planned",
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

/**
 * Zod refinement shared by create_task and update_task for the agentProfile
 * field. Returns true for valid registered profile IDs. The error message
 * lists a truncated sample of valid IDs from the registry so operators can
 * self-correct without cross-referencing docs.
 */
function isValidAgentProfile(id: string): boolean {
  return getProfile(id) !== undefined;
}

function agentProfileErrorMessage(invalid: string): string {
  const valid = listProfiles()
    .map((p) => p.id)
    .sort();
  const sample = valid.slice(0, 8).join(", ");
  const more = valid.length > 8 ? `, and ${valid.length - 8} more` : "";
  return `Invalid agentProfile "${invalid}". Valid profiles: ${sample}${more}. Run list_profiles (or inspect ~/.claude/skills/) to see the full set.`;
}

export function taskTools(ctx: ToolContext) {
  return [
    defineTool(
      "list_tasks",
      "List tasks, optionally filtered by project or status. If a project is active in this conversation, tasks are scoped to it by default.",
      {
        projectId: z
          .string()
          .optional()
          .describe(
            "Filter by project ID. Omit to use the active project (if any)."
          ),
        status: z
          .enum(VALID_TASK_STATUSES)
          .optional()
          .describe("Filter by task status"),
      },
      async (args) => {
        try {
          const effectiveProjectId = args.projectId ?? ctx.projectId ?? undefined;
          const conditions = [];
          if (effectiveProjectId)
            conditions.push(eq(tasks.projectId, effectiveProjectId));
          if (args.status) conditions.push(eq(tasks.status, args.status));

          const result = await db
            .select()
            .from(tasks)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(tasks.priority, desc(tasks.createdAt))
            .limit(50);

          if (result.length === 0 && effectiveProjectId) {
            return ok({
              tasks: [],
              note: `No tasks found in project ${effectiveProjectId}. ` +
                `Use projectId: null to list tasks from any project, ` +
                `or get_task <id> to look up a specific task directly.`,
            });
          }
          return ok(result);
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to list tasks");
        }
      }
    ),

    defineTool(
      "create_task",
      "Create a new task record in ainative. Use this when the user asks to create, add, or plan a task.",
      {
        title: z.string().min(1).max(200).describe("Task title"),
        description: z
          .string()
          .max(2000)
          .optional()
          .describe("Task description with details about what needs to be done"),
        projectId: z
          .string()
          .optional()
          .describe(
            "Project ID to assign the task to. Omit to use the active project."
          ),
        priority: z
          .number()
          .min(0)
          .max(3)
          .optional()
          .describe(
            "Priority: 0 = critical, 1 = high, 2 = medium (default), 3 = low"
          ),
        assignedAgent: z
          .string()
          .optional()
          .describe(
            `Runtime ID: ${SUPPORTED_AGENT_RUNTIMES.join(", ")}`
          ),
        agentProfile: z
          .string()
          .refine(isValidAgentProfile, {
            message: "Invalid agentProfile (not in profile registry). See list_profiles.",
          })
          .optional()
          .describe(
            "Agent profile ID (e.g. general, code-reviewer, researcher). Validated against the profile registry."
          ),
      },
      async (args) => {
        try {
          if (args.agentProfile !== undefined && !isValidAgentProfile(args.agentProfile)) {
            return err(agentProfileErrorMessage(args.agentProfile));
          }
          if (args.assignedAgent && !isAgentRuntimeId(args.assignedAgent)) {
            return err(
              `Invalid runtime "${args.assignedAgent}". Valid: ${SUPPORTED_AGENT_RUNTIMES.join(", ")}`
            );
          }

          const effectiveProjectId = args.projectId ?? ctx.projectId ?? null;
          const now = new Date();
          const id = crypto.randomUUID();

          await db.insert(tasks).values({
            id,
            title: args.title,
            description: args.description ?? null,
            projectId: effectiveProjectId,
            priority: args.priority ?? 2,
            status: "planned",
            assignedAgent: args.assignedAgent ?? null,
            agentProfile: args.agentProfile ?? null,
            createdAt: now,
            updatedAt: now,
          });

          const [task] = await db
            .select()
            .from(tasks)
            .where(eq(tasks.id, id));

          ctx.onToolResult?.("create_task", task);
          return ok(task);
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to create task");
        }
      }
    ),

    defineTool(
      "update_task",
      "Update an existing task's status, title, description, priority, runtime, or profile.",
      {
        taskId: z.string().describe("The task ID to update"),
        title: z.string().min(1).max(200).optional().describe("New title"),
        description: z
          .string()
          .max(2000)
          .optional()
          .describe("New description"),
        status: z
          .enum(VALID_TASK_STATUSES)
          .optional()
          .describe("New status"),
        priority: z
          .number()
          .min(0)
          .max(3)
          .optional()
          .describe("New priority (0-3)"),
        assignedAgent: z
          .string()
          .optional()
          .describe(
            `Runtime ID: ${SUPPORTED_AGENT_RUNTIMES.join(", ")}`
          ),
        agentProfile: z
          .string()
          .refine(isValidAgentProfile, {
            message: "Invalid agentProfile (not in profile registry). See list_profiles.",
          })
          .optional()
          .describe(
            "Agent profile ID (e.g. general, code-reviewer, researcher). Validated against the profile registry."
          ),
      },
      async (args) => {
        try {
          const resolved = await resolveEntityId(tasks, tasks.id, args.taskId);
          if ("error" in resolved) return err(resolved.error);
          const taskId = resolved.id;

          if (args.agentProfile !== undefined && !isValidAgentProfile(args.agentProfile)) {
            return err(agentProfileErrorMessage(args.agentProfile));
          }
          if (args.assignedAgent && !isAgentRuntimeId(args.assignedAgent)) {
            return err(
              `Invalid runtime "${args.assignedAgent}". Valid: ${SUPPORTED_AGENT_RUNTIMES.join(", ")}`
            );
          }

          const existing = await db
            .select()
            .from(tasks)
            .where(eq(tasks.id, taskId))
            .get();

          if (!existing) return err(`Task not found: ${taskId}`);

          const updates: Record<string, unknown> = { updatedAt: new Date() };
          if (args.title !== undefined) updates.title = args.title;
          if (args.description !== undefined)
            updates.description = args.description;
          if (args.status !== undefined) updates.status = args.status;
          if (args.priority !== undefined) updates.priority = args.priority;
          if (args.assignedAgent !== undefined)
            updates.assignedAgent = args.assignedAgent;
          if (args.agentProfile !== undefined)
            updates.agentProfile = args.agentProfile;

          await db
            .update(tasks)
            .set(updates)
            .where(eq(tasks.id, taskId));

          const [task] = await db
            .select()
            .from(tasks)
            .where(eq(tasks.id, taskId));

          ctx.onToolResult?.("update_task", task);
          return ok(task);
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to update task");
        }
      }
    ),

    defineTool(
      "get_task",
      "Get full details for a specific task by ID.",
      {
        taskId: z.string().describe("The task ID to look up"),
      },
      async (args) => {
        try {
          const resolved = await resolveEntityId(tasks, tasks.id, args.taskId);
          if ("error" in resolved) return err(resolved.error);
          const taskId = resolved.id;

          const task = await db
            .select()
            .from(tasks)
            .where(eq(tasks.id, taskId))
            .get();

          if (!task) return err(`Task not found: ${taskId}`);
          ctx.onToolResult?.("get_task", task);
          return ok(task);
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to get task");
        }
      }
    ),

    defineTool(
      "execute_task",
      `Queue and execute a task with an AI agent. Returns immediately — execution runs in the background. Requires approval. Valid runtime IDs: ${SUPPORTED_AGENT_RUNTIMES.join(", ")}.`,
      {
        taskId: z.string().describe("The task ID to execute"),
        assignedAgent: z
          .string()
          .optional()
          .describe(
            `Runtime ID: ${SUPPORTED_AGENT_RUNTIMES.join(", ")}. Defaults to the task's assigned runtime, or the configured automatic routing policy when unset.`
          ),
      },
      async (args) => {
        try {
          const resolved = await resolveEntityId(tasks, tasks.id, args.taskId);
          if ("error" in resolved) return err(resolved.error);
          const taskId = resolved.id;

          if (args.assignedAgent && !isAgentRuntimeId(args.assignedAgent)) {
            return err(
              `Invalid runtime "${args.assignedAgent}". Valid: ${SUPPORTED_AGENT_RUNTIMES.join(", ")}`
            );
          }

          const task = await db
            .select()
            .from(tasks)
            .where(eq(tasks.id, taskId))
            .get();

          if (!task) return err(`Task not found: ${taskId}`);
          if (task.status === "running") return err("Task is already running");

          if (task.agentProfile && !isValidAgentProfile(task.agentProfile)) {
            return err(
              `Task ${taskId} has an invalid agentProfile "${task.agentProfile}" (not in profile registry). ` +
              `Fix with update_task { taskId, agentProfile: "<valid-id>" } before retrying. ` +
              agentProfileErrorMessage(task.agentProfile).split(". ").slice(1).join(". ")
            );
          }

          const runtimeId = args.assignedAgent ?? task.assignedAgent ?? null;

          // Set status to queued
          await db
            .update(tasks)
            .set({ status: "queued", assignedAgent: runtimeId, updatedAt: new Date() })
            .where(eq(tasks.id, taskId));

          // Fire-and-forget execution
          const { executeTaskWithAgent } = await import("@/lib/agents/router");
          executeTaskWithAgent(taskId, runtimeId).catch(() => {});

          ctx.onToolResult?.("execute_task", { id: taskId, title: task.title });
          return ok({
            message: "Execution started",
            taskId,
            runtime: runtimeId ?? "automatic",
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to execute task");
        }
      }
    ),

    defineTool(
      "cancel_task",
      "Cancel a running task. Requires approval.",
      {
        taskId: z.string().describe("The task ID to cancel"),
      },
      async (args) => {
        try {
          const resolved = await resolveEntityId(tasks, tasks.id, args.taskId);
          if ("error" in resolved) return err(resolved.error);
          const taskId = resolved.id;

          const task = await db
            .select()
            .from(tasks)
            .where(eq(tasks.id, taskId))
            .get();

          if (!task) return err(`Task not found: ${taskId}`);
          if (task.status !== "running") return err(`Task is not running (status: ${task.status})`);

          const { getExecution } = await import("@/lib/agents/execution-manager");
          const execution = getExecution(taskId);
          if (execution?.abortController) {
            execution.abortController.abort();
          }

          await db
            .update(tasks)
            .set({ status: "cancelled", updatedAt: new Date() })
            .where(eq(tasks.id, taskId));

          return ok({ message: "Task cancelled", taskId });
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to cancel task");
        }
      }
    ),
  ];
}
