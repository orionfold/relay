import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ainative-pricing-registry-"));
  vi.resetModules();
  vi.stubEnv("RELAY_DATA_DIR", tempDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("pricing registry", () => {
  it("refreshes pricing from official provider pages and updates visible rows", async () => {
    const fetch = vi.fn(async (input: string) => {
      if (input.includes("anthropic.com")) {
        return new Response(`
          <html>
            <body>
              Claude Sonnet 4 $3 / 1M input tokens $15 / 1M output tokens
              Claude Opus 4 $15 / 1M input tokens $75 / 1M output tokens
              Claude Haiku 3.5 $0.80 / 1M input tokens $4 / 1M output tokens
              Claude Pro $20
              Max 5x $100
              Max 20x $200
            </body>
          </html>
        `);
      }

      return new Response(`
        <html>
          <body>
            GPT-5 $10 / 1M input tokens $30 / 1M output tokens
            GPT-4o $2.50 / 1M input tokens $10 / 1M output tokens
          </body>
        </html>
      `);
    });
    vi.stubGlobal("fetch", fetch);

    const { refreshPricingRegistry } = await import("../pricing-registry");
    const snapshot = await refreshPricingRegistry();

    expect(snapshot.providers.anthropic.rows.find((row) => row.key === "anthropic-plan-pro")?.monthlyPriceUsd).toBe(20);
    expect(snapshot.providers.anthropic.rows.find((row) => row.key === "anthropic-claude-sonnet")?.inputCostPerMillionMicros).toBe(3_000_000);
    expect(snapshot.providers.openai.rows.find((row) => row.key === "openai-gpt-5")?.outputCostPerMillionMicros).toBe(30_000_000);
  });

  it("keeps last-known-good pricing when a refresh fails", async () => {
    const fetch = vi.fn(async (input: string) => {
      if (input.includes("anthropic.com")) {
        return new Response(`<html><body>Claude Pro $20</body></html>`);
      }

      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetch);

    const { refreshPricingRegistry, getPricingRegistrySnapshot } = await import(
      "../pricing-registry"
    );

    await refreshPricingRegistry();
    const snapshot = await getPricingRegistrySnapshot();

    expect(snapshot.providers.anthropic.refreshError).toBeNull();
    expect(snapshot.providers.openai.refreshError).toContain("network down");
    expect(snapshot.providers.openai.rows.find((row) => row.key === "openai-gpt-5")?.inputCostPerMillionMicros).toBe(10_000_000);
  });
});
