import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(__dirname, "../../../bin/cli.ts"), "utf8");

describe("Relay CLI exposure profile contract", () => {
  it("declares every explicit exposure option", () => {
    expect(source).toContain("--exposure-profile <profile>");
    expect(source).toContain("--public-origin <url>");
    expect(source).toContain("--route-prefix <path>");
  });

  it("fails closed before launching a non-loopback trusted-local server", () => {
    expect(source).toMatch(/isNonLoopbackHost\(bindHost\)\s*&&\s*exposureProfile === "trusted-local"/);
    expect(source).toContain("Non-loopback binding is refused in trusted-local mode");
  });

  it("requires the configured ingress credential for remote exposure", () => {
    expect(source).toMatch(/exposureProfile === "remote-authenticated"\s*&&\s*!process\.env\.RELAY_INGRESS_TOKEN/);
  });

  it("requires remote-authenticated v1 to stay behind a loopback ingress target", () => {
    expect(source).toContain("Remote-authenticated v1 must bind loopback");
  });

  it("passes only a fresh process-local self-call credential to Next", () => {
    expect(source).toContain("const internalAuthToken = randomSecret()");
    expect(source).toContain("RELAY_INTERNAL_AUTH_TOKEN: internalAuthToken");
  });
});
