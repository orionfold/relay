import { z } from "zod";

const CriterionBase = {
  id: z
    .string()
    .min(1, "Criterion id is required")
    .max(64, "Criterion id must be 64 characters or fewer")
    .regex(/^[a-z][a-z0-9-]*$/, "Criterion id must be kebab-case"),
  label: z
    .string()
    .trim()
    .min(1, "Criterion label is required")
    .max(120, "Criterion label must be 120 characters or fewer"),
  level: z.enum(["required", "advisory"]),
};

const StatusCriterionSchema = z
  .object({
    ...CriterionBase,
    check: z.literal("status_is"),
    value: z.literal("completed"),
  })
  .strict();

const ResultContainsCriterionSchema = z
  .object({
    ...CriterionBase,
    check: z.literal("result_contains"),
    value: z
      .string()
      .trim()
      .min(1, "Result text is required")
      .max(200, "Result text must be 200 characters or fewer"),
  })
  .strict();

const OutputCountCriterionSchema = z
  .object({
    ...CriterionBase,
    check: z.literal("output_count_at_least"),
    value: z.number().int().min(0).max(10_000),
  })
  .strict();

const DurationCriterionSchema = z
  .object({
    ...CriterionBase,
    check: z.literal("duration_at_most_seconds"),
    value: z.number().int().positive().max(604_800),
  })
  .strict();

export const SuccessCriterionSchema = z.discriminatedUnion("check", [
  StatusCriterionSchema,
  ResultContainsCriterionSchema,
  OutputCountCriterionSchema,
  DurationCriterionSchema,
]);

export const SuccessCriteriaSchema = z
  .array(SuccessCriterionSchema)
  .max(8, "At most 8 success criteria are supported")
  .superRefine((criteria, context) => {
    const ids = new Set<string>();
    criteria.forEach((criterion, index) => {
      if (ids.has(criterion.id)) {
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: `Criterion id "${criterion.id}" must be unique`,
        });
      }
      ids.add(criterion.id);
    });
  });

export type SuccessCriterion = z.infer<typeof SuccessCriterionSchema>;
export type SuccessCriteria = z.infer<typeof SuccessCriteriaSchema>;

export class OperationsCriteriaValidationError extends Error {
  readonly issues: z.core.$ZodIssue[];

  constructor(message: string, issues: z.core.$ZodIssue[]) {
    super(message);
    this.name = "OperationsCriteriaValidationError";
    this.issues = issues;
  }
}

export function normalizeSuccessCriteria(input: unknown): SuccessCriteria {
  const parsed = SuccessCriteriaSchema.safeParse(input ?? []);
  if (!parsed.success) {
    throw new OperationsCriteriaValidationError(
      parsed.error.issues[0]?.message ?? "Invalid success criteria",
      parsed.error.issues
    );
  }
  return parsed.data;
}

export function parseStoredSuccessCriteria(value: string | null): SuccessCriteria {
  if (!value) return [];
  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch (error) {
    throw new OperationsCriteriaValidationError(
      `Stored success criteria are not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
      []
    );
  }
  return normalizeSuccessCriteria(decoded);
}

export function serializeSuccessCriteria(input: unknown): string | null {
  const criteria = normalizeSuccessCriteria(input);
  return criteria.length > 0 ? JSON.stringify(criteria) : null;
}
