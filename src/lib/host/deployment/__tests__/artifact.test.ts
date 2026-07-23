import { describe, expect, it, vi } from "vitest";
import { currentRelayCellRelease } from "../artifact";

// Cell images are published before their digest can be bound into the matching
// npm release. Keep this unit fixture on the last accepted authority; the npm
// workflow owns the fail-closed package-version parity guard.
vi.mock("@/lib/config/version", () => ({ relayProductVersion: () => "0.46.2" }));

describe("Relay Cell release authority", () => {
  it("binds the current Relay version to the accepted immutable public digest", () => {
    expect(currentRelayCellRelease()).toEqual({
      schema: "orionfold.relay-cell-release/v1",
      relayVersion: "0.46.2",
      imageRepository: "ghcr.io/orionfold/relay-cell",
      imageDigest: "sha256:9dda87b2d1c73955e41b5a72d640650e5043785668777fc8cba63406a4c46e48",
      publishedAt: "2026-07-23T21:17:52Z",
      sourceTag: "cell-v0.46.2",
    });
  });
});
