import { defineTool } from "../tool-registry";
import { z } from "zod";
import { db } from "@/lib/db";
import { schedules } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { ok, err, resolveEntityId, type ToolContext } from "./helpers";
import { analyzePromptEfficiency } from "@/lib/schedules/prompt-analyzer";
import {
  SuccessCriteriaSchema,
  serializeSuccessCriteria,
} from "@/lib/operations/criteria";

const VALID_SCHEDULE_STATUSES = [
  "active",
  "paused",
  "completed",
  "expired",
] as const;

export function scheduleTools(ctx: ToolContext) {
  return [
    defineTool(
      "list_schedules",
      "List all scheduled prompt loops, optionally filtered by status.",
      {
        status: z
          .enum(VALID_SCHEDULE_STATUSES)
          .optional()
          .describe("Filter by schedule status"),
      },
      async (args) => {
        try {
          const conditions = [];
          if (args.status) conditions.push(eq(schedules.status, args.status));

          const result = await db
            .select()
            .from(schedules)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(schedules.updatedAt))
            .limit(50);

          return ok(result);
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to list schedules");
        }
      }
    ),

    defineTool(
      "create_schedule",
      `Create a new scheduled recurring task. The interval is parsed in this order:
  1. Natural language (e.g. "every 30 minutes", "hourly", "daily at 9am", "weekdays at 4:30pm", "every Monday at 9am")
  2. Shorthand (e.g. "5m", "2h", "1d")
  3. Raw 5-field cron (e.g. "30 16 * * 1-5" for 4:30pm on weekdays)

If your phrasing fails the first two layers, fall back to a 5-field cron expression (minute hour day-of-month month day-of-week). Avoid 6-field cron with seconds — the parser does not accept it.

When creating a schedule as part of an app composition, pass appId so the schedule is linked to the app project and listed in the app manifest.`,
      {
        name: z.string().min(1).max(200).describe("Schedule name"),
        prompt: z.string().min(1).max(2000).describe("The prompt to execute on each firing"),
        interval: z
          .string()
          .min(1)
          .describe(
            'Interval in NL ("every 30 minutes", "daily at 9am"), shorthand ("5m", "2h", "1d"), or 5-field cron ("30 16 * * 1-5"). 6-field cron with seconds is not supported.'
          ),
        projectId: z
          .string()
          .optional()
          .describe("Project ID. Omit to use the active project."),
        appId: z
          .string()
          .refine((v) => !v.includes("--"), {
            message:
              "appId must be the app slug only (e.g., 'habit-loop'), not an artifact id like 'habit-loop--coach'. Strip everything from '--' onward — the appId is the prefix before '--'.",
          })
          .optional()
          .describe(
            "App composition ID — the app's slug, e.g. 'wealth-tracker'. Must NOT contain '--'. If you have an artifact id like 'wealth-tracker--coach', the appId is everything before '--' (i.e. 'wealth-tracker'). When provided, the schedule is linked to the app's project and added to the app manifest."
          ),
        blueprintId: z
          .string()
          .min(1)
          .optional()
          .describe("For an app composition, the namespaced blueprint this schedule runs. Required for a portable pack schedule."),
        assignedAgent: z.string().optional().describe("Runtime ID (e.g. 'claude')"),
        agentProfile: z.string().optional().describe("Agent profile ID to use"),
        maxFirings: z
          .number()
          .optional()
          .describe("Maximum number of times to fire. Omit for unlimited."),
        expiresInHours: z
          .number()
          .optional()
          .describe("Auto-expire after this many hours"),
        maxTurns: z
          .number()
          .int()
          .min(10)
          .max(500)
          .optional()
          .describe("Hard cap on turns per firing (10-500). Omit to inherit the system default."),
        successCriteria: SuccessCriteriaSchema.optional().describe(
          "Closed success checks used to grade each firing's Operations Receipt."
        ),
      },
      async (args) => {
        try {
          const { parseInterval, computeNextFireTime } = await import(
            "@/lib/schedules/interval-parser"
          );
          const { parseNaturalLanguage } = await import(
            "@/lib/schedules/nlp-parser"
          );

          let cronExpression: string;
          // Try NLP first for natural language expressions,
          // then fall back to parseInterval for shorthand (5m, 2h) and raw cron
          const nlResult = parseNaturalLanguage(args.interval);
          if (nlResult) {
            cronExpression = nlResult.cronExpression;
          } else {
            try {
              cronExpression = parseInterval(args.interval);
            } catch (e) {
              return err(
                `Invalid interval "${args.interval}": ${e instanceof Error ? e.message : "parse error"}`
              );
            }
          }

          let effectiveProjectId: string | null = args.projectId ?? ctx.projectId ?? null;
          if (args.appId) {
            const { ensureAppProject } = await import(
              "@/lib/apps/compose-integration"
            );
            const { projectId } = await ensureAppProject(args.appId);
            effectiveProjectId = projectId;
          }
          const now = new Date();
          const id = crypto.randomUUID();

          // Auto-stagger: if other active schedules in this project would
          // collide with the requested cron, offset its minute field. We scope
          // to the same project so unrelated workspaces don't interfere.
          const { computeStaggeredCron } = await import(
            "@/lib/schedules/interval-parser"
          );
          const existing = await db
            .select({ cron: schedules.cronExpression })
            .from(schedules)
            .where(
              effectiveProjectId
                ? and(
                    eq(schedules.status, "active"),
                    eq(schedules.projectId, effectiveProjectId)
                  )
                : eq(schedules.status, "active")
            );
          const staggerResult = computeStaggeredCron(
            cronExpression,
            existing.map((s) => s.cron)
          );
          if (staggerResult.offsetApplied > 0) {
            console.log(
              `[scheduler] staggered "${args.name}" by ${staggerResult.offsetApplied}min to avoid collision (${cronExpression} → ${staggerResult.cronExpression})`
            );
            cronExpression = staggerResult.cronExpression;
          }

          // Surface prompt-efficiency warnings before creating the schedule.
          // We still create the schedule — these are guidance, not blockers.
          const warnings = analyzePromptEfficiency(args.prompt);

          const nextFireAt = computeNextFireTime(cronExpression, now);
          const expiresAt = args.expiresInHours
            ? new Date(now.getTime() + args.expiresInHours * 60 * 60 * 1000)
            : null;

          await db.insert(schedules).values({
            id,
            name: args.name,
            prompt: args.prompt,
            cronExpression,
            projectId: effectiveProjectId,
            assignedAgent: args.assignedAgent ?? null,
            agentProfile: args.agentProfile ?? null,
            recurs: true,
            status: "active",
            maxFirings: args.maxFirings ?? null,
            maxTurns: args.maxTurns ?? null,
            maxTurnsSetAt: args.maxTurns !== undefined ? now : null,
            successCriteria: serializeSuccessCriteria(args.successCriteria ?? []),
            firingCount: 0,
            expiresAt,
            nextFireAt,
            createdAt: now,
            updatedAt: now,
          });

          const [schedule] = await db
            .select()
            .from(schedules)
            .where(eq(schedules.id, id));

          if (args.appId) {
            const { upsertAppManifest } = await import(
              "@/lib/apps/compose-integration"
            );
            upsertAppManifest(args.appId, {
              kind: "schedule",
              id,
              cron: cronExpression,
              runs: args.blueprintId ?? (args.agentProfile ? `profile:${args.agentProfile}` : undefined),
            });
          }

          ctx.onToolResult?.("create_schedule", {
            ...schedule,
            ...(args.appId ? { appId: args.appId } : {}),
          });
          return ok({
            schedule,
            warnings,
            staggered: staggerResult.offsetApplied > 0
              ? {
                  offsetMinutes: staggerResult.offsetApplied,
                  originalCron: staggerResult.collided ? args.interval : undefined,
                }
              : undefined,
            ...(args.appId ? { appId: args.appId } : {}),
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to create schedule");
        }
      }
    ),

    defineTool(
      "get_schedule",
      "Get full details for a specific schedule.",
      {
        scheduleId: z.string().describe("The schedule ID to look up"),
      },
      async (args) => {
        try {
          const resolved = await resolveEntityId(schedules, schedules.id, args.scheduleId);
          if ("error" in resolved) return err(resolved.error);
          const scheduleId = resolved.id;

          const schedule = await db
            .select()
            .from(schedules)
            .where(eq(schedules.id, scheduleId))
            .get();

          if (!schedule) return err(`Schedule not found: ${scheduleId}`);
          ctx.onToolResult?.("get_schedule", schedule);
          return ok(schedule);
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to get schedule");
        }
      }
    ),

    defineTool(
      "update_schedule",
      "Update a schedule's fields or pause/resume it.",
      {
        scheduleId: z.string().describe("The schedule ID to update"),
        name: z.string().min(1).max(200).optional().describe("New name"),
        prompt: z.string().max(2000).optional().describe("New prompt"),
        interval: z
          .string()
          .optional()
          .describe("New interval (human-friendly)"),
        status: z
          .enum(VALID_SCHEDULE_STATUSES)
          .optional()
          .describe("New status (use 'paused' to pause, 'active' to resume)"),
        assignedAgent: z.string().optional().describe("New runtime ID"),
        agentProfile: z.string().optional().describe("New agent profile"),
        maxTurns: z
          .number()
          .int()
          .min(10)
          .max(500)
          .optional()
          .nullable()
          .describe("Hard cap on turns per firing (10-500). Pass null to clear an override back to the system default."),
        successCriteria: SuccessCriteriaSchema.optional().describe(
          "Replace the success checks used to grade Operations Receipts. Pass [] to clear."
        ),
      },
      async (args) => {
        try {
          const resolved = await resolveEntityId(schedules, schedules.id, args.scheduleId);
          if ("error" in resolved) return err(resolved.error);
          const scheduleId = resolved.id;

          const existing = await db
            .select()
            .from(schedules)
            .where(eq(schedules.id, scheduleId))
            .get();

          if (!existing) return err(`Schedule not found: ${scheduleId}`);

          const updates: Record<string, unknown> = { updatedAt: new Date() };
          if (args.name !== undefined) updates.name = args.name;
          if (args.prompt !== undefined) updates.prompt = args.prompt;
          if (args.status !== undefined) updates.status = args.status;
          if (args.assignedAgent !== undefined) updates.assignedAgent = args.assignedAgent;
          if (args.agentProfile !== undefined) updates.agentProfile = args.agentProfile;
          if (args.maxTurns !== undefined) {
            updates.maxTurns = args.maxTurns;
            updates.maxTurnsSetAt = args.maxTurns === null ? null : new Date();
          }
          if (args.successCriteria !== undefined) {
            updates.successCriteria = serializeSuccessCriteria(args.successCriteria);
          }

          if (args.interval) {
            const { parseInterval, computeNextFireTime } = await import(
              "@/lib/schedules/interval-parser"
            );
            const { parseNaturalLanguage } = await import(
              "@/lib/schedules/nlp-parser"
            );
            try {
              const nlResult = parseNaturalLanguage(args.interval);
              const cron = nlResult
                ? nlResult.cronExpression
                : parseInterval(args.interval);
              updates.cronExpression = cron;
              updates.nextFireAt = computeNextFireTime(cron);
            } catch (e) {
              return err(
                `Invalid interval: ${e instanceof Error ? e.message : "parse error"}`
              );
            }
          }

          // Recompute next fire time on resume
          if (args.status === "active" && existing.status === "paused") {
            const { computeNextFireTime } = await import(
              "@/lib/schedules/interval-parser"
            );
            const cron = (updates.cronExpression as string) ?? existing.cronExpression;
            updates.nextFireAt = computeNextFireTime(cron);
          }

          await db
            .update(schedules)
            .set(updates)
            .where(eq(schedules.id, scheduleId));

          const [schedule] = await db
            .select()
            .from(schedules)
            .where(eq(schedules.id, scheduleId));

          ctx.onToolResult?.("update_schedule", schedule);
          return ok(schedule);
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to update schedule");
        }
      }
    ),

    defineTool(
      "delete_schedule",
      "Delete a schedule permanently. Requires approval.",
      {
        scheduleId: z.string().describe("The schedule ID to delete"),
      },
      async (args) => {
        try {
          const resolved = await resolveEntityId(schedules, schedules.id, args.scheduleId);
          if ("error" in resolved) return err(resolved.error);
          const scheduleId = resolved.id;

          const existing = await db
            .select()
            .from(schedules)
            .where(eq(schedules.id, scheduleId))
            .get();

          if (!existing) return err(`Schedule not found: ${scheduleId}`);

          await db.delete(schedules).where(eq(schedules.id, scheduleId));
          return ok({ message: "Schedule deleted", scheduleId, name: existing.name });
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to delete schedule");
        }
      }
    ),
  ];
}
