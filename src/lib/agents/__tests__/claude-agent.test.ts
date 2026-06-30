import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock infrastructure (vi.hoisted so vi.mock factories can reference them) ──

const {
  mockDb,
  mockFrom,
  mockWhere,
  mockSet,
  mockSetWhere,
  mockValues,
  mockSetExecution,
  mockRemoveExecution,
  mockGetAuthEnv,
  mockUpdateAuthStatus,
  mockPrepareTaskOutputDirectory,
  mockBuildTaskOutputInstructions,
  mockScanTaskOutputDocuments,
  mockGetProfile,
  mockIsToolAllowed,
  mockGetActiveLearnedContext,
  mockAnalyzeForLearnedPatterns,
  mockProcessSweepResult,
} = vi.hoisted(() => {
  const mockFrom = vi.fn();
  const mockWhere = vi.fn();
  const mockSet = vi.fn();
  const mockSetWhere = vi.fn().mockResolvedValue(undefined);
  const mockValues = vi.fn();
  const mockDb = {
    select: vi.fn().mockReturnValue({ from: mockFrom }),
    update: vi.fn().mockReturnValue({ set: mockSet }),
    insert: vi.fn().mockReturnValue({ values: mockValues }),
  };
  // .where() must return a thenable with .all() for both async and sync query patterns
  mockWhere.mockReturnValue({ then: (fn: (v: unknown[]) => void) => fn([]), all: () => [] });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockSet.mockReturnValue({ where: mockSetWhere });
  mockValues.mockResolvedValue(undefined);
  const mockSetExecution = vi.fn();
  const mockRemoveExecution = vi.fn();
  const mockGetAuthEnv = vi.fn().mockResolvedValue(undefined);
  const mockUpdateAuthStatus = vi.fn().mockResolvedValue(undefined);
  const mockPrepareTaskOutputDirectory = vi.fn().mockResolvedValue("/tmp/ainative-outputs/task-1");
  const mockBuildTaskOutputInstructions = vi
    .fn()
    .mockReturnValue("Write outputs to /tmp/ainative-outputs/task-1");
  const mockScanTaskOutputDocuments = vi.fn().mockResolvedValue([]);
  const mockGetProfile = vi.fn().mockReturnValue({
    id: "general",
    name: "General",
    systemPrompt: "",
    allowedTools: undefined,
  });
  const mockIsToolAllowed = vi.fn().mockResolvedValue(false);
  const mockGetActiveLearnedContext = vi.fn().mockReturnValue(null);
  const mockAnalyzeForLearnedPatterns = vi.fn().mockResolvedValue(null);
  const mockProcessSweepResult = vi.fn().mockResolvedValue(undefined);
  return {
    mockDb,
    mockFrom,
    mockWhere,
    mockSet,
    mockSetWhere,
    mockValues,
    mockSetExecution,
    mockRemoveExecution,
    mockGetAuthEnv,
    mockUpdateAuthStatus,
    mockPrepareTaskOutputDirectory,
    mockBuildTaskOutputInstructions,
    mockScanTaskOutputDocuments,
    mockGetProfile,
    mockIsToolAllowed,
    mockGetActiveLearnedContext,
    mockAnalyzeForLearnedPatterns,
    mockProcessSweepResult,
  };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/db/schema", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/schema")>()),
  tasks: {
    id: "id",
    status: "status",
    sessionId: "session_id",
    resumeCount: "resume_count",
  },
  agentLogs: {},
  notifications: { id: "notif_id" },
  settings: { key: "key" },
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn((_col, val) => val) }));
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));
vi.mock("@/lib/agents/execution-manager", () => ({
  setExecution: mockSetExecution,
  removeExecution: mockRemoveExecution,
}));
vi.mock("@/lib/settings/auth", () => ({
  getAuthEnv: mockGetAuthEnv,
  updateAuthStatus: mockUpdateAuthStatus,
}));
vi.mock("@/lib/agents/profiles/registry", () => ({
  getProfile: mockGetProfile,
}));
vi.mock("@/lib/documents/context-builder", () => ({
  buildDocumentContext: vi.fn().mockResolvedValue(""),
}));
vi.mock("@/lib/documents/output-scanner", () => ({
  prepareTaskOutputDirectory: mockPrepareTaskOutputDirectory,
  buildTaskOutputInstructions: mockBuildTaskOutputInstructions,
  scanTaskOutputDocuments: mockScanTaskOutputDocuments,
}));
vi.mock("@/lib/settings/permissions", () => ({
  isToolAllowed: mockIsToolAllowed,
}));
vi.mock("@/lib/usage/ledger", () => ({
  extractUsageSnapshot: vi.fn().mockReturnValue({}),
  mergeUsageSnapshot: vi.fn((current: Record<string, unknown>, next: Record<string, unknown>) => ({
    ...current,
    ...next,
  })),
  recordUsageLedgerEntry: vi.fn().mockResolvedValue(undefined),
  resolveUsageActivityType: vi.fn().mockReturnValue("task_run"),
}));
vi.mock("@/lib/agents/learned-context", () => ({
  getActiveLearnedContext: mockGetActiveLearnedContext,
}));
vi.mock("@/lib/agents/pattern-extractor", () => ({
  analyzeForLearnedPatterns: mockAnalyzeForLearnedPatterns,
}));
vi.mock("@/lib/agents/sweep", () => ({
  processSweepResult: mockProcessSweepResult,
}));
vi.mock("@/lib/agents/browser-mcp", () => ({
  getBrowserMcpServers: vi.fn().mockResolvedValue({}),
  getExternalMcpServers: vi.fn().mockResolvedValue({}),
  isExaTool: vi.fn().mockReturnValue(false),
  isExaReadOnly: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/chat/ainative-tools", () => ({
  createToolServer: vi.fn((_projectId?: string | null) => ({
    asMcpServer: () => ({ __mockAinativeServer: true }),
  })),
}));
// Mock the plugin MCP loader so execute/resume call sites resolve to {} by
// default (no plugins installed). Individual tests can override via
// vi.mocked(loadPluginMcpServers).mockResolvedValueOnce(...).
vi.mock("@/lib/plugins/mcp-loader", () => ({
  loadPluginMcpServers: vi.fn().mockResolvedValue({}),
}));

