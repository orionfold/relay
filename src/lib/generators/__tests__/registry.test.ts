import { describe, expect, it } from "vitest";
import { getGeneratorAdapter } from "../registry";

describe("generator registry", () => {
  it("resolves the static-site generator by type", () => {
    const adapter = getGeneratorAdapter("static-site");
    expect(adapter.generatorType).toBe("static-site");
    expect(typeof adapter.generate).toBe("function");
  });

  it("throws a named error on an unknown generator type", () => {
    expect(() => getGeneratorAdapter("nope")).toThrow(
      "Unknown generator type: nope"
    );
  });
});
