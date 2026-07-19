import { describe, expect, it } from "vitest";
import { currentRelayCellRelease } from "../artifact";

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
