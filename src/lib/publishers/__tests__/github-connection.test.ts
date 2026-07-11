import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ settings: new Map<string, string>() }));

vi.mock("@/lib/settings/helpers", () => ({
  getSetting: vi.fn(async (key: string) => state.settings.get(key) ?? null),
  setSetting: vi.fn(async (key: string, value: string) => { state.settings.set(key, value); }),
  deleteSetting: vi.fn(async (key: string) => { state.settings.delete(key); }),
}));

vi.mock("@/lib/utils/crypto", () => ({
  encrypt: (value: string) => `encrypted:${value}`,
  decrypt: (value: string) => value.replace(/^encrypted:/, ""),
}));

import {
  connectGitHub,
  disconnectGitHub,
  getGitHubConnectionStatus,
  inspectGitHubRepository,
  listGitHubRepositories,
  resolveGitHubToken,
  verifyGitHubConnection,
} from "../github-connection";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("shared GitHub connection", () => {
  beforeEach(() => {
    state.settings.clear();
    vi.unstubAllGlobals();
    delete process.env.GITHUB_TOKEN;
  });

  it("verifies and encrypts one token without returning it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ login: "maker" })));
    const result = await connectGitHub("example-token-1234");
    expect(result).toMatchObject({
      connected: true,
      login: "maker",
      source: "settings",
      tokenHint: "••••1234",
    });
    expect(result.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(state.settings.get("github.token")).toBe("encrypted:example-token-1234");
    expect(JSON.stringify(result)).not.toContain("example-token-1234");
  });

  it("lists public and private writable repositories without preference", async () => {
    state.settings.set("github.token", "encrypted:example-token-1234");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([
      { name: "open-pack", full_name: "maker/open-pack", private: false, default_branch: "main", owner: { login: "maker" }, permissions: { push: true } },
      { name: "team-pack", full_name: "maker/team-pack", private: true, default_branch: "trunk", owner: { login: "maker" }, permissions: { maintain: true } },
      { name: "read-only", full_name: "maker/read-only", private: false, default_branch: "main", owner: { login: "maker" }, permissions: { push: false } },
    ])));
    await expect(listGitHubRepositories()).resolves.toEqual([
      expect.objectContaining({ fullName: "maker/open-pack", visibility: "public" }),
      expect.objectContaining({ fullName: "maker/team-pack", visibility: "private" }),
    ]);
  });

  it("uses the shared token ahead of a legacy target token", async () => {
    state.settings.set("github.token", "encrypted:shared-5678");
    await expect(resolveGitHubToken({ githubToken: "legacy-1234", owner: "maker" }))
      .resolves.toMatchObject({ githubToken: "shared-5678", owner: "maker" });
  });

  it("reports repository visibility and removes saved credentials", async () => {
    state.settings.set("github.token", "encrypted:shared-5678");
    state.settings.set("github.login", "maker");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({
      name: "pack",
      full_name: "maker/pack",
      private: true,
      default_branch: "main",
      owner: { login: "maker" },
      permissions: { push: true },
    })));
    await expect(inspectGitHubRepository({ owner: "maker", repo: "pack" }))
      .resolves.toMatchObject({ visibility: "private", canPush: true });
    await disconnectGitHub();
    await expect(getGitHubConnectionStatus()).resolves.toEqual({
      connected: false,
      login: null,
      source: null,
      tokenHint: null,
      verifiedAt: null,
    });
    await expect(resolveGitHubToken({ githubToken: "legacy-1234" }))
      .rejects.toThrow("Connect GitHub in Settings");
  });

  it("clears the verified marker when a saved credential fails verification", async () => {
    state.settings.set("github.token", "encrypted:revoked-1234");
    state.settings.set("github.verifiedAt", "2026-07-11T00:00:00.000Z");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ message: "Bad credentials" }, 401)));
    await expect(verifyGitHubConnection()).rejects.toThrow("401");
    expect(state.settings.get("github.verifiedAt")).toBe("");
  });
});