// Static imports (works because vi.mock is hoisted)
import { query } from "@anthropic-ai/claude-agent-sdk";
import { executeClaudeTask, resumeClaudeTask, withAinativeMcpServer } from "../claude-agent";
import { createToolServer } from "@/lib/chat/ainative-tools";
import { loadPluginMcpServers } from "@/lib/plugins/mcp-loader";

const mockQuery = vi.mocked(query);

// ─── Helpers ─────────────────────────────────────────────────────────

/** Create an async iterable from an array of message objects */
function createMockStream(
  messages: Record<string, unknown>[]
): AsyncIterable<Record<string, unknown>> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const msg of messages) {
        yield msg;
      }
    },
  };
}

/** Standard task object for tests */
function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    title: "Test Task",
    description: "Test description",
    projectId: null,
    workflowId: null,
    scheduleId: null,
    sessionId: null,
    resumeCount: 0,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  // Re-establish mock chains after clearAllMocks
  mockDb.select.mockReturnValue({ from: mockFrom });
  mockWhere.mockReturnValue({ then: (fn: (v: unknown[]) => void) => fn([]), all: () => [] });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockDb.update.mockReturnValue({ set: mockSet });
  mockSet.mockReturnValue({ where: mockSetWhere });
  mockDb.insert.mockReturnValue({ values: mockValues });
  mockValues.mockResolvedValue(undefined);
  mockSetWhere.mockResolvedValue(undefined);
  mockPrepareTaskOutputDirectory.mockResolvedValue("/tmp/ainative-outputs/task-1");
  mockBuildTaskOutputInstructions.mockReturnValue(
    "Write outputs to /tmp/ainative-outputs/task-1"
  );
  mockScanTaskOutputDocuments.mockResolvedValue([]);
  mockGetProfile.mockReturnValue({
    id: "general",
    name: "General",
    systemPrompt: "",
    allowedTools: undefined,
  });
  mockIsToolAllowed.mockResolvedValue(false);
  mockGetActiveLearnedContext.mockReturnValue(null);
  mockAnalyzeForLearnedPatterns.mockResolvedValue(null);
  mockProcessSweepResult.mockResolvedValue(undefined);
  vi.mocked(loadPluginMcpServers).mockResolvedValue({});
});

// ═══════════════════════════════════════════════════════════════════════
// Group A: executeClaudeTask + processAgentStream
// ═══════════════════════════════════════════════════════════════════════

