import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Exercises the settings-glance aggregator's shadow-path discipline: EVERY
 * source is resolved independently, so one failing read nulls only its own
 * field(s) while the rest resolve. The leaf lib sources are mocked (they can't
 * be driven by data without a full runtime/license/db fixture); the assertions
 * target the route's own aggregation + null-mapping contract, not the libs.
 */

const OK = {
  runtime: { runtimeId: "claude-code", runtimeLabel: "Claude Code" },
  model: { modelId: "claude-opus-4-8", source: "default" },
  license: "Acme Corp",
  budget: { policy: { overall: { monthlySpendCapUsd: 200 } } },
  routing: "quality",
  presets: ["git-safe"],
  allowed: ["Bash(git status)", "Read(*)"],
  exa: "true",
  channels: 3,
};

function mockAll(o: Partial<typeof OK> & { throwRuntime?: boolean } = {}) {
  const c = { ...OK, ...o };
  vi.doMock("@/lib/settings/runtime-setup", () => ({
    getRuntimeSetupStates: async () => {
      if (o.throwRuntime) throw new Error("no runtime");
      return {};
    },
    pickActiveRuntime: () => ({
      runtimeId: c.runtime.runtimeId,
      runtimeLabel: c.runtime.runtimeLabel,
      providerId: "anthropic",
    }),
  }));
  vi.doMock("@/lib/agents/runtime/model-preference", () => ({
    resolvePreferredModel: async () => c.model,
  }));
  vi.doMock("@/lib/licensing/store", () => ({
    getLicensedIdentity: () => c.license,
  }));
  vi.doMock("@/lib/settings/budget-guardrails", () => ({
    getBudgetGuardrailSnapshot: async () => c.budget,
  }));
  vi.doMock("@/lib/settings/routing", () => ({
    getRoutingPreference: async () => c.routing,
  }));
  vi.doMock("@/lib/settings/permission-presets", () => ({
    getActivePresets: async () => c.presets,
  }));
  vi.doMock("@/lib/settings/permissions", () => ({
    getAllowedPermissions: async () => c.allowed,
  }));
  vi.doMock("@/lib/settings/helpers", () => ({
    getSetting: async () => c.exa,
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
  vi.doUnmock("@/lib/settings/runtime-setup");
  vi.doUnmock("@/lib/agents/runtime/model-preference");
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
      licenseTag: { kind: "licensed", label: "Acme Corp" },
      budgetMonthlyCapUsd: 200,
      activePreset: "git-safe",
      allowedPermissionCount: 2,
      webSearchEnabled: true,
      channelCount: 3,
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
    // ...but every other source still resolved.
    expect(body.licenseTag).toEqual({ kind: "licensed", label: "Acme Corp" });
    expect(body.budgetMonthlyCapUsd).toBe(200);
    expect(body.channelCount).toBe(3);
  });

  it("nulls only the budget cap when the budget read throws", async () => {
    mockAll();
    vi.doMock("@/lib/settings/budget-guardrails", () => ({
      getBudgetGuardrailSnapshot: async () => {
        throw new Error("budget policy corrupt");
      },
    }));
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
