import { describe, expect, it, vi } from "vitest";
import { currentRelayCellRelease } from "../artifact";

// Cell images are published before their digest can be bound into the matching
// npm release. Keep this unit fixture on the last accepted authority; the npm
// workflow owns the fail-closed package-version parity guard.
vi.mock("@/lib/config/version", () => ({ relayProductVersion: () => "0.46.3" }));

describe("Relay Cell release authority", () => {
  it("binds the current Relay version to the accepted immutable public digest", () => {
    expect(currentRelayCellRelease()).toEqual({
      schema: "orionfold.relay-cell-release/v1",
      relayVersion: "0.46.3",
      imageRepository: "ghcr.io/orionfold/relay-cell",
      imageDigest: "sha256:98aba662fc4c7bc9b79e5e384178bef2bdaac7977d1be5b490726740c4223ac1",
      publishedAt: "2026-07-23T22:55:17Z",
      sourceTag: "cell-v0.46.3",
    });
  });
});
