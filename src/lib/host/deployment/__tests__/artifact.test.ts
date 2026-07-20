import { describe, expect, it, vi } from "vitest";
import { currentRelayCellRelease } from "../artifact";

// Cell images are published before their digest can be bound into the matching
// npm release. Keep this unit fixture on the last accepted authority; the npm
// workflow owns the fail-closed package-version parity guard.
vi.mock("@/lib/config/version", () => ({ relayProductVersion: () => "0.44.9" }));

describe("Relay Cell release authority", () => {
  it("binds the current Relay version to the accepted immutable public digest", () => {
    expect(currentRelayCellRelease()).toEqual({
      schema: "orionfold.relay-cell-release/v1",
      relayVersion: "0.44.9",
      imageRepository: "ghcr.io/orionfold/relay-cell",
      imageDigest: "sha256:42bea7a0a65bf799ddbbc4a078667f256400c5cca0fe682c07ab68f2bf5c3cd5",
      publishedAt: "2026-07-20T09:09:59Z",
      sourceTag: "cell-v0.44.9",
    });
  });
});
