import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "relay-workflow-analysis-"));
  vi.resetModules();
  vi.stubEnv("RELAY_DATA_DIR", tempDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(tempDir, { recursive: true, force: true });
});

async function seedFailure(input: {
  workflowId: string;
  stateError?: string;
  logEvent?: string;
  logPayload?: string;
}) {
  const { db } = await import("@/lib/db");
  const { workflows, agentLogs } = await import("@/lib/db/schema");
  const now = new Date();
  const definition = {
    pattern: "sequence",
    steps: [{ id: "step-1", name: "Research", prompt: "Investigate" }],
    _state: {
      currentStepIndex: 0,
      stepStates: input.stateError
        ? [{ stepId: "step-1", status: "failed", error: input.stateError }]
        : [{ stepId: "step-1", status: "completed" }],
      status: "failed",
      startedAt: now.toISOString(),
    },
  };
  await db.insert(workflows).values({
    id: input.workflowId,
    projectId: null,
    name: "Failed workflow",
    definition: JSON.stringify(definition),
    status: "failed",
    createdAt: now,
    updatedAt: now,
  });
  if (input.logEvent) {
    await db.insert(agentLogs).values({
      id: crypto.randomUUID(),
      taskId: null,
      agentType: "general",
      event: input.logEvent,
      payload:
        input.logPayload ??
        JSON.stringify({ workflowId: input.workflowId, stepId: "step-1" }),
      timestamp: now,
    });
  }
}

describe("analyzeWorkflowFailure", () => {
  it.each([
    ["budget", "Maximum budget exceeded", "budget_exceeded", "Raise budget to $10"],
    ["timeout", "Turn limit timeout", "timeout", "Increase max turns to 100"],
    ["transient", "ECONNREFUSED connection error", "transient", "Retry the workflow"],
  ] as const)(
    "classifies %s step failures and returns a named recovery tier",
    async (suffix, error, expectedType, expectedSuggestion) => {
      const workflowId = `workflow-${suffix}`;
      await seedFailure({
        workflowId,
        stateError: error,
        logEvent: "step_failed",
        logPayload: JSON.stringify({
          workflowId,
          stepId: "step-1",
          error,
        }),
      });
      const { analyzeWorkflowFailure } = await import("../error-analysis");

      const analysis = await analyzeWorkflowFailure(workflowId);

      expect(analysis.rootCause.type).toBe(expectedType);
      expect(analysis.stepErrors).toEqual([
        { stepId: "step-1", stepName: "Research", error },
      ]);
      expect(analysis.timeline[0]).toMatchObject({
        event: "step_failed",
        severity: "error",
        details: error,
        stepId: "step-1",
      });
      expect(analysis.suggestions[0]?.title).toBe(expectedSuggestion);
    }
  );

  it("falls back to an unknown cause when state and malformed logs contain no error", async () => {
    const workflowId = "workflow-unknown";
    await seedFailure({
      workflowId,
      logEvent: "step_started",
      logPayload: `{ "workflowId": "${workflowId}", not-json`,
    });
    const { analyzeWorkflowFailure } = await import("../error-analysis");

    const analysis = await analyzeWorkflowFailure(workflowId);

    expect(analysis.rootCause).toMatchObject({
      type: "unknown",
      summary: "The workflow failed for an unknown reason.",
    });
    expect(analysis.timeline[0]).toMatchObject({
      severity: "warning",
      details: "step_started",
    });
    expect(analysis.suggestions[0]?.title).toBe("Check agent logs for details");
  });

  it("names a missing workflow", async () => {
    const { analyzeWorkflowFailure } = await import("../error-analysis");
    await expect(analyzeWorkflowFailure("missing")).rejects.toThrow(
      "Workflow missing not found"
    );
  });
});
