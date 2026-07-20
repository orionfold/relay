import { describe, expect, it, vi } from "vitest";
import { currentRelayCellRelease } from "../artifact";

// Cell images are published before their digest can be bound into the matching
// npm release. Keep this unit fixture on the last accepted authority; the npm
// workflow owns the fail-closed package-version parity guard.
vi.mock("@/lib/config/version", () => ({ relayProductVersion: () => "0.44.3" }));

describe("Relay Cell release authority", () => {
  it("binds the current Relay version to the accepted immutable public digest", () => {
    expect(currentRelayCellRelease()).toEqual({
      schema: "orionfold.relay-cell-release/v1",
      relayVersion: "0.44.3",
      imageRepository: "ghcr.io/orionfold/relay-cell",
      imageDigest: "sha256:b0dbee1535a2da9d963814591c8f0307d719b0d1ee43baebd2cbedf5f1d22c73",
      publishedAt: "2026-07-18T00:00:00Z",
      sourceTag: "cell-v0.44.3",
    });
  });
});
