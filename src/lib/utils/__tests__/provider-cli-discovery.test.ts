import { describe, expect, it, vi } from "vitest";
import {
  inspectClaudeCliAuth,
  inspectCodexGlobalAuth,
  selectHealthyCliCandidate,
  type CliCommandRunner,
} from "../provider-cli-discovery";

function result(
  exitCode: number,
  stdout = "",
  stderr = "",
) {
  return { exitCode, stdout, stderr };
}

describe("provider CLI discovery", () => {
  it("parses only privacy-safe Claude auth classification fields", async () => {
    const runner: CliCommandRunner = vi.fn().mockResolvedValue(
      result(
        0,
        JSON.stringify({
          loggedIn: true,
          authMethod: "claude.ai",
          apiProvider: "firstParty",
          subscriptionType: "max",
          email: "must-not-escape@example.com",
          orgId: "must-not-escape",
        }),
      ),
    );

    await expect(inspectClaudeCliAuth("/bin/claude", runner)).resolves.toEqual({
      status: "connected",
      authMethod: "claude.ai",
      apiProvider: "firstParty",
      subscriptionType: "max",
    });
  });

  it("distinguishes a confirmed Claude logout from a failed probe", async () => {
    const signedOut: CliCommandRunner = vi.fn().mockResolvedValue(
      result(1, JSON.stringify({ loggedIn: false })),
    );
    const malformed: CliCommandRunner = vi.fn().mockResolvedValue(
      result(0, "not-json"),
    );

    await expect(inspectClaudeCliAuth("/bin/claude", signedOut)).resolves.toMatchObject({
      status: "signed-out",
    });
    await expect(inspectClaudeCliAuth("/bin/claude", malformed)).resolves.toMatchObject({
      status: "unavailable",
    });
  });

  it("skips a broken first Codex candidate and selects a healthy official binary", async () => {
    const runner: CliCommandRunner = vi.fn(async (candidate) => {
      if (candidate === "/broken/codex") throw new Error("missing platform binary");
      return result(0, "codex-cli 0.118.0");
    });

    await expect(
      selectHealthyCliCandidate(
        ["/broken/codex", "/Applications/Codex.app/Contents/Resources/codex"],
        runner,
      ),
    ).resolves.toBe("/Applications/Codex.app/Contents/Resources/codex");
  });

  it("uses Codex login status exit semantics without reading credentials", async () => {
    const connected: CliCommandRunner = vi.fn().mockResolvedValue(
      result(0, "Logged in using ChatGPT"),
    );
    const signedOut: CliCommandRunner = vi.fn().mockResolvedValue(result(1));
    const broken: CliCommandRunner = vi.fn().mockResolvedValue(result(2));
    const unavailable: CliCommandRunner = vi.fn().mockRejectedValue(
      new Error("spawn failed"),
    );

    await expect(inspectCodexGlobalAuth("/bin/codex", connected)).resolves.toEqual({
      status: "connected",
    });
    await expect(inspectCodexGlobalAuth("/bin/codex", signedOut)).resolves.toEqual({
      status: "signed-out",
    });
    await expect(inspectCodexGlobalAuth("/bin/codex", broken)).resolves.toEqual({
      status: "unavailable",
    });
    await expect(inspectCodexGlobalAuth("/bin/codex", unavailable)).resolves.toEqual({
      status: "unavailable",
    });
  });
});
