import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Point the Claude OAuth credential-path helper at a temp file we control, so
// the real existsSync in auth.ts is exercised against a path we can create and
// delete per test. Mocking our own narrow path-helper avoids mocking node:fs
// wholesale (which would break app-root's readFileSync).
const oauthCredPath = join(tmpdir(), "relay-auth-test-credentials.json");
vi.mock("@/lib/utils/ainative-paths", () => ({
  getClaudeOAuthCredentialsPath: () => oauthCredPath,
}));

// Mock the DB and crypto modules
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDeleteWhere = vi.fn();
const mockSet = vi.fn();
const mockValues = vi.fn();
const mockRun = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: mockFrom }),
    insert: () => ({ values: mockValues }),
    update: () => ({ set: mockSet }),
    delete: () => ({ where: mockDeleteWhere }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  settings: { key: "key" },
}));

vi.mock("@/lib/utils/crypto", () => ({
  encrypt: vi.fn((v: string) => `encrypted:${v}`),
  decrypt: vi.fn((v: string) => v.replace("encrypted:", "")),
}));

// Build mock chain
mockFrom.mockReturnValue({ where: mockWhere });
mockWhere.mockReturnValue([]);
mockValues.mockReturnValue({ run: mockRun });
mockSet.mockReturnValue({ where: vi.fn().mockReturnValue({ run: mockRun }) });
mockDeleteWhere.mockReturnValue({ run: mockRun });

// Track getSetting calls by key
let settingsStore: Record<string, string> = {};

function setupSettingsStore(store: Record<string, string>) {
  settingsStore = store;
  mockWhere.mockImplementation(() => {
    // The where clause is called with eq(settings.key, key)
    // We can't easily inspect the key, so we use call order
    // Instead, return based on the mock call args
    return [];
  });
}

// Helper to mock getSetting responses in sequence
function mockGetSettingSequence(values: (string | null)[]) {
  let callIndex = 0;
  mockWhere.mockImplementation(() => {
    const val = values[callIndex] ?? null;
    callIndex++;
    return val !== null ? [{ value: val }] : [];
  });
}

