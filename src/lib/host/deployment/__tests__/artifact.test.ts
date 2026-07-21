import { describe, expect, it, vi } from "vitest";
import { currentRelayCellRelease } from "../artifact";

// Cell images are published before their digest can be bound into the matching
// npm release. Keep this unit fixture on the last accepted authority; the npm
// workflow owns the fail-closed package-version parity guard.
vi.mock("@/lib/config/version", () => ({ relayProductVersion: () => "0.45.2" }));

describe("Relay Cell release authority", () => {
  it("binds the current Relay version to the accepted immutable public digest", () => {
    expect(currentRelayCellRelease()).toEqual({
      schema: "orionfold.relay-cell-release/v1",
      relayVersion: "0.45.2",
      imageRepository: "ghcr.io/orionfold/relay-cell",
      imageDigest: "sha256:ea3098207a390498a92cb23e73b27cdcf25b6ab3679415b3b976461e1baad624",
      publishedAt: "2026-07-21T21:44:20Z",
      sourceTag: "cell-v0.45.2",
    });
  });
});
