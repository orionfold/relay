import { afterEach, describe, expect, it } from "vitest";
import { isBranchingEnabled } from "../flag";

describe("isBranchingEnabled", () => {
  const original = process.env.RELAY_CHAT_BRANCHING;

  afterEach(() => {
    if (original === undefined) delete process.env.RELAY_CHAT_BRANCHING;
    else process.env.RELAY_CHAT_BRANCHING = original;
  });

  it("returns false by default (env var unset)", () => {
    delete process.env.RELAY_CHAT_BRANCHING;
    expect(isBranchingEnabled()).toBe(false);
  });

  it("returns true only when env var is exactly 'true'", () => {
    process.env.RELAY_CHAT_BRANCHING = "true";
    expect(isBranchingEnabled()).toBe(true);
  });

  it("returns false for truthy-looking but non-canonical values", () => {
    for (const v of ["1", "yes", "TRUE", "True", " true", "true "]) {
      process.env.RELAY_CHAT_BRANCHING = v;
      expect(isBranchingEnabled()).toBe(false);
    }
  });
});
