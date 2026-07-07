import { describe, expect, it } from "vitest";
import { getPublisherAdapter } from "../registry";

describe("publisher registry", () => {
  it("resolves the github-pages adapter by target type", () => {
    const adapter = getPublisherAdapter("github-pages");
    expect(adapter.targetType).toBe("github-pages");
    expect(typeof adapter.publish).toBe("function");
    expect(typeof adapter.testConnection).toBe("function");
  });

  it("throws a named error on an unknown target type", () => {
    expect(() => getPublisherAdapter("nope")).toThrow(
      "Unknown publish target type: nope"
    );
  });
});
