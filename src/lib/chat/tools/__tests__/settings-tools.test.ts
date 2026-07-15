import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockState } = vi.hoisted(() => ({
  mockState: {
    store: new Map<string, string | null>(),
    lastWriteKey: null as string | null,
    lastWriteValue: null as string | null,
    setShouldThrow: false as boolean | string,
  },
}));

vi.mock("@/lib/settings/helpers", () => ({
  getSetting: vi.fn(async (key: string) => mockState.store.get(key) ?? null),
  setSetting: vi.fn(async (key: string, value: string) => {
    if (mockState.setShouldThrow) {
      throw new Error(
        typeof mockState.setShouldThrow === "string"
          ? mockState.setShouldThrow
          : "mock DB write failure"
      );
    }
    mockState.lastWriteKey = key;
    mockState.lastWriteValue = value;
    mockState.store.set(key, value);
  }),
}));

vi.mock("@/lib/environment/workspace-context", () => ({
  getWorkspaceContext: () => ({
    cwd: "/tmp/mock-cwd",
    gitBranch: "main",
    isWorktree: false,
    folderName: "mock-project",
  }),
}));

import { settingsTools } from "../settings-tools";

function getTool(name: string) {
  const tools = settingsTools({ projectId: "proj-1" } as never);
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

async function call(toolName: string, args: Record<string, unknown>) {
  const tool = getTool(toolName);
  return tool.handler(args);
}

/** Parse a tool's text content back into an object for assertions. */
function parse(result: { content: Array<{ type: string; text: string }>; isError?: boolean }) {
  return {
    data: JSON.parse(result.content[0].text) as Record<string, unknown>,
    isError: result.isError ?? false,
  };
}

beforeEach(() => {
  mockState.store.clear();
  mockState.lastWriteKey = null;
  mockState.lastWriteValue = null;
  mockState.setShouldThrow = false;
  vi.clearAllMocks();
});

describe("set_settings", () => {
  describe("positive path", () => {
    it("writes a valid value and returns oldValue + newValue", async () => {
      mockState.store.set("runtime.sdkTimeoutSeconds", "60");
      const { data, isError } = parse(
        await call("set_settings", {
          key: "runtime.sdkTimeoutSeconds",
          value: "120",
        })
      );
      expect(isError).toBe(false);
      expect(data).toEqual({
        key: "runtime.sdkTimeoutSeconds",
        oldValue: "60",
        newValue: "120",
      });
      expect(mockState.lastWriteKey).toBe("runtime.sdkTimeoutSeconds");
      expect(mockState.lastWriteValue).toBe("120");
    });

    it("returns '(unset)' as oldValue when the key had no prior value", async () => {
      const { data, isError } = parse(
        await call("set_settings", {
          key: "ollama.defaultModel",
          value: "llama3",
        })
      );
      expect(isError).toBe(false);
      expect(data.oldValue).toBe("(unset)");
      expect(data.newValue).toBe("llama3");
    });

    it("surfaces DB write failures as tool errors", async () => {
      mockState.setShouldThrow = "disk full";
      const { data, isError } = parse(
        await call("set_settings", {
          key: "ollama.baseUrl",
          value: "http://localhost:11434",
        })
      );
      expect(isError).toBe(true);
      expect(data.error).toBe("disk full");
    });
  });

  describe("unknown-key rejection", () => {
    it("rejects an unknown key with a clear error listing all valid keys", async () => {
      const { data, isError } = parse(
        await call("set_settings", {
          key: "totally.made.up.key",
          value: "whatever",
        })
      );
      expect(isError).toBe(true);
      expect(typeof data.error).toBe("string");
      const msg = data.error as string;
      // The error must name the bad key and list at least a few writable keys
      expect(msg).toContain("totally.made.up.key");
      expect(msg).toContain("runtime.sdkTimeoutSeconds");
      expect(msg).toContain("routing.preference");
      // A setSetting must NEVER be attempted for an unknown key
      expect(mockState.lastWriteKey).toBeNull();
    });
  });

  describe("secret / internal keys are NOT writable", () => {
    // This is the security guardrail: these keys are intentionally excluded
    // from WRITABLE_SETTINGS. If any ever get added, this test fails
    // immediately — a noisy failure is exactly what we want on regressions.
    const forbiddenKeys = [
      "auth.apiKey",
      "openai.authApiKey",
      "auth.apiKeySource",
      "openai.authApiKeySource",
      "auth.method",
      "permissions.allow",
      "usage.budgetPolicy",
      "usage.budgetWarningState",
      "usage.pricingRegistry",
      "browser.chromeDevtoolsConfig",
      "browser.playwrightConfig",
    ];
    for (const key of forbiddenKeys) {
      it(`rejects write to "${key}"`, async () => {
        const { data, isError } = parse(
          await call("set_settings", { key, value: "attacker-value" })
        );
        expect(isError).toBe(true);
        expect((data.error as string).toLowerCase()).toContain("not writable");
        expect(mockState.lastWriteKey).toBeNull();
      });
    }
  });

  describe("per-key validation", () => {
    it("rejects runtime.sdkTimeoutSeconds below 10", async () => {
      const { data, isError } = parse(
        await call("set_settings", { key: "runtime.sdkTimeoutSeconds", value: "5" })
      );
      expect(isError).toBe(true);
      expect(data.error as string).toContain("10");
      expect(mockState.lastWriteKey).toBeNull();
    });

    it("rejects runtime.sdkTimeoutSeconds above 300", async () => {
      const { data, isError } = parse(
        await call("set_settings", { key: "runtime.sdkTimeoutSeconds", value: "301" })
      );
      expect(isError).toBe(true);
      expect(data.error as string).toContain("300");
    });

    it("rejects non-numeric runtime.sdkTimeoutSeconds", async () => {
      const { isError } = parse(
        await call("set_settings", { key: "runtime.sdkTimeoutSeconds", value: "many" })
      );
      expect(isError).toBe(true);
    });

    it("rejects routing.preference not in enum", async () => {
      const { isError } = parse(
        await call("set_settings", { key: "routing.preference", value: "random" })
      );
      expect(isError).toBe(true);
    });

    it("accepts routing.preference enum values", async () => {
      for (const v of ["cost", "latency", "quality", "manual"]) {
        const { isError } = parse(
          await call("set_settings", { key: "routing.preference", value: v })
        );
        expect(isError).toBe(false);
      }
    });

    it("rejects browser.playwrightEnabled with non-bool string", async () => {
      const { isError } = parse(
        await call("set_settings", { key: "browser.playwrightEnabled", value: "yes" })
      );
      expect(isError).toBe(true);
    });

    it("accepts browser.playwrightEnabled 'true' and 'false'", async () => {
      for (const v of ["true", "false"]) {
        const { isError } = parse(
          await call("set_settings", { key: "browser.playwrightEnabled", value: v })
        );
        expect(isError).toBe(false);
      }
    });

    it("rejects learning.contextCharLimit not aligned to step of 1000", async () => {
      const { isError } = parse(
        await call("set_settings", { key: "learning.contextCharLimit", value: "2500" })
      );
      expect(isError).toBe(true);
    });

    it("accepts learning.contextCharLimit on step boundary", async () => {
      const { isError } = parse(
        await call("set_settings", { key: "learning.contextCharLimit", value: "4000" })
      );
      expect(isError).toBe(false);
    });

    it("rejects empty ollama.baseUrl", async () => {
      const { isError } = parse(
        await call("set_settings", { key: "ollama.baseUrl", value: "   " })
      );
      expect(isError).toBe(true);
    });

    it("rejects remote Ollama HTTP because chat cannot grant transport consent", async () => {
      const { data, isError } = parse(
        await call("set_settings", {
          key: "ollama.baseUrl",
          value: "http://ollama.lan:11434",
        })
      );
      expect(isError).toBe(true);
      expect(data.error).toMatch(/Allow insecure remote HTTP/i);
    });

    it("rejects budget_max_cost_per_task below 0.5", async () => {
      const { isError } = parse(
        await call("set_settings", { key: "budget_max_cost_per_task", value: "0.1" })
      );
      expect(isError).toBe(true);
    });

    it("rejects budget_max_cost_per_task above 50", async () => {
      const { isError } = parse(
        await call("set_settings", { key: "budget_max_cost_per_task", value: "51" })
      );
      expect(isError).toBe(true);
    });

    it("accepts budget_max_cost_per_task fractional value in range", async () => {
      const { isError } = parse(
        await call("set_settings", { key: "budget_max_cost_per_task", value: "12.5" })
      );
      expect(isError).toBe(false);
    });
  });
});

describe("get_settings", () => {
  it("tags writable keys with writable: true and read-only keys with false", async () => {
    mockState.store.set("runtime.sdkTimeoutSeconds", "60");
    mockState.store.set("auth_method", "oauth");
    const { data, isError } = parse(await call("get_settings", {}));
    expect(isError).toBe(false);
    const entries = data as Record<string, { value: string | null; writable: boolean }>;
    expect(entries["runtime.sdkTimeoutSeconds"].writable).toBe(true);
    expect(entries["auth_method"].writable).toBe(false);
    // Workspace context keys are always read-only
    expect(entries["workspace_cwd"].writable).toBe(false);
    expect(entries["workspace_cwd"].value).toBe("/tmp/mock-cwd");
  });

  it("single-key lookup returns writable flag", async () => {
    mockState.store.set("runtime.maxTurns", "25");
    const { data } = parse(
      await call("get_settings", { key: "runtime.maxTurns" })
    );
    expect(data).toEqual({
      key: "runtime.maxTurns",
      value: "25",
      writable: true,
    });
  });

  it("workspace_* keys route through workspace context", async () => {
    const { data } = parse(
      await call("get_settings", { key: "workspace_git_branch" })
    );
    expect(data).toEqual({ key: "workspace_git_branch", value: "main" });
  });
});
