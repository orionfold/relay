import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RelayHostError } from "../errors";
import {
  assertCellTransition,
  assertContentFree,
  assertPathInside,
  hostPlanDigest,
  parseCellManifest,
} from "../policy";
import { manifest } from "./helpers";

describe("Relay Host contracts", () => {
  it("accepts the strict immutable Cell manifest and produces a stable plan digest", () => {
    const value = manifest("cell-a", 4101);
    expect(parseCellManifest(value)).toEqual(value);
    expect(hostPlanDigest({ b: 2, a: 1 })).toBe(hostPlanDigest({ a: 1, b: 2 }));
    expect(hostPlanDigest(value)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it.each([
    ["mutable tag", { ...manifest("cell-a", 4101), artifact: { ...manifest("cell-a", 4101).artifact, imageReference: "ghcr.io/orionfold/relay-cell:stable" } }],
    ["wrong repository", { ...manifest("cell-a", 4101), artifact: { ...manifest("cell-a", 4101).artifact, imageReference: `ghcr.io/attacker/relay-cell@${manifest("cell-a", 4101).artifact.imageDigest}` } }],
    ["unknown field", { ...manifest("cell-a", 4101), customerName: "Acme" }],
    ["unsafe id", { ...manifest("cell-a", 4101), cellId: "../cell" }],
  ])("rejects %s before mutation", (_name, value) => {
    expect(() => parseCellManifest(value)).toThrow(RelayHostError);
  });

  it("rejects credential-shaped values and content-bearing keys", () => {
    expect(() => assertContentFree({ note: "Bearer abcdefghijklmnopqrstuvwxyz" })).toThrowError(
      /credential-shaped/,
    );
    expect(() => assertContentFree({ prompt: "customer content" })).toThrowError(
      /forbidden field/,
    );
    expect(() => assertContentFree({ secretRootRef: "/opaque/reference" })).not.toThrow();
  });

  it("accepts legal transitions and names illegal transitions", () => {
    expect(() => assertCellTransition("absent", "creating")).not.toThrow();
    expect(() => assertCellTransition("running", "stopping")).not.toThrow();
    expect(() => assertCellTransition("retained", "purged")).not.toThrow();
    expect(() => assertCellTransition("stopped", "running")).toThrowError(
      /Illegal Relay Cell transition/,
    );
    expect(() => assertCellTransition("purged", "starting")).toThrowError(
      /Illegal Relay Cell transition/,
    );
  });

  it("refuses lexical and symlink path escape", () => {
    const root = mkdtempSync(join(tmpdir(), "relay-host-contract-"));
    const outside = mkdtempSync(join(tmpdir(), "relay-host-outside-"));
    try {
      mkdirSync(join(root, "cells"));
      expect(assertPathInside(root, join(root, "cells", "cell-a"))).toContain(root);
      expect(() => assertPathInside(root, join(root, "..", "escape"))).toThrowError(
        /descendant/,
      );
      symlinkSync(outside, join(root, "cells", "linked"));
      expect(() => assertPathInside(root, join(root, "cells", "linked"))).toThrowError(
        /outside/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