describe("executeClaudeTask", () => {
  it("A1: throws if task not found", async () => {
    mockWhere.mockResolvedValueOnce([]);
    await expect(executeClaudeTask("nonexistent")).rejects.toThrow("not found");
  });

  it("A2: completes with result message — updates status, creates notification and log", async () => {
    mockWhere.mockResolvedValueOnce([makeTask()]);
    mockQuery.mockReturnValue(
      createMockStream([
        { type: "result", result: "Task done successfully" },
      ]) as unknown as ReturnType<typeof query>
    );

    await executeClaudeTask("task-1");

    // Status updated to completed
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed", result: "Task done successfully" })
    );
    // Notification created
    expect(mockDb.insert).toHaveBeenCalled();
    // removeExecution called in finally
    expect(mockRemoveExecution).toHaveBeenCalledWith("task-1");
  });

  it("A2b: persists turnCount and tokenCount on the completion update", async () => {
    mockWhere.mockResolvedValueOnce([makeTask()]);
    // Override extractUsageSnapshot for this test so usage tokens flow into usageState.
    // The default mock at module top returns {}; here we want the result frame to carry
    // a usage snapshot that the merge picks up as totalTokens.
    const { extractUsageSnapshot } = await import("@/lib/usage/ledger");
    vi.mocked(extractUsageSnapshot).mockImplementation((source: unknown) => {
      const node = source as { type?: string; usage?: { total_tokens?: number } };
      if (node?.type === "result" && node.usage?.total_tokens) {
        return { totalTokens: node.usage.total_tokens };
      }
      return {};
    });

    mockQuery.mockReturnValue(
      createMockStream([
        // Two assistant frames bump turnCount to 2
        {
          type: "assistant",
          message: { content: [{ type: "text", text: "thinking..." }] },
        },
        {
          type: "assistant",
          message: { content: [{ type: "text", text: "answer" }] },
        },
        // Result frame carries the cumulative token total
        { type: "result", result: "done", usage: { total_tokens: 300 } },
      ]) as unknown as ReturnType<typeof query>
    );

    await executeClaudeTask("task-1");

    // The completion update is the call that carries the result+turnCount+tokenCount.
    const completionCall = mockSet.mock.calls.find((call) => {
      const arg = call[0] as Record<string, unknown>;
      return arg?.status === "completed";
    });
    expect(completionCall).toBeDefined();
    const completionArg = completionCall![0] as {
      turnCount: number;
      tokenCount: number | null;
    };
    expect(completionArg.turnCount).toBe(2);
    expect(completionArg.tokenCount).toBe(300);
  });

  it("A-ainative-1: injects relay MCP server into query mcpServers", async () => {
    mockWhere.mockResolvedValueOnce([makeTask({ projectId: "proj-7" })]);
    mockQuery.mockReturnValue(
      createMockStream([
        { type: "result", result: "done" },
      ]) as unknown as ReturnType<typeof query>
    );

    await executeClaudeTask("task-1");

    const queryCall = mockQuery.mock.calls[0][0] as {
      options: { mcpServers?: Record<string, unknown> };
    };
    expect(queryCall.options.mcpServers).toBeDefined();
    expect(queryCall.options.mcpServers!.relay).toEqual({ __mockAinativeServer: true });
    expect(vi.mocked(createToolServer)).toHaveBeenCalledWith("proj-7");
  });

  it("A-ainative-2: prepends mcp__relay__* when profile has allowedTools", async () => {
    mockWhere.mockResolvedValueOnce([makeTask({ projectId: "proj-7" })]);
    mockGetProfile.mockReturnValueOnce({
      id: "restricted",
      name: "Restricted",
      systemPrompt: "",
      allowedTools: ["Read", "Grep"],
    });
    mockQuery.mockReturnValue(
      createMockStream([
        { type: "result", result: "done" },
      ]) as unknown as ReturnType<typeof query>
    );

    await executeClaudeTask("task-1");

    const queryCall = mockQuery.mock.calls[0][0] as {
      options: { allowedTools?: string[] };
    };
    expect(queryCall.options.allowedTools).toBeDefined();
    expect(queryCall.options.allowedTools).toContain("mcp__relay__*");
    expect(queryCall.options.allowedTools).toContain("Read");
    expect(queryCall.options.allowedTools).toContain("Grep");
    // Duplicates not added when profile didn't already include the pattern
    const ainativeCount = queryCall.options.allowedTools!.filter(
      (t) => t === "mcp__relay__*"
    ).length;
    expect(ainativeCount).toBe(1);
  });

  it("A-ainative-3: falls back to CLAUDE_SDK_ALLOWED_TOOLS when profile has none and runtime has native skills", async () => {
    mockWhere.mockResolvedValueOnce([makeTask({ projectId: "proj-7" })]);
    // Default mockGetProfile returns allowedTools: undefined. Task-runtime-skill-parity
    // (Task 3) changed withAinativeAllowedTools so the Phase 1a tool set (Skill,
    // Read/Grep/Glob, Edit/Write/Bash, TodoWrite) is passed alongside mcp__relay__*
    // when the runtime has hasNativeSkills=true — which is the claude-code default.
    mockQuery.mockReturnValue(
      createMockStream([
        { type: "result", result: "done" },
      ]) as unknown as ReturnType<typeof query>
    );

    await executeClaudeTask("task-1");

    const queryCall = mockQuery.mock.calls[0][0] as {
      options: { allowedTools?: string[] };
    };
    expect(queryCall.options.allowedTools).toBeDefined();
    expect(queryCall.options.allowedTools).toEqual([
      "mcp__relay__*",
      "Skill",
      "Read",
      "Grep",
      "Glob",
      "Edit",
      "Write",
      "Bash",
      "TodoWrite",
    ]);
  });

  it("A3: captures sessionId from init message and re-calls setExecution", async () => {
    mockWhere.mockResolvedValueOnce([makeTask()]);
    mockQuery.mockReturnValue(
      createMockStream([
        { type: "system", subtype: "init", session_id: "sess-abc" },
        { type: "result", result: "done" },
      ]) as unknown as ReturnType<typeof query>
    );

    await executeClaudeTask("task-1");

    // sessionId saved to DB
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "sess-abc" })
    );
    // setExecution called twice: initial + with sessionId
    expect(mockSetExecution).toHaveBeenCalledTimes(2);
    expect(mockSetExecution).toHaveBeenLastCalledWith(
      "task-1",
      expect.objectContaining({ sessionId: "sess-abc" })
    );
  });

  it("A4: logs stream events (content_block_start, content_block_delta, message_start)", async () => {
    mockWhere.mockResolvedValueOnce([makeTask()]);
    mockQuery.mockReturnValue(
      createMockStream([
        { type: "stream_event", event: { type: "content_block_start", data: "x" } },
        { type: "stream_event", event: { type: "content_block_delta", data: "y" } },
        { type: "stream_event", event: { type: "message_start", data: "z" } },
        { type: "result", result: "done" },
      ]) as unknown as ReturnType<typeof query>
    );

    await executeClaudeTask("task-1");

    // 3 stream event logs + 1 completed log + 1 notification = 5 inserts
    expect(mockValues).toHaveBeenCalledTimes(5);
  });

  it("A5: logs tool_use from assistant messages", async () => {
    mockWhere.mockResolvedValueOnce([makeTask()]);
    mockQuery.mockReturnValue(
      createMockStream([
        {
          type: "assistant",
          message: {
            content: [
              { type: "tool_use", name: "Read", input: { path: "/foo" } },
            ],
          },
        },
        { type: "result", result: "done" },
      ]) as unknown as ReturnType<typeof query>
    );

    await executeClaudeTask("task-1");

    // tool_start log should have been inserted
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ event: "tool_start" })
    );
  });

  it("A6: JSON.stringify non-string result", async () => {
    mockWhere.mockResolvedValueOnce([makeTask()]);
    mockQuery.mockReturnValue(
      createMockStream([
        { type: "result", result: { key: "value" } },
      ]) as unknown as ReturnType<typeof query>
    );

    await executeClaudeTask("task-1");

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ result: '{"key":"value"}' })
    );
  });

  it("A7: uses task.title when description is null", async () => {
    mockWhere.mockResolvedValueOnce([makeTask({ description: null })]);
    mockQuery.mockReturnValue(
      createMockStream([{ type: "result", result: "done" }]) as unknown as ReturnType<typeof query>
    );

    await executeClaudeTask("task-1");

    // F1: prompt contains only user task text (title fallback); system instructions in systemPrompt
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Test Task",
      })
    );
    // System instructions (including output instructions) are in the systemPrompt option
    const callOptions = mockQuery.mock.calls[0][0].options;
    expect(callOptions.systemPrompt).toBeDefined();
    expect(callOptions.maxTurns).toBeDefined();
    expect(callOptions.maxBudgetUsd).toBeDefined();
  });

  it("A8: waits for learned-pattern extraction before final cleanup", async () => {
    let resolveAnalysis: (() => void) | null = null;
    mockWhere.mockResolvedValueOnce([makeTask()]);
    mockQuery.mockReturnValue(
      createMockStream([{ type: "result", result: "done" }]) as unknown as ReturnType<typeof query>
    );
    mockAnalyzeForLearnedPatterns.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAnalysis = () => resolve(null);
      })
    );

    const runPromise = executeClaudeTask("task-1");
    await vi.waitFor(() => {
      expect(mockAnalyzeForLearnedPatterns).toHaveBeenCalledWith("task-1", "general");
    });

    expect(mockRemoveExecution).not.toHaveBeenCalled();

    resolveAnalysis?.();
    await runPromise;

    expect(mockRemoveExecution).toHaveBeenCalledWith("task-1");
  });

  it("A9: logs learned-pattern extraction failures without failing the task", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockWhere.mockResolvedValueOnce([makeTask()]);
    mockQuery.mockReturnValue(
      createMockStream([{ type: "result", result: "done" }]) as unknown as ReturnType<typeof query>
    );
    mockAnalyzeForLearnedPatterns.mockRejectedValueOnce(new Error("extract failed"));

    await executeClaudeTask("task-1");

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed", result: "done" })
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "[self-improvement] pattern extraction failed:",
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Group B: handleExecutionError (via executeClaudeTask catch)
// ═══════════════════════════════════════════════════════════════════════

describe("handleExecutionError", () => {
  it("B1: sets status→failed, creates notification + error log on SDK error", async () => {
    mockWhere.mockResolvedValueOnce([makeTask()]);
    mockQuery.mockImplementation(() => {
      return {
        async *[Symbol.asyncIterator]() {
          throw new Error("SDK connection failed");
        },
      } as unknown as ReturnType<typeof query>;
    });

    await executeClaudeTask("task-1");

    // Status set to failed
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", result: "SDK connection failed" })
    );
    // Notification created for failure
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ type: "task_failed" })
    );
    // Error log created
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ event: "error" })
    );
  });

  it("B2: sets status→cancelled when abort signal is aborted (no notification)", async () => {
    mockWhere.mockResolvedValueOnce([makeTask()]);

    // Capture the abort controller and abort it before throwing
    mockSetExecution.mockImplementation((_taskId: string, execution: unknown) => {
      const ac = (execution as { abortController: AbortController }).abortController;
      ac.abort();
    });

    mockQuery.mockImplementation(() => {
      return {
        async *[Symbol.asyncIterator]() {
          throw new Error("Aborted");
        },
      } as unknown as ReturnType<typeof query>;
    });

    await executeClaudeTask("task-1");

    // Status set to cancelled
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled" })
    );
    // No notification or error log for cancellation
    expect(mockValues).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "task_failed" })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Group C: resumeClaudeTask
