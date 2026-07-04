/**
 * BUG-3 — workflow HITL ask-user channel + halt-on-refusal.
 *
 * These tests drive the checkpoint pattern through executeWorkflow with a
 * query-aware DB mock (dispatched by the table object passed to `.from()`),
 * rather than the positional mockWhere queue used by engine.test.ts. That keeps
 * the tests robust against incidental changes in DB-read ordering and lets us
 * assert the two new behaviors directly:
 *   1. a `requiresInput` step BLOCKS on an AskUserQuestion notification, and the
 *      typed answer is injected into the step's task prompt;
 *   2. a non-final step that produces empty output HALTS the run (loud `failed`),
 *      instead of cascading a false `completed`.
 * See features/fix-workflow-hitl-ask-user.md.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- Query-aware DB mock -------------------------------------------------
// A single mutable store the mock reads/writes. Tests seed `workflowRow`,
// `taskResult`, and `notificationResponse`; the mock returns rows based on the
// table object identity passed to db.select().from(<table>).

type Store = {
  workflowRow: Record<string, unknown>;
  /** Result the child task "completes" with (result string). */
  taskResult: string;
  /** Pre-seeded response JSON for the ask-user notification poll (or null). */
  notificationResponse: string | null;
  /** Captured task-insert values, so we can assert the injected prompt. */
  insertedTasks: Array<Record<string, unknown>>;
  /** Captured workflows.update .set() payloads, newest last. */
  workflowSets: Array<Record<string, unknown>>;
};

const store: Store = {
  workflowRow: {},
  taskResult: "",
  notificationResponse: null,
  insertedTasks: [],
  workflowSets: [],
};

const TABLES = vi.hoisted(() => ({
  workflows: { __table: "workflows" },
  tasks: { __table: "tasks" },
  agentLogs: { __table: "agentLogs" },
  notifications: { __table: "notifications" },
  usageLedger: { __table: "usageLedger", workflowId: "usageLedger.workflowId" },
}));

vi.mock("@/lib/db/schema", () => TABLES);

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
}));

vi.mock("@/lib/db", () => {
  const select = vi.fn(() => {
    let table: { __table: string } | null = null;
    const chain = {
      from: (t: { __table: string }) => {
        table = t;
        return chain;
      },
      where: async () => {
        if (table?.__table === "workflows") return [store.workflowRow];
        if (table?.__table === "tasks") {
          return [{ id: "task-x", status: "completed", result: store.taskResult }];
        }
        if (table?.__table === "notifications") {
          return [{ id: "notif-x", response: store.notificationResponse }];
        }
        return [];
      },
    };
    return chain;
  });

  const update = vi.fn((t: { __table: string }) => ({
    set: (payload: Record<string, unknown>) => {
      if (t?.__table === "workflows") store.workflowSets.push(payload);
      return { where: async () => undefined, returning: async () => [store.workflowRow] };
    },
  }));

  const insert = vi.fn((t: { __table: string }) => ({
    values: async (payload: Record<string, unknown>) => {
      if (t?.__table === "tasks") store.insertedTasks.push(payload);
      return undefined;
    },
  }));

  return { db: { select, update, insert } };
});

// ---- Collaborators the checkpoint path touches — stubbed to no-ops --------

vi.mock("@/lib/agents/task-dispatch", () => ({
  startTaskExecution: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/agents/router", () => ({
  classifyTaskProfile: vi.fn(() => "general"),
}));
vi.mock("@/lib/documents/context-builder", () => ({
  buildWorkflowDocumentContext: vi.fn().mockResolvedValue(""),
  buildPoolDocumentContext: vi.fn().mockResolvedValue(""),
}));
vi.mock("@/lib/settings/helpers", () => ({
  getSetting: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/agents/runtime/catalog", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveAgentRuntime: vi.fn((id: string) => id),
}));
vi.mock("./cost-estimator", () => ({
  resolveStepBudget: vi.fn().mockResolvedValue(undefined),
  estimateWorkflowCost: vi.fn().mockResolvedValue({ warnings: [] }),
}));
vi.mock("./execution-stats", () => ({
  updateExecutionStats: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/agents/learning-session", () => ({
  openLearningSession: vi.fn(),
  closeLearningSession: vi.fn().mockResolvedValue(undefined),
}));

function makeWorkflowRow(steps: unknown[]): Record<string, unknown> {
  return {
    id: "wf-hitl",
    name: "HITL workflow",
    projectId: null,
    runNumber: null,
    runtimeId: null,
    definition: JSON.stringify({ pattern: "checkpoint", steps }),
    status: "draft",
  };
}

describe("workflow HITL ask-user (BUG-3)", () => {
  beforeEach(() => {
    store.workflowRow = {};
    store.taskResult = "";
    store.notificationResponse = null;
    store.insertedTasks = [];
    store.workflowSets = [];
    vi.clearAllMocks();
  });

  it("injects the user's answer into a requiresInput step's task prompt", async () => {
    store.workflowRow = makeWorkflowRow([
      {
        id: "step-1",
        name: "Gather brief",
        prompt: "Write the outreach brief.",
        requiresInput: true,
        inputPrompt: "What do we know about the prospect?",
      },
    ]);
    store.taskResult = "brief done";
    // The user has already answered — the first poll sees the response.
    store.notificationResponse = JSON.stringify({
      behavior: "allow",
      updatedInput: { answer: "Acme Corp, fintech, 200 staff" },
    });

    const { executeWorkflow } = await import("../engine");
    await executeWorkflow("wf-hitl");

    // The single step's task description must carry the injected answer.
    const stepTask = store.insertedTasks.find((t) =>
      String(t.title).includes("Gather brief")
    );
    expect(stepTask).toBeDefined();
    expect(String(stepTask?.description)).toContain("User-provided input:");
    expect(String(stepTask?.description)).toContain("Acme Corp, fintech, 200 staff");

    // The run paused (status:"paused") while waiting, then completed.
    const statuses = store.workflowSets.map((s) => s.status);
    expect(statuses).toContain("paused");
    expect(statuses.at(-1)).toBe("completed");
  });

  it("halts the run when a non-final step produces empty output", async () => {
    store.workflowRow = makeWorkflowRow([
      { id: "step-1", name: "Research", prompt: "Research the prospect." },
      { id: "step-2", name: "Draft", prompt: "Draft the proposal." },
    ]);
    // Step 1 "completes" with no usable artifact (the refusal-in-prose symptom
    // reduces to empty output on disk).
    store.taskResult = "   ";

    const { executeWorkflow } = await import("../engine");
    await executeWorkflow("wf-hitl");

    // The workflow must end failed — NOT a false completed — and never insert a
    // task for the dependent step 2.
    expect(store.workflowSets.at(-1)?.status).toBe("failed");
    const draftTask = store.insertedTasks.find((t) =>
      String(t.title).includes("Draft")
    );
    expect(draftTask).toBeUndefined();
  });

  it("lets a final step legitimately return empty output without halting", async () => {
    store.workflowRow = makeWorkflowRow([
      { id: "step-1", name: "Only", prompt: "Maybe produce nothing." },
    ]);
    store.taskResult = "";

    const { executeWorkflow } = await import("../engine");
    await executeWorkflow("wf-hitl");

    // No dependents downstream — empty final output is not a false completion.
    expect(store.workflowSets.at(-1)?.status).toBe("completed");
  });
});
