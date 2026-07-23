import { describe, expect, it } from "vitest";
import {
  buildRelayUpgradeCommand,
  parseRelayLaunchContext,
  serializeRelayLaunchContext,
  type RelayLaunchContext,
} from "../launch-context";

const context: RelayLaunchContext = {
  schemaVersion: 1,
  packageVersion: "0.45.2",
  dataDir: "/Users/test/.relay customer",
  hostRoot: "/Users/test/.relay customer/host",
  npmCache: "/Users/test/cache",
  port: 3200,
  hostname: "127.0.0.1",
  exposureProfile: "trusted-local",
  publicOrigin: null,
  routePrefix: "/",
  safeMode: false,
  noOpen: false,
};

describe("Relay launch context", () => {
  it("round-trips only the typed non-secret launch contract", () => {
    const parsed = parseRelayLaunchContext(
      JSON.stringify({
        ...context,
        internalAuthToken: "must-not-survive",
        ingressToken: "must-not-survive",
      }),
    );

    expect(parsed).toEqual(context);
    expect(serializeRelayLaunchContext(parsed!)).not.toContain(
      "must-not-survive",
    );
  });

  it("rejects malformed, oversized, and out-of-range contexts", () => {
    expect(parseRelayLaunchContext("{")).toBeNull();
    expect(parseRelayLaunchContext("x".repeat(16_385))).toBeNull();
    expect(
      parseRelayLaunchContext(JSON.stringify({ ...context, port: 70_000 })),
    ).toBeNull();
    expect(
      parseRelayLaunchContext(
        JSON.stringify({ ...context, exposureProfile: "public" }),
      ),
    ).toBeNull();
  });

  it("renders a copyable upgrade command that preserves active instance context", () => {
    expect(buildRelayUpgradeCommand(context)).toBe(
      "RELAY_HOST_ROOT='/Users/test/.relay customer/host' " +
        "NPM_CONFIG_CACHE='/Users/test/cache' " +
        "npx --yes orionfold-relay@latest " +
        "--data-dir '/Users/test/.relay customer' --port 3200 " +
        "--hostname '127.0.0.1' --exposure-profile 'trusted-local' " +
        "--route-prefix '/'",
    );
  });

  it("preserves optional remote and safe-mode flags", () => {
    const command = buildRelayUpgradeCommand({
      ...context,
      hostRoot: null,
      npmCache: null,
      hostname: "0.0.0.0",
      exposureProfile: "private-authenticated",
      publicOrigin: "https://relay.example.com",
      routePrefix: "/relay",
      safeMode: true,
      noOpen: true,
    });

    expect(command).toContain("--public-origin 'https://relay.example.com'");
    expect(command).toContain("--route-prefix '/relay'");
    expect(command).toContain("--safe-mode --no-open");
    expect(command).not.toContain("RELAY_HOST_ROOT");
  });

  it("shell-quotes apostrophes in paths instead of interpolating them", () => {
    expect(
      buildRelayUpgradeCommand({
        ...context,
        dataDir: "/tmp/customer's relay",
      }),
    ).toContain("--data-dir '/tmp/customer'\"'\"'s relay'");
  });
});
