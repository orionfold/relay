import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Exercises the settings-glance aggregator's shadow-path discipline: EVERY
 * source is resolved independently, so one failing read nulls only its own
 * field(s) while the rest resolve. The leaf lib sources are mocked (they can't
 * be driven by data without a full runtime/license/db fixture); the assertions
 * target the route's own aggregation + null-mapping contract, not the libs.
 */

const OK = {
  // getRuntimeSetupStates returns a record; two configured runtimes here.
  runtimeStates: {
    "claude-code": { configured: true },
    "openai-codex-app-server": { configured: true },
    "anthropic-direct": { configured: false },
  },
  runtime: { runtimeId: "claude-code", runtimeLabel: "Claude Code" },
  model: { modelId: "claude-opus-4-8", source: "default" },
  license: "Acme Corp",
  budget: { policy: { overall: { monthlySpendCapUsd: 200 } } },
  routing: "quality",
  presets: ["git-safe"],
  allowed: ["Bash(git status)", "Read(*)"],
  exa: "true",
  channels: 3,
  // getSetting is keyed; the mock returns per-key values below.
  settings: {
    "web.exaSearchEnabled": "true",
    "runtime.sdkTimeoutSeconds": "90",
    "runtime.maxTurns": "12",
    "environment.autoPromoteSkills": "false",
  } as Record<string, string | null>,
};

function mockAll(
  o: Partial<typeof OK> & {
    throwRuntime?: boolean;
    throwBudget?: boolean;
  } = {}
) {
  const c = { ...OK, ...o };
  vi.doMock("@/lib/settings/runtime-routing-status", () => ({
    getRuntimeRoutingStatuses: async () => {
      if (o.throwRuntime) throw new Error("no runtime");
      return Object.entries(c.runtimeStates).map(([runtimeId, state]) => ({
        runtimeId,
        label: runtimeId === "claude-code" ? "Claude Code" : runtimeId,
        modelId:
          runtimeId === c.runtime.runtimeId ? c.model.modelId : null,
        configured: state.configured,
        ready: state.configured,
      }));
    },
    pickReadyRuntime: (statuses: Array<{ ready: boolean }>) =>
      statuses.find((status) => status.ready) ?? null,
  }));
  vi.doMock("@/lib/licensing/store", () => ({
    getLicensedIdentity: () => c.license,
  }));
  vi.doMock("@/lib/settings/budget-guardrails", () => ({
    getBudgetGuardrailSnapshot: async () => {
      if (o.throwBudget) throw new Error("budget policy corrupt");
      return c.budget;
    },
  }));
  vi.doMock("@/lib/settings/routing", () => ({
    getRoutingSettings: async () => ({
      preference: c.routing,
      policy: {
        version: 1,
        eligibleRuntimeIds: Object.keys(c.runtimeStates),
        manualDefaultRuntimeId: "claude-code",
        automaticFallback: true,
      },
      source: "stored",
      needsPersistence: false,
      repairReason: null,
    }),
  }));
  vi.doMock("@/lib/settings/permission-presets", () => ({
    getActivePresets: async () => c.presets,
  }));
  vi.doMock("@/lib/settings/permissions", () => ({
    getAllowedPermissions: async () => c.allowed,
  }));
  vi.doMock("@/lib/settings/helpers", () => ({
    // Key-aware: exa override still supported via c.exa for the exa-specific
    // tests; every other key reads from c.settings.
    getSetting: async (key: string) => {
      if (key === "web.exaSearchEnabled" && "exa" in o) return c.exa;
      return c.settings[key] ?? null;
    },
  }));
  vi.doMock("@/lib/db", () => ({
    db: {
      select: () => ({ from: async () => [{ value: c.channels }] }),
    },
  }));
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock("@/lib/settings/runtime-routing-status");
  vi.doUnmock("@/lib/licensing/store");
  vi.doUnmock("@/lib/settings/budget-guardrails");
  vi.doUnmock("@/lib/settings/routing");
  vi.doUnmock("@/lib/settings/permission-presets");
  vi.doUnmock("@/lib/settings/permissions");
  vi.doUnmock("@/lib/settings/helpers");
  vi.doUnmock("@/lib/db");
});

describe("GET /api/settings/glance — happy path", () => {
  it("aggregates every source into one payload", async () => {
    mockAll();
    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      activeRuntimeLabel: "Claude Code",
      activeModel: "claude-opus-4-8",
      routingPreference: "quality",
      configuredRuntimeCount: 2,
      readyRuntimeCount: 2,
      runtimeReadiness: {
        state: "ready",
        label: "2 runtimes ready",
        readyRuntimeLabels: ["Claude Code", "openai-codex-app-server"],
        attentionRuntimeLabels: [],
      },
      sdkTimeoutSeconds: 90,
      maxTurns: 12,
      licenseTag: { kind: "licensed", label: "Acme Corp" },
      budgetMonthlyCapUsd: 200,
      activePreset: "git-safe",
      allowedPermissionCount: 2,
      webSearchEnabled: true,
      channelCount: 3,
      autoPromoteSkills: false,
    });
  });

  it("fails open to community when no license", async () => {
    mockAll({ license: null as unknown as string });
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.licenseTag).toEqual({ kind: "community" });
  });

  it("maps exa 'false' to webSearchEnabled=false, unset to null", async () => {
    mockAll({ exa: "false" });
    const { GET } = await import("../route");
    expect((await (await GET()).json()).webSearchEnabled).toBe(false);
    vi.resetModules();
    mockAll({ exa: null as unknown as string });
    const { GET: GET2 } = await import("../route");
    expect((await (await GET2()).json()).webSearchEnabled).toBeNull();
  });
});

describe("GET /api/settings/glance — shadow paths (one source down)", () => {
  it("nulls only the runtime fields when runtime resolution throws", async () => {
    mockAll({ throwRuntime: true });
    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    // Runtime fields null...
    expect(body.activeRuntimeLabel).toBeNull();
    expect(body.activeModel).toBeNull();
    expect(body.runtimeReadiness).toBeNull();
    // ...but every other source still resolved.
    expect(body.licenseTag).toEqual({ kind: "licensed", label: "Acme Corp" });
    expect(body.budgetMonthlyCapUsd).toBe(200);
    expect(body.channelCount).toBe(3);
  });

  it("nulls only the budget cap when the budget read throws", async () => {
    mockAll({ throwBudget: true });
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.budgetMonthlyCapUsd).toBeNull();
    // The rest survives.
    expect(body.activeModel).toBe("claude-opus-4-8");
    expect(body.channelCount).toBe(3);
  });

  it("picks the most permissive active preset", async () => {
    mockAll({ presets: ["read-only", "git-safe", "full-auto"] });
    const { GET } = await import("../route");
    expect((await (await GET()).json()).activePreset).toBe("full-auto");
  });
});
