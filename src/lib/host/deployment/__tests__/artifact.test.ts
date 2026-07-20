import { describe, expect, it, vi } from "vitest";
import { currentRelayCellRelease } from "../artifact";

// Cell images are published before their digest can be bound into the matching
// npm release. Keep this unit fixture on the last accepted authority; the npm
// workflow owns the fail-closed package-version parity guard.
vi.mock("@/lib/config/version", () => ({ relayProductVersion: () => "0.44.7" }));

describe("Relay Cell release authority", () => {
  it("binds the current Relay version to the accepted immutable public digest", () => {
    expect(currentRelayCellRelease()).toEqual({
      schema: "orionfold.relay-cell-release/v1",
      relayVersion: "0.44.7",
      imageRepository: "ghcr.io/orionfold/relay-cell",
      imageDigest: "sha256:1dd381ce3a7a9a62ff2d94a7826c37a5fee5a78af33bb18d9a2c209b2b8efd8f",
      publishedAt: "2026-07-20T08:26:15Z",
      sourceTag: "cell-v0.44.7",
    });
  });
});
