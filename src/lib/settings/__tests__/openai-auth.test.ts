import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockValues = vi.fn();
const mockSet = vi.fn();
const mockRun = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: mockFrom }),
    insert: () => ({ values: mockValues }),
    update: () => ({ set: mockSet }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  settings: { key: "key" },
}));

vi.mock("@/lib/utils/crypto", () => ({
  encrypt: vi.fn((v: string) => `encrypted:${v}`),
  decrypt: vi.fn((v: string) => v.replace("encrypted:", "")),
}));

const isolatedAuthPath = join(tmpdir(), "relay-openai-isolated-auth.json");
const globalAuthPath = join(tmpdir(), "relay-openai-global-auth.json");

vi.mock("@/lib/utils/ainative-paths", () => ({
  getAinativeCodexAuthPath: () => isolatedAuthPath,
  getGlobalCodexAuthPath: () => globalAuthPath,
}));

mockFrom.mockReturnValue({ where: mockWhere });
mockValues.mockReturnValue({ run: mockRun });
mockSet.mockReturnValue({ where: vi.fn().mockReturnValue({ run: mockRun }) });

function mockGetSettingSequence(values: (string | null)[]) {
  let callIndex = 0;
  mockWhere.mockImplementation(() => {
    const val = values[callIndex] ?? null;
    callIndex++;
    return val !== null ? [{ value: val }] : [];
  });
}

describe("openai auth settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("OPENAI_API_KEY", "");
    mockWhere.mockReturnValue([]);
    rmSync(isolatedAuthPath, { force: true });
    rmSync(globalAuthPath, { force: true });
  });

  afterEach(() => {
    rmSync(isolatedAuthPath, { force: true });
    rmSync(globalAuthPath, { force: true });
  });

  it("defaults to ChatGPT mode without claiming a connection", async () => {
    const { getOpenAIAuthSettings } = await import("../openai-auth");
    const result = await getOpenAIAuthSettings();
    expect(result.method).toBe("oauth");
    expect(result.hasKey).toBe(false);
    expect(result.oauthConnected).toBe(false);
    expect(result.existingSessionAvailable).toBe(false);
  });

  it("detects env-backed API key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-openai");
    mockGetSettingSequence([null, null, null, null, null, null]);
    const { getOpenAIAuthSettings } = await import("../openai-auth");
    const result = await getOpenAIAuthSettings();
    expect(result.hasKey).toBe(true);
    expect(result.apiKeySource).toBe("env");
    expect(result.method).toBe("api_key");
  });

  it("returns oauth connection metadata when stored", async () => {
    mockGetSettingSequence([
      "oauth",
      null,
      null,
      "true",
      JSON.stringify({
        account: { type: "chatgpt", email: "dev@example.com", planType: "pro" },
        authMode: "chatgpt",
      }),
      JSON.stringify({
        limitId: "codex",
        limitName: null,
        primary: { usedPercent: 25, windowDurationMins: 15, resetsAt: 1730947200 },
        secondary: null,
      }),
    ]);

    const { getOpenAIAuthSettings } = await import("../openai-auth");
    const result = await getOpenAIAuthSettings();

    expect(result.method).toBe("oauth");
    expect(result.oauthConnected).toBe(true);
    expect(result.account?.email).toBe("dev@example.com");
    expect(result.rateLimits?.primary?.usedPercent).toBe(25);
  });

  it("selects ChatGPT for a usable global session without calling it connected", async () => {
    writeFileSync(
      globalAuthPath,
      JSON.stringify({
        auth_mode: "chatgpt",
        tokens: { access_token: "access", refresh_token: "refresh" },
      }),
      { mode: 0o600 },
    );

    const { getOpenAIAuthSettings } = await import("../openai-auth");
    const result = await getOpenAIAuthSettings();

    expect(result.method).toBe("oauth");
    expect(result.oauthConnected).toBe(false);
    expect(result.existingSessionAvailable).toBe(true);
  });

  it("ignores malformed global auth instead of painting an adoption opportunity", async () => {
    writeFileSync(globalAuthPath, "{\"tokens\":{}}", { mode: 0o600 });
    const { getOpenAIAuthSettings } = await import("../openai-auth");
    const result = await getOpenAIAuthSettings();
    expect(result.oauthConnected).toBe(false);
    expect(result.existingSessionAvailable).toBe(false);
  });

  it("stores method changes without clearing existing key data", async () => {
    const { setOpenAIAuthSettings } = await import("../openai-auth");
    await setOpenAIAuthSettings({ method: "oauth" });
    expect(mockValues).toHaveBeenCalled();
  });
});