describe("auth settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockWhere.mockReturnValue([]);
    vi.unstubAllEnvs();
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    rmSync(oauthCredPath, { force: true });
  });

  afterEach(() => {
    rmSync(oauthCredPath, { force: true });
  });

  describe("getAuthSettings", () => {
    it("returns defaults when no settings exist", async () => {
      const { getAuthSettings } = await import("../auth");
      const result = await getAuthSettings();
      expect(result.method).toBe("oauth");
      expect(result.hasKey).toBe(false);
    });

    it("detects env key and sets source to env", async () => {
      vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
      const { getAuthSettings } = await import("../auth");
      const result = await getAuthSettings();
      expect(result.hasKey).toBe(true);
      expect(result.apiKeySource).toBe("env");
    });

    it("ignores a stale stored OAuth source when no credential exists", async () => {
      mockGetSettingSequence(["oauth", null, "oauth", null]);
      const { getAuthSettings } = await import("../auth");
      const result = await getAuthSettings();
      expect(result.method).toBe("oauth");
      expect(result.hasKey).toBe(false);
      expect(result.apiKeySource).toBe("unknown");
    });

    it("detects db key source when no stored source", async () => {
      // method=api_key, apiKey=encrypted value, no stored source
      mockGetSettingSequence(["api_key", "encrypted:sk-ant-key", null, null]);
      const { getAuthSettings } = await import("../auth");
      const result = await getAuthSettings();
      expect(result.hasKey).toBe(true);
      expect(result.apiKeySource).toBe("db");
    });

    it("returns apiKeySource=unknown when oauth is selected but no OAuth token exists (blank install)", async () => {
      // method=oauth, no apiKey, no stored source, no env key, no OAuth
      // credential on disk, no CLAUDE_CODE_OAUTH_TOKEN. Selecting OAuth as the
      // method must NOT report "connected" until a token is actually present.
      mockGetSettingSequence(["oauth", null, null, null]);
      const { getAuthSettings } = await import("../auth");
      const result = await getAuthSettings();
      expect(result.apiKeySource).toBe("unknown");
      expect(result.hasKey).toBe(false);
    });

    it("returns apiKeySource=oauth when CLAUDE_CODE_OAUTH_TOKEN is set", async () => {
      vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "oauth-token-abc");
      mockGetSettingSequence(["oauth", null, null, null]);
      const { getAuthSettings } = await import("../auth");
      const result = await getAuthSettings();
      expect(result.apiKeySource).toBe("oauth");
    });

    it("returns apiKeySource=oauth when a Claude OAuth credentials file contains a refresh token", async () => {
      writeFileSync(oauthCredPath, JSON.stringify({
        claudeAiOauth: { refreshToken: "refresh-token-abc" },
      }));
      mockGetSettingSequence(["oauth", null, null, null]);
      const { getAuthSettings } = await import("../auth");
      const result = await getAuthSettings();
      expect(result.apiKeySource).toBe("oauth");
    });

    it.each([
      ["empty JSON", "{}"],
      ["empty OAuth object", JSON.stringify({ claudeAiOauth: {} })],
      ["blank tokens", JSON.stringify({ claudeAiOauth: { accessToken: " ", refreshToken: "" } })],
      ["malformed JSON", "not-json"],
      ["expired access token without refresh", JSON.stringify({
        claudeAiOauth: { accessToken: "expired", expiresAt: Date.now() - 1_000 },
      })],
    ])("returns unknown for an unusable credential file: %s", async (_label, contents) => {
      writeFileSync(oauthCredPath, contents);
      mockGetSettingSequence(["oauth", null, "oauth", null]);
      const { getAuthSettings } = await import("../auth");
      const result = await getAuthSettings();
      expect(result.apiKeySource).toBe("unknown");
    });

    it("accepts an unexpired access-token-only credential file", async () => {
      writeFileSync(oauthCredPath, JSON.stringify({
        claudeAiOauth: { accessToken: "access-token-abc", expiresAt: Date.now() + 60_000 },
      }));
      mockGetSettingSequence(["oauth", null, null, null]);
      const { getAuthSettings } = await import("../auth");
      const result = await getAuthSettings();
      expect(result.apiKeySource).toBe("oauth");
    });

    it("accepts OAuth previously verified by a successful SDK result (keychain path)", async () => {
      mockGetSettingSequence(["oauth", null, "oauth", "2026-07-10T20:00:00.000Z"]);
      const { getAuthSettings } = await import("../auth");
      const result = await getAuthSettings();
      expect(result.apiKeySource).toBe("oauth");
    });

    it("returns apiKeySource=unknown when api_key method with no keys", async () => {
      // method=api_key, no apiKey in DB, no stored source, no env key
      mockGetSettingSequence(["api_key", null, null, null]);
      delete process.env.ANTHROPIC_API_KEY;
      const { getAuthSettings } = await import("../auth");
      const result = await getAuthSettings();
      expect(result.apiKeySource).toBe("unknown");
      expect(result.hasKey).toBe(false);
    });
  });

  describe("setAuthSettings", () => {
    it("encrypts and stores API key", async () => {
      const { setAuthSettings } = await import("../auth");
      await setAuthSettings({ method: "api_key", apiKey: "sk-ant-test-key" });
      expect(mockValues).toHaveBeenCalled();
    });

    it("clears stored key when switching to OAuth with existing key", async () => {
      // Flow: setSetting(method,"oauth") calls getSetting(method) [call 1]
      //       then the oauth branch: getSetting(AUTH_API_KEY) [call 2] → returns key
      //       → db.delete().where()
      //       then the source + verification marker are cleared
      let callIndex = 0;
      mockWhere.mockImplementation(() => {
        callIndex++;
        if (callIndex === 2) {
          return [{ value: "encrypted:old-key" }];
        }
        return [];
      });

      const { setAuthSettings } = await import("../auth");
      await setAuthSettings({ method: "oauth" });
      expect(mockDeleteWhere).toHaveBeenCalled();
    });

    it("keeps source unknown when switching to OAuth without a completed login", async () => {
      // All getSetting calls return empty
      mockWhere.mockReturnValue([]);
      const { setAuthSettings } = await import("../auth");
      await setAuthSettings({ method: "oauth" });
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({ value: "unknown" }),
      );
    });
  });

  describe("getAuthEnv", () => {
    it("returns undefined for oauth method", async () => {
      mockWhere.mockImplementation(() => {
        return [{ value: "oauth" }];
      });
      const { getAuthEnv } = await import("../auth");
      const result = await getAuthEnv();
      expect(result).toBeUndefined();
    });

    it("returns decrypted key from DB for api_key method", async () => {
      let callIndex = 0;
      mockWhere.mockImplementation(() => {
        callIndex++;
        if (callIndex === 1) return [{ value: "api_key" }]; // method
        if (callIndex === 2) return [{ value: "encrypted:sk-ant-real-key" }]; // apiKey
        return [];
      });
      const { getAuthEnv } = await import("../auth");
      const result = await getAuthEnv();
      expect(result).toEqual({ ANTHROPIC_API_KEY: "sk-ant-real-key" });
    });

    it("returns undefined when api_key method but no stored key", async () => {
      let callIndex = 0;
      mockWhere.mockImplementation(() => {
        callIndex++;
        if (callIndex === 1) return [{ value: "api_key" }]; // method
        return []; // no stored key
      });
      const { getAuthEnv } = await import("../auth");
      const result = await getAuthEnv();
      expect(result).toBeUndefined();
    });

    it("returns undefined when decryption fails", async () => {
      const { decrypt } = await import("@/lib/utils/crypto");
      vi.mocked(decrypt).mockImplementationOnce(() => {
        throw new Error("decryption failed");
      });

      let callIndex = 0;
      mockWhere.mockImplementation(() => {
        callIndex++;
        if (callIndex === 1) return [{ value: "api_key" }]; // method
        if (callIndex === 2) return [{ value: "corrupted-data" }]; // apiKey
        return [];
      });
      const { getAuthEnv } = await import("../auth");
      const result = await getAuthEnv();
      expect(result).toBeUndefined();
    });
  });

  describe("updateAuthStatus", () => {
    it("updates the api key source setting", async () => {
      const { updateAuthStatus } = await import("../auth");
      await updateAuthStatus("db");
      expect(mockValues).toHaveBeenCalled();
    });

    it("records a verification marker for confirmed OAuth", async () => {
      const { updateAuthStatus } = await import("../auth");
      await updateAuthStatus("oauth");
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({ key: "auth.oauthVerifiedAt" }),
      );
    });
  });
});