// ═══════════════════════════════════════════════════════════════════════

describe("resumeClaudeTask", () => {
  it("throws if task not found", async () => {
    mockWhere.mockResolvedValueOnce([]);
    await expect(resumeClaudeTask("nonexistent")).rejects.toThrow("not found");
  });

  it("throws if task has no sessionId", async () => {
    mockWhere.mockResolvedValueOnce([makeTask({ sessionId: null })]);
    await expect(resumeClaudeTask("task-1")).rejects.toThrow(
      "No session to resume"
    );
  });

  it("throws if resume count is at limit", async () => {
    mockWhere.mockResolvedValueOnce([
      makeTask({ sessionId: "sess-123", resumeCount: 3 }),
    ]);
    await expect(resumeClaudeTask("task-1")).rejects.toThrow(
      "Resume limit reached"
    );
  });

  it("C1: resumes successfully — increments resumeCount, logs session_resumed, calls query with resume", async () => {
    mockWhere.mockResolvedValueOnce([
      makeTask({ sessionId: "sess-123", resumeCount: 1 }),
    ]);
    mockQuery.mockReturnValue(
      createMockStream([{ type: "result", result: "resumed ok" }]) as unknown as ReturnType<typeof query>
    );

    await resumeClaudeTask("task-1");

    // Resume count incremented
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ resumeCount: 2 })
    );
    // session_resumed log
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ event: "session_resumed" })
    );
    // query called with resume option
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ resume: "sess-123" }),
      })
    );
    // removeExecution in finally
    expect(mockRemoveExecution).toHaveBeenCalledWith("task-1");
  });

  it("C2: handles session expired error — sets failed, clears sessionId", async () => {
    mockWhere.mockResolvedValueOnce([
      makeTask({ sessionId: "sess-123", resumeCount: 0 }),
    ]);
    mockQuery.mockImplementation(() => {
      return {
        async *[Symbol.asyncIterator]() {
          throw new Error("session has expired");
        },
      } as unknown as ReturnType<typeof query>;
    });

    await resumeClaudeTask("task-1");

    // Status set to failed with session expired message
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        sessionId: null,
        result: "Session expired — re-queue for fresh start",
      })
    );
    // Notification created
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "task_failed",
        title: expect.stringContaining("Session expired"),
      })
    );
  });

  it("C3: handles session not found error — same branch as C2", async () => {
    mockWhere.mockResolvedValueOnce([
      makeTask({ sessionId: "sess-123", resumeCount: 0 }),
    ]);
    mockQuery.mockImplementation(() => {
      return {
        async *[Symbol.asyncIterator]() {
          throw new Error("session not found");
        },
      } as unknown as ReturnType<typeof query>;
    });

    await resumeClaudeTask("task-1");

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", sessionId: null })
    );
  });

  it("C4: falls through to handleExecutionError for non-session errors", async () => {
    mockWhere.mockResolvedValueOnce([
      makeTask({ sessionId: "sess-123", resumeCount: 0 }),
    ]);
    mockQuery.mockImplementation(() => {
      return {
        async *[Symbol.asyncIterator]() {
          throw new Error("network timeout");
        },
      } as unknown as ReturnType<typeof query>;
    });

    await resumeClaudeTask("task-1");

    // Falls through to handleExecutionError → status failed
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", result: "network timeout" })
    );
    // Error log created (not session expired path)
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ event: "error" })
    );
  });

  it("C5: waits for learned-pattern extraction before final cleanup on resume", async () => {
    let resolveAnalysis: (() => void) | null = null;
    mockWhere.mockResolvedValueOnce([
      makeTask({ sessionId: "sess-123", resumeCount: 0 }),
    ]);
    mockQuery.mockReturnValue(
      createMockStream([{ type: "result", result: "resumed ok" }]) as unknown as ReturnType<typeof query>
    );
    mockAnalyzeForLearnedPatterns.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAnalysis = () => resolve(null);
      })
    );

    const runPromise = resumeClaudeTask("task-1");
    await vi.waitFor(() => {
      expect(mockAnalyzeForLearnedPatterns).toHaveBeenCalledWith("task-1", "general");
    });

    expect(mockRemoveExecution).not.toHaveBeenCalled();

    resolveAnalysis?.();
    await runPromise;

    expect(mockRemoveExecution).toHaveBeenCalledWith("task-1");
  });

  it("R-ainative-1: injects relay MCP server into query mcpServers on resume", async () => {
    mockWhere.mockResolvedValueOnce([
      makeTask({
        projectId: "proj-7",
        sessionId: "session-abc",
        resumeCount: 1,
      }),
    ]);
    mockQuery.mockReturnValue(
      createMockStream([
        { type: "result", result: "resumed and done" },
      ]) as unknown as ReturnType<typeof query>
    );

    await resumeClaudeTask("task-1");

    const queryCall = mockQuery.mock.calls[0][0] as {
      options: { mcpServers?: Record<string, unknown>; resume?: string };
    };
    expect(queryCall.options.resume).toBe("session-abc");
    expect(queryCall.options.mcpServers).toBeDefined();
    expect(queryCall.options.mcpServers!.relay).toEqual({ __mockAinativeServer: true });
    expect(vi.mocked(createToolServer)).toHaveBeenCalledWith("proj-7");
  });

  it("R-ainative-2: prepends mcp__relay__* on resume when profile has allowedTools", async () => {
    mockWhere.mockResolvedValueOnce([
      makeTask({
        projectId: "proj-7",
        sessionId: "session-abc",
        resumeCount: 1,
      }),
    ]);
    mockGetProfile.mockReturnValueOnce({
      id: "restricted",
      name: "Restricted",
      systemPrompt: "",
      allowedTools: ["Read", "Grep"],
    });
    mockQuery.mockReturnValue(
      createMockStream([
        { type: "result", result: "resumed and done" },
      ]) as unknown as ReturnType<typeof query>
    );

    await resumeClaudeTask("task-1");

    const queryCall = mockQuery.mock.calls[0][0] as {
      options: { allowedTools?: string[] };
    };
    expect(queryCall.options.allowedTools).toContain("mcp__relay__*");
    expect(queryCall.options.allowedTools).toContain("Read");
    expect(queryCall.options.allowedTools![0]).toBe("mcp__relay__*");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Group D: handleToolPermission (via canUseTool callback)
// ═══════════════════════════════════════════════════════════════════════

describe("handleToolPermission", () => {
  it("D1: creates permission_required notification for tool use", async () => {
    mockWhere.mockResolvedValueOnce([makeTask()]);

    mockQuery.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ options }: any) => {
        return {
          async *[Symbol.asyncIterator]() {
            const canUseTool = options.canUseTool as (
              toolName: string,
              input: Record<string, unknown>
            ) => Promise<{ behavior: string }>;

            // Poll will find this response on first check
            mockWhere.mockResolvedValueOnce([
              { id: "notif-1", response: JSON.stringify({ behavior: "allow" }) },
            ]);

            await canUseTool("Write", { path: "/test.ts" });

            yield { type: "result", result: "done" };
          },
        } as unknown as ReturnType<typeof query>;
      }
    );

    await executeClaudeTask("task-1");

    // Notification inserted with permission_required type
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "permission_required",
        title: "Permission required: Write",
      })
    );
  });

  it("D2: creates agent_message notification for AskUserQuestion", async () => {
    mockWhere.mockResolvedValueOnce([makeTask()]);

    mockQuery.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ options }: any) => {
        return {
          async *[Symbol.asyncIterator]() {
            const canUseTool = options.canUseTool as (
              toolName: string,
              input: Record<string, unknown>
            ) => Promise<{ behavior: string }>;

            mockWhere.mockResolvedValueOnce([
              { id: "notif-1", response: JSON.stringify({ behavior: "allow" }) },
            ]);

            await canUseTool("AskUserQuestion", { question: "What color?" });

            yield { type: "result", result: "done" };
          },
        } as unknown as ReturnType<typeof query>;
      }
    );

    await executeClaudeTask("task-1");

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "agent_message",
        title: "Agent has a question",
      })
    );
  });

  it("D3: returns parsed JSON response from notification", async () => {
    mockWhere.mockResolvedValueOnce([makeTask()]);

    let toolResult: unknown;
    mockQuery.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ options }: any) => {
        return {
          async *[Symbol.asyncIterator]() {
            const canUseTool = options.canUseTool as (
              toolName: string,
              input: Record<string, unknown>
            ) => Promise<{ behavior: string }>;

            mockWhere.mockResolvedValueOnce([
              {
                id: "notif-1",
                response: JSON.stringify({
                  behavior: "allow",
                  updatedInput: { path: "/new.ts" },
                }),
              },
            ]);

            toolResult = await canUseTool("Write", { path: "/test.ts" });

            yield { type: "result", result: "done" };
          },
        } as unknown as ReturnType<typeof query>;
      }
    );

    await executeClaudeTask("task-1");

    expect(toolResult).toEqual({
      behavior: "allow",
      updatedInput: { path: "/new.ts" },
    });
  });

  it("D3b: fills in updatedInput when an allow response omits it", async () => {
    mockWhere.mockResolvedValueOnce([makeTask()]);

    let toolResult: unknown;
    mockQuery.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ options }: any) => {
        return {
          async *[Symbol.asyncIterator]() {
            const canUseTool = options.canUseTool as (
              toolName: string,
              input: Record<string, unknown>
            ) => Promise<{ behavior: string; updatedInput?: Record<string, unknown> }>;

            mockWhere.mockResolvedValueOnce([
              { id: "notif-1", response: JSON.stringify({ behavior: "allow" }) },
            ]);

            toolResult = await canUseTool("Write", { path: "/test.ts" });

            yield { type: "result", result: "done" };
          },
        } as unknown as ReturnType<typeof query>;
      }
    );

    await executeClaudeTask("task-1");

    expect(toolResult).toEqual({
      behavior: "allow",
      updatedInput: { path: "/test.ts" },
    });
  });

  it("D4: returns deny when response is invalid JSON", async () => {
    mockWhere.mockResolvedValueOnce([makeTask()]);

    let toolResult: unknown;
    mockQuery.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ options }: any) => {
        return {
          async *[Symbol.asyncIterator]() {
            const canUseTool = options.canUseTool as (
              toolName: string,
              input: Record<string, unknown>
            ) => Promise<{ behavior: string }>;

            mockWhere.mockResolvedValueOnce([
              { id: "notif-1", response: "not valid json {{{" },
            ]);

            toolResult = await canUseTool("Write", { path: "/test.ts" });

            yield { type: "result", result: "done" };
          },
        } as unknown as ReturnType<typeof query>;
      }
    );

    await executeClaudeTask("task-1");

    expect(toolResult).toEqual({
      behavior: "deny",
      message: "Invalid response format",
    });
  });

  it("D5: reuses an answered permission for identical repeated tool input", async () => {
    mockWhere.mockResolvedValueOnce([makeTask()]);

    let firstResult: unknown;
    let secondResult: unknown;
    mockQuery.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ options }: any) => {
        return {
          async *[Symbol.asyncIterator]() {
            const canUseTool = options.canUseTool as (
              toolName: string,
              input: Record<string, unknown>
            ) => Promise<{ behavior: string }>;

            mockWhere.mockResolvedValueOnce([
              { id: "notif-1", response: JSON.stringify({ behavior: "allow" }) },
            ]);

            firstResult = await canUseTool("Write", { path: "/test.ts" });
            secondResult = await canUseTool("Write", { path: "/test.ts" });

            yield { type: "result", result: "done" };
          },
        } as unknown as ReturnType<typeof query>;
      }
    );

    await executeClaudeTask("task-1");

    const permissionNotifications = mockValues.mock.calls.filter(
      ([value]) => (value as { type?: string }).type === "permission_required"
    );

    expect(firstResult).toEqual({
      behavior: "allow",
      updatedInput: { path: "/test.ts" },
    });
    expect(secondResult).toEqual({
      behavior: "allow",
      updatedInput: { path: "/test.ts" },
    });
    expect(permissionNotifications).toHaveLength(1);
  });

  it("D5b: auto-approved tools keep the original input in updatedInput", async () => {
    mockWhere.mockResolvedValueOnce([makeTask()]);
    mockGetProfile.mockReturnValue({
      id: "general",
      name: "General",
      systemPrompt: "",
      canUseToolPolicy: {
        autoApprove: ["Bash"],
      },
    });

    let toolResult: unknown;
    mockQuery.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ options }: any) => {
        return {
          async *[Symbol.asyncIterator]() {
            const canUseTool = options.canUseTool as (
              toolName: string,
              input: Record<string, unknown>
            ) => Promise<{ behavior: string; updatedInput?: Record<string, unknown> }>;

            toolResult = await canUseTool("Bash", {
              command: "mkdir -p /tmp/ainative-outputs/task-1",
            });

            yield { type: "result", result: "done" };
          },
        } as unknown as ReturnType<typeof query>;
      }
    );

    await executeClaudeTask("task-1");

    expect(toolResult).toEqual({
      behavior: "allow",
      updatedInput: {
        command: "mkdir -p /tmp/ainative-outputs/task-1",
      },
    });
    expect(mockValues).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "permission_required" })
    );
  });

  it("D5c: saved tool permissions keep the original input in updatedInput", async () => {
    mockWhere.mockResolvedValueOnce([makeTask()]);
    mockIsToolAllowed.mockResolvedValue(true);

    let toolResult: unknown;
    mockQuery.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ options }: any) => {
        return {
          async *[Symbol.asyncIterator]() {
            const canUseTool = options.canUseTool as (
              toolName: string,
              input: Record<string, unknown>
            ) => Promise<{ behavior: string; updatedInput?: Record<string, unknown> }>;

            toolResult = await canUseTool("Write", { path: "/test.ts" });

            yield { type: "result", result: "done" };
          },
        } as unknown as ReturnType<typeof query>;
      }
    );

    await executeClaudeTask("task-1");

    expect(toolResult).toEqual({
      behavior: "allow",
      updatedInput: { path: "/test.ts" },
    });
    expect(mockValues).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "permission_required" })
    );
  });

  describe("D6: timeout behavior", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("auto-denies on timeout after 55s", async () => {
      mockWhere.mockResolvedValueOnce([makeTask()]);

      let toolResult: unknown;
      mockQuery.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ options }: any) => {
          return {
            async *[Symbol.asyncIterator]() {
              const canUseTool = options.canUseTool as (
                toolName: string,
                input: Record<string, unknown>
              ) => Promise<{ behavior: string }>;

              // Always return no response — notification never answered
              mockWhere.mockImplementation(() => {
                return Promise.resolve([
                  { id: "notif-1", response: null },
                ]) as unknown as ReturnType<typeof mockWhere>;
              });

              // Run canUseTool and timer advancement concurrently
              const toolPromise = canUseTool("Write", { path: "/test.ts" });

              // Advance past deadline: 55s / 1.5s intervals ≈ 37 polls
              for (let i = 0; i < 40; i++) {
                await vi.advanceTimersByTimeAsync(1500);
              }

              toolResult = await toolPromise;

              yield { type: "result", result: "done" };
            },
          } as unknown as ReturnType<typeof query>;
        }
      );

      await executeClaudeTask("task-1");

      expect(toolResult).toEqual({
        behavior: "deny",
        message: "Permission request timed out",
      });
    });

    it("reuses an in-flight permission request for identical input", async () => {
      mockWhere.mockResolvedValueOnce([makeTask()]);

      let releaseResponse: (() => void) | null = null;
      const pollStarted = new Promise<void>((resolve) => {
        releaseResponse = resolve;
      });

      let firstResult: unknown;
      let secondResult: unknown;

      mockQuery.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ options }: any) => {
          return {
            async *[Symbol.asyncIterator]() {
              const canUseTool = options.canUseTool as (
                toolName: string,
                input: Record<string, unknown>
              ) => Promise<{ behavior: string }>;

              mockWhere.mockImplementation(async () => {
                await pollStarted;
                return [
                  {
                    id: "notif-1",
                    response: JSON.stringify({ behavior: "allow" }),
                  },
                ];
              });

              const firstPromise = canUseTool("Write", { path: "/test.ts" });
              const secondPromise = canUseTool("Write", { path: "/test.ts" });

              await vi.advanceTimersByTimeAsync(0);
              releaseResponse?.();
              await vi.advanceTimersByTimeAsync(1500);

              [firstResult, secondResult] = await Promise.all([
                firstPromise,
                secondPromise,
              ]);

              yield { type: "result", result: "done" };
            },
          } as unknown as ReturnType<typeof query>;
        }
      );

      await executeClaudeTask("task-1");

      const permissionNotifications = mockValues.mock.calls.filter(
        ([value]) => (value as { type?: string }).type === "permission_required"
      );

      expect(firstResult).toEqual({
        behavior: "allow",
        updatedInput: { path: "/test.ts" },
      });
      expect(secondResult).toEqual({
        behavior: "allow",
        updatedInput: { path: "/test.ts" },
      });
      expect(permissionNotifications).toHaveLength(1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Group T6: withAinativeMcpServer — 5-source merge (TDR-035 §1)
// ═══════════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";

describe("withAinativeMcpServer (T6 — 5-source merge)", () => {
  it("T6-1: happy path — plugin server present + ainative is last key", async () => {
    const result = await withAinativeMcpServer(
      {},
      {},
      {},
      { "echo-server": { command: "python", args: [] } },
      null,
    );
    const keys = Object.keys(result);
    expect(keys).toContain("echo-server");
    expect(keys).toContain("relay");
    // relay must be the LAST key (TDR-035 §1 position 5)
    expect(keys[keys.length - 1]).toBe("relay");
  });

  it("T6-2: plugin cannot shadow relay — real server wins", async () => {
    const result = await withAinativeMcpServer(
      {},
      {},
      {},
      { relay: { command: "evil-override" } },
      null,
    );
    // The plugin's ainative key must be overwritten by the real in-process server
    expect((result.relay as Record<string, unknown>).__mockAinativeServer).toBe(true);
    // No extra keys from the plugin's attempt to shadow
    expect(Object.keys(result)).toEqual(["relay"]);
  });

  it("T6-3: merge order preserves upstream keys — profile → browser → external → plugin → relay", async () => {
    const result = await withAinativeMcpServer(
      { a: 1 },
      { b: 2 },
      { c: 3 },
      { d: 4 },
      null,
    );
    expect(Object.keys(result)).toEqual(["a", "b", "c", "d", "relay"]);
  });

  it("T6-4: source-grep invariant — both call sites pass loadPluginMcpServers({ runtime: 'claude-code' })", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../claude-agent.ts"),
      "utf8",
    );

    // Locate executeClaudeTask and resumeClaudeTask function bodies and
    // verify each contains exactly one loadPluginMcpServers call with the
    // correct runtime id. This is the structural parity invariant for T6.
    const executeStart = src.indexOf("async function executeClaudeTask(");
    const resumeStart = src.indexOf("async function resumeClaudeTask(");

    expect(executeStart).toBeGreaterThan(-1);
    expect(resumeStart).toBeGreaterThan(-1);

    // Slice each function body (up to the next top-level async function or EOF)
    const executeBody = src.slice(
      executeStart,
      resumeStart > executeStart ? resumeStart : src.length,
    );
    const resumeBody = src.slice(resumeStart);

    const pattern = `loadPluginMcpServers({ runtime: "claude-code" })`;
    expect(executeBody).toContain(pattern);
    expect(resumeBody).toContain(pattern);
  });
});
