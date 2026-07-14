import { z } from "zod";
import { SuccessCriteriaSchema } from "@/lib/operations/criteria";

/**
 * ScheduleSpec — YAML-loadable schedule definition for both user-authored
 * schedules (registered via `/api/schedules/import-yaml` or the CLI) and
 * plugin-bundled schedules (loaded by the Kind 5 plugin loader).
 *
 * Two subtypes discriminated by `type`:
 *   - "scheduled"   — fires on cron / interval, no heartbeat-specific fields
 *   - "heartbeat"   — same cadence contract, plus checklist, active hours,
 *                     timezone, and daily budget cap
 *
 * Cross-field rule: exactly one of `interval` or `cronExpression` must be
 * set. Enforced via a `.refine()` on the top-level `ScheduleSpecSchema`
 * (NOT on each union member). Keeping members as plain strict `ZodObject`
 * preserves Zod v4's discriminatedUnion fast-path — wrapping members with
 * `.refine()` produces a `ZodEffects` that breaks fast-path dispatch in
 * some Zod v4 minor versions. Top-level refine is the safe idiom.
 *
 * Type contract for downstream M2 work:
 *   - T4 registry (scan, cache, load, reload, get, list, user CRUD)
 *   - T7 installer (state-preserving upsert)
 *   - T10 plugin loader (scanBundleSchedules)
 *   - T11 chat tools (list / install / reload)
 */

// Shared base fields. Kept as a plain object so both subtype schemas can
// spread it without falling afoul of Zod's structural requirements.
const ScheduleBaseFields = {
  id: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/, {
      message: "id must be kebab-case, start with a lowercase letter",
    })
    .min(2),
  name: z.string(),
  description: z.string().optional(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, {
    message: "version must be semver (MAJOR.MINOR.PATCH)",
  }),
  prompt: z.string(),
  interval: z.string().optional(),
  cronExpression: z.string().optional(),
  agentProfile: z.string().optional(),
  assignedAgent: z.string().optional(),
  recurs: z.boolean().default(true),
  maxFirings: z.number().int().positive().nullable().optional(),
  expiresAt: z.iso.datetime().nullable().optional(),
  deliveryChannels: z.array(z.string()).optional(),
  maxTurns: z.number().int().positive().nullable().optional(),
  maxRunDurationSec: z.number().int().positive().nullable().optional(),
  successCriteria: SuccessCriteriaSchema.optional(),
};

const intervalOrCron = (s: { interval?: string; cronExpression?: string }): boolean =>
  Boolean(s.interval) !== Boolean(s.cronExpression);

const intervalOrCronMessage = "must specify exactly one of interval or cronExpression";

// Scheduled subtype — base fields + type discriminator, strict so
// heartbeat-only fields are rejected at parse time without an explicit
// block-list. Plain ZodObject (no refine) so discriminatedUnion can
// use its fast-path.
const ScheduledSchema = z
  .object({
    type: z.literal("scheduled"),
    ...ScheduleBaseFields,
  })
  .strict();

// Heartbeat subtype — base fields + heartbeat-specific extras.
const HeartbeatSchema = z
  .object({
    type: z.literal("heartbeat"),
    ...ScheduleBaseFields,
    heartbeatChecklist: z.array(z.string()).optional(),
    activeHoursStart: z.number().int().min(0).max(23).optional(),
    activeHoursEnd: z.number().int().min(0).max(23).optional(),
    activeTimezone: z.string().optional(),
    heartbeatBudgetPerDay: z.number().int().positive().nullable().optional(),
  })
  .strict();

export const ScheduleSpecSchema = z
  .discriminatedUnion("type", [ScheduledSchema, HeartbeatSchema])
  .refine(intervalOrCron, { message: intervalOrCronMessage });

export type ScheduleSpec = z.infer<typeof ScheduleSpecSchema>;
export type ScheduledSpec = z.infer<typeof ScheduledSchema>;
export type HeartbeatSpec = z.infer<typeof HeartbeatSchema>;
