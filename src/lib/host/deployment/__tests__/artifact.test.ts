import { describe, expect, it, vi } from "vitest";
import { currentRelayCellRelease } from "../artifact";

// Cell images are published before their digest can be bound into the matching
// npm release. Keep this unit fixture on the last accepted authority; the npm
// workflow owns the fail-closed package-version parity guard.
vi.mock("@/lib/config/version", () => ({ relayProductVersion: () => "0.44.5" }));

describe("Relay Cell release authority", () => {
  it("binds the current Relay version to the accepted immutable public digest", () => {
    expect(currentRelayCellRelease()).toEqual({
      schema: "orionfold.relay-cell-release/v1",
      relayVersion: "0.44.5",
      imageRepository: "ghcr.io/orionfold/relay-cell",
      imageDigest: "sha256:caaa02dbb8c719b1274a5bff9084e69ffe40b17aef35323ac9666eada8dd1bd6",
      publishedAt: "2026-07-20T04:29:09Z",
      sourceTag: "cell-v0.44.5",
    });
  });
});
