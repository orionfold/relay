import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ settings: new Map<string, string>() }));
const cli = vi.hoisted(() => ({ execFile: vi.fn() }));

vi.mock("node:child_process", () => ({
  default: { execFile: cli.execFile },
  execFile: cli.execFile,
}));

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
  connectGitHubCli,
  disconnectGitHub,
  getGitHubCliStatus,
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
    cli.execFile.mockReset();
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
      error: null,
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
    expect(state.settings.get("github.connectionMethod")).toBe("disconnected");
    await expect(getGitHubConnectionStatus()).resolves.toEqual({
      connected: false,
      login: null,
      source: null,
      tokenHint: null,
      verifiedAt: null,
      error: null,
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

  it("uses an explicitly selected GitHub CLI credential without storing its token", async () => {
    cli.execFile.mockImplementation((...args: unknown[]) => {
      const commandArgs = args[1] as string[];
      const callback = args[3] as (error: Error | null, stdout: string, stderr: string) => void;
      if (commandArgs[1] === "token") callback(null, "cli-secret-5678\n", "");
      return undefined as never;
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ login: "maker" })));

    await expect(connectGitHubCli()).resolves.toMatchObject({
      connected: true,
      login: "maker",
      source: "github-cli",
      tokenHint: null,
      error: null,
    });
    expect(state.settings.get("github.connectionMethod")).toBe("github-cli");
    expect(state.settings.has("github.token")).toBe(false);
    expect(JSON.stringify(await getGitHubConnectionStatus())).not.toContain("cli-secret-5678");
    await expect(resolveGitHubToken({ owner: "maker" })).resolves.toMatchObject({
      githubToken: "cli-secret-5678",
    });
    expect(cli.execFile).toHaveBeenCalledWith(
      "gh",
      ["auth", "token", "--hostname", "github.com", "--user", "maker"],
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("detects only the GitHub CLI executable without reading a credential", async () => {
    cli.execFile.mockImplementation((...args: unknown[]) => {
      expect(args[1]).toEqual(["--version"]);
      const callback = args[3] as (error: Error | null, stdout: string, stderr: string) => void;
      callback(null, "gh version 2.79.0\n", "");
      return undefined as never;
    });
    await expect(getGitHubCliStatus()).resolves.toEqual({ installed: true });
  });

  it("reports an expired selected CLI session as a visible disconnected state", async () => {
    state.settings.set("github.connectionMethod", "github-cli");
    state.settings.set("github.login", "maker");
    cli.execFile.mockImplementation((...args: unknown[]) => {
      const callback = args[3] as (error: NodeJS.ErrnoException, stdout: string, stderr: string) => void;
      const error = Object.assign(new Error("not logged in"), { code: "AUTH" });
      callback(error, "", "");
      return undefined as never;
    });
    await expect(getGitHubConnectionStatus()).resolves.toMatchObject({
      connected: false,
      login: "maker",
      source: "github-cli",
      verifiedAt: null,
      error: expect.stringContaining("not authenticated"),
    });
  });
});
