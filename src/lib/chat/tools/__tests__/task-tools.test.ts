import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

interface TaskRow {
  id: string;
  title: string;
  status: string;
  projectId: string | null;
  agentProfile: string | null;
  assignedAgent: string | null;
  [key: string]: unknown;
}

const { mockState, mockExecuteTaskWithAgent } = vi.hoisted(() => ({
  mockState: {
    rows: [] as TaskRow[],
    lastInsertValues: null as Record<string, unknown> | null,
    lastUpdateValues: null as Record<string, unknown> | null,
  },
  mockExecuteTaskWithAgent: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/db", () => {
  const selectBuilder = {
    from() { return this; },
    where() { return this; },
    orderBy() { return this; },
    limit() {
      return Promise.resolve(mockState.rows);
    },
    get() { return Promise.resolve(mockState.rows[0]); },
    then<TResolve>(resolve: (rows: TaskRow[]) => TResolve) {
      return Promise.resolve(mockState.rows).then(resolve);
    },
  };
  return {
    db: {
      select: () => selectBuilder,
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          mockState.lastInsertValues = v;
          mockState.rows = [{
            id: "task-1",
            title: "",
            status: "planned",
            projectId: null,
            agentProfile: null,
            assignedAgent: null,
            ...v,
          } as TaskRow];
          return Promise.resolve();
        },
      }),
      update: () => ({
        set: (v: Record<string, unknown>) => {
          mockState.lastUpdateValues = v;
          if (mockState.rows[0]) {
            mockState.rows[0] = { ...mockState.rows[0], ...v } as TaskRow;
          }
          return { where: () => Promise.resolve() };
        },
      }),
    },
  };
});

