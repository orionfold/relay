import { describe, expect, it } from "vitest";
import { readClaudeConnectionProbe } from "../claude-connection-probe";

async function* messages(...items: Array<Record<string, unknown>>) {
  for (const item of items) yield item;
}

describe("Claude connection probe", () => {
  it("does not treat SDK initialization as proof of authentication", async () => {
    const result = await readClaudeConnectionProbe(
      messages({ type: "system", subtype: "init", api_key_source: "oauth" }),
      "unknown",
    );

    expect(result.connected).toBe(false);
    expect(result.error).toContain("before authentication was verified");
  });

  it("returns the SDK error when the terminal result fails", async () => {
    const result = await readClaudeConnectionProbe(
      messages(
        { type: "system", subtype: "init", api_key_source: "oauth" },
        { type: "result", is_error: true, errors: ["Not logged in"] },
      ),
      "unknown",
    );

    expect(result).toEqual({ connected: false, error: "Not logged in" });
  });

  it("reports connected only after a successful terminal result", async () => {
    const result = await readClaudeConnectionProbe(
      messages(
        { type: "system", subtype: "init", api_key_source: "oauth" },
        { type: "result", is_error: false, result: "OK" },
      ),
      "unknown",
    );

    expect(result).toEqual({ connected: true, apiKeySource: "oauth" });
  });

  it("uses the configured source when the SDK omits it", async () => {
    const result = await readClaudeConnectionProbe(
      messages(
        { type: "system", subtype: "init" },
        { type: "result", is_error: false, result: "OK" },
      ),
      "env",
    );

    expect(result).toEqual({ connected: true, apiKeySource: "env" });
  });
});
