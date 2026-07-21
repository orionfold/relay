import { describe, expect, it, vi } from "vitest";
import { currentRelayCellRelease } from "../artifact";

// Cell images are published before their digest can be bound into the matching
// npm release. Keep this unit fixture on the last accepted authority; the npm
// workflow owns the fail-closed package-version parity guard.
vi.mock("@/lib/config/version", () => ({ relayProductVersion: () => "0.45.1" }));

describe("Relay Cell release authority", () => {
  it("binds the current Relay version to the accepted immutable public digest", () => {
    expect(currentRelayCellRelease()).toEqual({
      schema: "orionfold.relay-cell-release/v1",
      relayVersion: "0.45.1",
      imageRepository: "ghcr.io/orionfold/relay-cell",
      imageDigest: "sha256:4dd8a80652a6b83ae7c413646db48eb4e532dd06aa04a2a7c8bc393a8fac1149",
      publishedAt: "2026-07-21T21:01:32Z",
      sourceTag: "cell-v0.45.1",
    });
  });
});
