import { z } from "zod/v4";

const projectReferenceSchema = z.string().trim().min(1).nullable().optional();
const workflowDefinitionSchema = z.record(z.string(), z.unknown()).optional();

export const createWorkflowRequestSchema = z.object({
  name: z.string().optional(),
  projectId: projectReferenceSchema,
  definition: workflowDefinitionSchema,
  successCriteria: z.unknown().optional(),
});

export const updateWorkflowRequestSchema = z.object({
  status: z.string().optional(),
  name: z.string().optional(),
  projectId: projectReferenceSchema,
  definition: workflowDefinitionSchema,
  successCriteria: z.unknown().optional(),
});
