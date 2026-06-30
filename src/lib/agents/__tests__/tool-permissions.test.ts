import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
  },
}));

vi.mock("@/lib/settings/permissions", () => ({
  isToolAllowed: vi.fn().mockResolvedValue(false),
}));

// Default: no plugin registered → resolvePluginToolApproval returns null.
// Individual tests override with vi.mocked(...).mockResolvedValueOnce(...).
vi.mock("@/lib/plugins/capability-check", () => ({
  resolvePluginToolApproval: vi.fn().mockResolvedValue(null),
}));

import { handleToolPermission, clearPermissionCache } from "@/lib/agents/tool-permissions";
import { resolvePluginToolApproval } from "@/lib/plugins/capability-check";

describe("handleToolPermission — SDK filesystem and Skill auto-allow", () => {
  beforeEach(() => {
    clearPermissionCache("test-task");
    clearPermissionCache("test-task-edit");
  });

  it("auto-allows Read without creating a notification", async () => {
    const result = await handleToolPermission("test-task", "Read", { file_path: "/tmp/x" });
    expect(result.behavior).toBe("allow");
    expect(result.updatedInput).toEqual({ file_path: "/tmp/x" });
  });

  it("auto-allows Grep", async () => {
    const result = await handleToolPermission("test-task", "Grep", { pattern: "foo" });
    expect(result.behavior).toBe("allow");
  });

  it("auto-allows Glob", async () => {
    const result = await handleToolPermission("test-task", "Glob", { pattern: "**/*.ts" });
    expect(result.behavior).toBe("allow");
  });

  it("auto-allows Skill invocations", async () => {
    const result = await handleToolPermission("test-task", "Skill", { skill: "code-reviewer" });
    expect(result.behavior).toBe("allow");
  });

  it("does NOT auto-allow Edit (must route through notification flow)", async () => {
    const { db } = await import("@/lib/db");
    const insertSpy = vi.spyOn(db, "insert");
    handleToolPermission("test-task-edit", "Edit", { file_path: "/tmp/x", content: "y" });
    await new Promise((r) => setTimeout(r, 10));
    expect(insertSpy).toHaveBeenCalled();
  });

  it("profile autoDeny for Read wins over auto-allow", async () => {
    const result = await handleToolPermission(
      "test-task",
      "Read",
      { file_path: "/tmp/x" },
      { autoApprove: [], autoDeny: ["Read"] },
    );
    expect(result.behavior).toBe("deny");
  });
});

describe("handleToolPermission — T10 plugin-MCP per-tool approval overlay (Layer 1.8)", () => {
  beforeEach(() => {
    clearPermissionCache("t10-task");
    vi.mocked(resolvePluginToolApproval).mockReset();
    vi.mocked(resolvePluginToolApproval).mockResolvedValue(null);
    // TDR-037 — Layer 1.8 is OFF by default. These tests exercise the
    // layer's behavior when operators opt in via the env flag. The layer
    // is parked until third-party plugin distribution is actually shipped.
    process.env.RELAY_PER_TOOL_APPROVAL = "1";
  });

  afterEach(() => {
    delete process.env.RELAY_PER_TOOL_APPROVAL;
  });

  it("'never' mode auto-allows the plugin tool without a notification", async () => {
    vi.mocked(resolvePluginToolApproval).mockResolvedValueOnce("never");
    const { db } = await import("@/lib/db");
    const insertSpy = vi.spyOn(db, "insert");
    insertSpy.mockClear();

    const result = await handleToolPermission(
      "t10-task",
      "mcp__echo-server__echo",
      { text: "hi" },
    );

    expect(result.behavior).toBe("allow");
    expect(result.updatedInput).toEqual({ text: "hi" });
    expect(vi.mocked(resolvePluginToolApproval)).toHaveBeenCalledWith(
      "mcp__echo-server__echo",
    );
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("'prompt' mode falls through to the notification path", async () => {
    vi.mocked(resolvePluginToolApproval).mockResolvedValueOnce("prompt");
    const { db } = await import("@/lib/db");
    const insertSpy = vi.spyOn(db, "insert");
    insertSpy.mockClear();

    handleToolPermission("t10-task", "mcp__echo-server__echo", { text: "x" });
    // Let the async insertion + polling kick off.
    await new Promise((r) => setTimeout(r, 10));

    expect(insertSpy).toHaveBeenCalled();
  });

  it("'approve' mode falls through to the notification path", async () => {
    vi.mocked(resolvePluginToolApproval).mockResolvedValueOnce("approve");
    const { db } = await import("@/lib/db");
    const insertSpy = vi.spyOn(db, "insert");
    insertSpy.mockClear();

    handleToolPermission("t10-task", "mcp__echo-server__shout", { text: "y" });
    await new Promise((r) => setTimeout(r, 10));

    expect(insertSpy).toHaveBeenCalled();
  });

  it("null decision (non-plugin or not accepted) falls through", async () => {
    vi.mocked(resolvePluginToolApproval).mockResolvedValueOnce(null);
    const { db } = await import("@/lib/db");
    const insertSpy = vi.spyOn(db, "insert");
    insertSpy.mockClear();

    handleToolPermission("t10-task", "mcp__unknown__tool", { text: "z" });
    await new Promise((r) => setTimeout(r, 10));

    expect(insertSpy).toHaveBeenCalled();
  });

  it("does NOT invoke resolvePluginToolApproval for ordinary (non-mcp__) tools", async () => {
    vi.mocked(resolvePluginToolApproval).mockClear();

    // Read auto-allows at Layer 1.75 — still a valid happy path.
    await handleToolPermission("t10-task", "Read", { file_path: "/tmp/x" });

    expect(vi.mocked(resolvePluginToolApproval)).not.toHaveBeenCalled();
  });
});

describe("handleToolPermission — Layer 1.8 parked by default (TDR-037)", () => {
  beforeEach(() => {
    clearPermissionCache("parked-task");
    vi.mocked(resolvePluginToolApproval).mockReset();
    // Explicitly DO NOT set RELAY_PER_TOOL_APPROVAL — assert it's OFF.
    delete process.env.RELAY_PER_TOOL_APPROVAL;
  });

  it("skips Layer 1.8 resolution when RELAY_PER_TOOL_APPROVAL is unset (self-extension-first posture)", async () => {
    vi.mocked(resolvePluginToolApproval).mockResolvedValueOnce("never");

    // Without the flag, the 'never' override is not consulted and the
    // request falls through to the notification path. We don't await the
    // full result here (it would block on the notification); we just assert
    // the resolver wasn't called.
    handleToolPermission("parked-task", "mcp__echo-server__echo", { text: "hi" });
    await new Promise((r) => setTimeout(r, 10));

    expect(vi.mocked(resolvePluginToolApproval)).not.toHaveBeenCalled();
  });
});
