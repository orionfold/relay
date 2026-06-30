import { afterEach, describe, expect, it, vi } from "vitest";

describe("instrumentation register()", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ensureInstance is importable from the bootstrap module and returns a skipped result in dev mode", async () => {
    vi.stubEnv("RELAY_DEV_MODE", "true");
    const { ensureInstance } = await import("@/lib/instance/bootstrap");
    const result = await ensureInstance();
    expect(result.skipped).toBe("dev_mode_env");
    expect(result.steps).toEqual([]);
  });
});
