import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  root,
  globalAuthPath,
  isolatedAuthPath,
  mockReadCodexAuthState,
  mockSetOpenAIAuthSettings,
  mockClearOpenAIOAuthStatus,
} = vi.hoisted(() => {
  const testRoot = "/tmp/relay-codex-session-adoption-test";
  return {
    root: testRoot,
    globalAuthPath: `${testRoot}/global/auth.json`,
    isolatedAuthPath: `${testRoot}/isolated/auth.json`,
    mockReadCodexAuthState: vi.fn(),
    mockSetOpenAIAuthSettings: vi.fn(),
    mockClearOpenAIOAuthStatus: vi.fn(),
  };
});

vi.mock("@/lib/utils/ainative-paths", () => ({
  getGlobalCodexAuthPath: () => globalAuthPath,
  getAinativeCodexAuthPath: () => isolatedAuthPath,
}));

vi.mock("@/lib/agents/runtime/openai-codex-auth", () => ({
  readCodexAuthState: mockReadCodexAuthState,
}));

vi.mock("@/lib/settings/openai-auth", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/settings/openai-auth")>();
  return {
    ...actual,
    setOpenAIAuthSettings: mockSetOpenAIAuthSettings,
    clearOpenAIOAuthStatus: mockClearOpenAIOAuthStatus,
  };
});

function writeUsableGlobalAuth() {
  mkdirSync(join(root, "global"), { recursive: true });
  const bytes = JSON.stringify({
    auth_mode: "chatgpt",
    tokens: {
      id_token: "header.payload.signature",
      access_token: "access",
      refresh_token: "refresh",
    },
  });
  writeFileSync(globalAuthPath, bytes, { mode: 0o600 });
  chmodSync(globalAuthPath, 0o600);
  return bytes;
}

describe("Codex session adoption", () => {
  beforeEach(() => {
    rmSync(root, { recursive: true, force: true });
    vi.clearAllMocks();
    mockSetOpenAIAuthSettings.mockResolvedValue(undefined);
    mockClearOpenAIOAuthStatus.mockResolvedValue(undefined);
    mockReadCodexAuthState.mockResolvedValue({
      connected: true,
      account: {
        type: "chatgpt",
        email: "customer@example.com",
        planType: "pro",
      },
      rateLimits: null,
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("copies and verifies a usable global session without changing the source", async () => {
    const sourceBytes = writeUsableGlobalAuth();
    const sourceBefore = readFileSync(globalAuthPath, "utf8");
    const { adoptExistingCodexSession } = await import(
      "../codex-session-adoption"
    );

    const result = await adoptExistingCodexSession();

    expect(result.connected).toBe(true);
    expect(readFileSync(globalAuthPath, "utf8")).toBe(sourceBefore);
    expect(readFileSync(isolatedAuthPath, "utf8")).toBe(sourceBytes);
    expect(statSync(join(root, "isolated")).mode & 0o777).toBe(0o700);
    expect(statSync(isolatedAuthPath).mode & 0o777).toBe(0o600);
    expect(mockSetOpenAIAuthSettings).toHaveBeenCalledWith({
      method: "oauth",
    });
    expect(mockReadCodexAuthState).toHaveBeenCalledWith({
      refreshToken: true,
    });
  });

  it("refuses to overwrite an existing isolated session", async () => {
    writeUsableGlobalAuth();
    mkdirSync(join(root, "isolated"), { recursive: true });
    writeFileSync(isolatedAuthPath, "keep-me", { mode: 0o600 });
    const { adoptExistingCodexSession, CodexSessionAdoptionError } =
      await import("../codex-session-adoption");

    await expect(adoptExistingCodexSession()).rejects.toMatchObject({
      name: "CodexSessionAdoptionError",
      status: 409,
    } satisfies Partial<InstanceType<typeof CodexSessionAdoptionError>>);
    expect(readFileSync(isolatedAuthPath, "utf8")).toBe("keep-me");
    expect(mockReadCodexAuthState).not.toHaveBeenCalled();
  });

  it("removes only the isolated copy when verification fails", async () => {
    const sourceBytes = writeUsableGlobalAuth();
    mockReadCodexAuthState.mockRejectedValueOnce(
      new Error("session expired"),
    );
    const { adoptExistingCodexSession } = await import(
      "../codex-session-adoption"
    );

    await expect(adoptExistingCodexSession()).rejects.toMatchObject({
      name: "CodexSessionAdoptionError",
      status: 400,
    });
    expect(() => statSync(isolatedAuthPath)).toThrow();
    expect(readFileSync(globalAuthPath, "utf8")).toBe(sourceBytes);
    expect(mockClearOpenAIOAuthStatus).toHaveBeenCalled();
  });

  it("refuses a credential file readable by other users", async () => {
    writeUsableGlobalAuth();
    chmodSync(globalAuthPath, 0o644);
    const { adoptExistingCodexSession } = await import(
      "../codex-session-adoption"
    );
    await expect(adoptExistingCodexSession()).rejects.toThrow(
      "accessible to other users",
    );
    expect(mockReadCodexAuthState).not.toHaveBeenCalled();
  });

  it("refuses a symlinked credential source", async () => {
    const sourceBytes = writeUsableGlobalAuth();
    const realAuthPath = join(root, "global", "real-auth.json");
    writeFileSync(realAuthPath, sourceBytes, { mode: 0o600 });
    rmSync(globalAuthPath);
    symlinkSync(realAuthPath, globalAuthPath);
    const { adoptExistingCodexSession } = await import(
      "../codex-session-adoption"
    );

    await expect(adoptExistingCodexSession()).rejects.toThrow(
      "not a regular credential file",
    );
    expect(mockReadCodexAuthState).not.toHaveBeenCalled();
  });
});