vi.mock("@/lib/db/schema", () => ({
  tasks: {
    id: "id",
    projectId: "projectId",
    status: "status",
    priority: "priority",
    createdAt: "createdAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  and: () => ({}),
  desc: () => ({}),
  like: () => ({}),
}));

// Mock the profile registry: accept "general" and "code-reviewer"
// and "researcher", reject everything else.
vi.mock("@/lib/agents/profiles/registry", () => {
  const validIds = new Set(["general", "code-reviewer", "researcher"]);
  return {
    getProfile: (id: string) =>
      validIds.has(id)
        ? { id, name: id, description: "test", tags: [], skillMd: "", allowedTools: [], mcpServers: {}, systemPrompt: "" }
        : undefined,
    listProfiles: () => Array.from(validIds).map((id) => ({ id, name: id })),
  };
});

// Mock the runtime catalog so isAgentRuntimeId is deterministic.
vi.mock("@/lib/agents/runtime/catalog", () => ({
  DEFAULT_AGENT_RUNTIME: "claude",
  SUPPORTED_AGENT_RUNTIMES: ["claude", "anthropic-direct", "openai-direct"],
  isAgentRuntimeId: (id: string) => ["claude", "anthropic-direct", "openai-direct"].includes(id),
}));

// Mock the router so execute_task's dynamic import doesn't explode.
vi.mock("@/lib/agents/router", () => ({
  executeTaskWithAgent: mockExecuteTaskWithAgent,
}));

import { taskTools } from "../task-tools";

function getTool(name: string, ctx: { projectId?: string | null } = { projectId: undefined }) {
  const tools = taskTools(ctx as never);
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

function parseArgs(toolName: string, args: unknown) {
  const tool = getTool(toolName);
  return z.object(tool.zodShape).safeParse(args);
}

function callHandler(toolName: string, args: unknown, ctx: { projectId?: string | null } = { projectId: undefined }) {
  const tool = getTool(toolName, ctx);
  return tool.handler(args);
}

function getToolResultText(result: { content: Array<{ type: string; text: string }>; isError?: boolean }) {
  return result.content[0]?.text ?? "";
}

beforeEach(() => {
  mockState.rows = [];
  mockState.lastInsertValues = null;
  mockState.lastUpdateValues = null;
  mockExecuteTaskWithAgent.mockClear();
});

describe("create_task agentProfile Zod validation", () => {
  const base = { title: "test task" };

  it("accepts a valid profile id", () => {
    const result = parseArgs("create_task", { ...base, agentProfile: "general" });
    expect(result.success).toBe(true);
  });

  it("accepts another valid profile id", () => {
    const result = parseArgs("create_task", { ...base, agentProfile: "code-reviewer" });
    expect(result.success).toBe(true);
  });

  it("accepts omitted agentProfile", () => {
    const result = parseArgs("create_task", base);
    expect(result.success).toBe(true);
  });

  it("rejects a runtime id passed as agentProfile", () => {
    const result = parseArgs("create_task", { ...base, agentProfile: "anthropic-direct" });
    expect(result.success).toBe(false);
  });

  it("rejects an arbitrary invalid string", () => {
    const result = parseArgs("create_task", { ...base, agentProfile: "not-a-profile" });
    expect(result.success).toBe(false);
  });
});

describe("create_task handler-level error messages", () => {
  it("returns a descriptive error naming the invalid value and listing valid profile ids", async () => {
    const result = await callHandler("create_task", {
      title: "test task",
      agentProfile: "anthropic-direct",
    });
    expect(result.isError).toBe(true);
    const text = getToolResultText(result);
    expect(text).toContain("anthropic-direct");
    expect(text).toMatch(/code-reviewer|general|researcher/);
  });

  it("inserts a task when agentProfile is valid", async () => {
    const result = await callHandler("create_task", {
      title: "test task",
      agentProfile: "general",
    });
    expect(result.isError).toBeFalsy();
    expect(mockState.lastInsertValues?.agentProfile).toBe("general");
  });

  it("inserts with null agentProfile when omitted", async () => {
    await callHandler("create_task", { title: "test task" });
    expect(mockState.lastInsertValues?.agentProfile).toBe(null);
  });
});

describe("update_task agentProfile Zod validation", () => {
  const base = { taskId: "task-1" };

  it("accepts a valid profile id", () => {
    const result = parseArgs("update_task", { ...base, agentProfile: "researcher" });
    expect(result.success).toBe(true);
  });

  it("rejects a runtime id", () => {
    const result = parseArgs("update_task", { ...base, agentProfile: "anthropic-direct" });
    expect(result.success).toBe(false);
  });
});

describe("update_task handler-level agentProfile validation", () => {
  beforeEach(() => {
    mockState.rows = [{
      id: "task-1",
      title: "existing",
      status: "planned",
      projectId: null,
      agentProfile: null,
      assignedAgent: null,
    } as TaskRow];
  });

  it("returns a descriptive error when the new agentProfile is invalid", async () => {
    const result = await callHandler("update_task", {
      taskId: "task-1",
      agentProfile: "anthropic-direct",
    });
    expect(result.isError).toBe(true);
    expect(getToolResultText(result)).toContain("anthropic-direct");
  });

  it("updates when the new agentProfile is valid", async () => {
    const result = await callHandler("update_task", {
      taskId: "task-1",
      agentProfile: "code-reviewer",
    });
    expect(result.isError).toBeFalsy();
    expect(mockState.lastUpdateValues?.agentProfile).toBe("code-reviewer");
  });
});

describe("execute_task stale agentProfile surfacing", () => {
  it("returns synchronous error when the stored task.agentProfile is invalid", async () => {
    mockState.rows = [{
      id: "task-1",
      title: "stale task",
      status: "planned",
      projectId: null,
      agentProfile: "anthropic-direct",
      assignedAgent: null,
    } as TaskRow];

    const result = await callHandler("execute_task", { taskId: "task-1" });
    expect(result.isError).toBe(true);
    const text = getToolResultText(result);
    expect(text).toContain("anthropic-direct");
    expect(text).toContain("update_task");
  });

  it("queues execution when task.agentProfile is valid", async () => {
    mockState.rows = [{
      id: "task-1",
      title: "ok task",
      status: "planned",
      projectId: null,
      agentProfile: "general",
      assignedAgent: null,
    } as TaskRow];

    const result = await callHandler("execute_task", { taskId: "task-1" });
    expect(result.isError).toBeFalsy();
  });

  it("queues execution when task.agentProfile is null (runtime falls back to general)", async () => {
    mockState.rows = [{
      id: "task-1",
      title: "ok task",
      status: "planned",
      projectId: null,
      agentProfile: null,
      assignedAgent: null,
    } as TaskRow];

    const result = await callHandler("execute_task", { taskId: "task-1" });
    expect(result.isError).toBeFalsy();
  });
});

describe("create_task assignedAgent runtime validation", () => {
  it("returns a descriptive error listing valid runtime ids when assignedAgent is invalid", async () => {
    const result = await callHandler("create_task", {
      title: "test task",
      assignedAgent: "claude-bogus",
    });
    expect(result.isError).toBe(true);
    const text = getToolResultText(result);
    expect(text).toContain("claude-bogus");
    expect(text).toMatch(/Invalid runtime/i);
    expect(text).toMatch(/anthropic-direct|openai-direct|claude/);
  });

  it("inserts with the given assignedAgent when it is a valid runtime id", async () => {
    const result = await callHandler("create_task", {
      title: "test task",
      assignedAgent: "anthropic-direct",
    });
    expect(result.isError).toBeFalsy();
    expect(mockState.lastInsertValues?.assignedAgent).toBe("anthropic-direct");
  });
});

describe("execute_task assignedAgent runtime validation", () => {
  beforeEach(() => {
    mockState.rows = [{
      id: "task-1",
      title: "existing",
      status: "planned",
      projectId: null,
      agentProfile: null,
      assignedAgent: null,
    } as TaskRow];
  });

  it("returns an error listing valid runtime ids when the passed assignedAgent is invalid", async () => {
    const result = await callHandler("execute_task", {
      taskId: "task-1",
      assignedAgent: "claude-bogus",
    });
    expect(result.isError).toBe(true);
    const text = getToolResultText(result);
    expect(text).toContain("claude-bogus");
    expect(text).toMatch(/Invalid runtime/i);
  });

  it("uses automatic routing when neither the request nor task pins a runtime", async () => {
    const result = await callHandler("execute_task", { taskId: "task-1" });

    expect(result.isError).toBeFalsy();
    expect(mockExecuteTaskWithAgent).toHaveBeenCalledWith("task-1", null);
    expect(JSON.parse(getToolResultText(result))).toMatchObject({
      taskId: "task-1",
      runtime: "automatic",
    });
  });
});

describe("list_tasks empty-result note", () => {
  it("returns an envelope with note when a project filter is active and zero rows result", async () => {
    mockState.rows = [];
    const result = await callHandler("list_tasks", {}, { projectId: "proj-active" });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(getToolResultText(result));
    expect(parsed).toMatchObject({ tasks: [], note: expect.stringContaining("proj-active") });
    expect(parsed.note).toContain("projectId: null");
    expect(parsed.note).toContain("get_task");
  });

  it("returns the plain array (no note) when a project filter is active and rows are returned", async () => {
    mockState.rows = [{
      id: "task-1",
      title: "existing",
      status: "planned",
      projectId: "proj-active",
      agentProfile: null,
      assignedAgent: null,
    } as TaskRow];

    const result = await callHandler("list_tasks", {}, { projectId: "proj-active" });
    const parsed = JSON.parse(getToolResultText(result));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
  });

  it("returns the plain array (no note) when no filter is active and zero rows result", async () => {
    mockState.rows = [];
    const result = await callHandler("list_tasks", {}, { projectId: undefined });
    const parsed = JSON.parse(getToolResultText(result));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(0);
  });
});

describe("get_task AC #4: failed tasks remain findable", () => {
  it("finds a task regardless of status (including failed)", async () => {
    mockState.rows = [{
      id: "task-1",
      title: "a failed task",
      status: "failed",
      projectId: "proj-other",
      agentProfile: null,
      assignedAgent: null,
    } as TaskRow];

    const result = await callHandler("get_task", { taskId: "task-1" });
    expect(result.isError).toBeFalsy();
    const text = getToolResultText(result);
    expect(text).toContain("task-1");
    expect(text).toContain("failed");
  });

  it("does not apply a project filter (returns the task even when stored under a different project)", async () => {
    mockState.rows = [{
      id: "task-1",
      title: "cross-project task",
      status: "completed",
      projectId: "proj-A",
      agentProfile: null,
      assignedAgent: null,
    } as TaskRow];

    const result = await callHandler("get_task", { taskId: "task-1" }, { projectId: "proj-B" });
    expect(result.isError).toBeFalsy();
  });
});
