import { describe, it, expect } from "vitest";
import { createTaskSchema } from "@/lib/validators/task";

describe("vitest setup verification", () => {
  it("runs a basic assertion", () => {
    expect(1 + 1).toBe(2);
  });

  it("resolves the @/ path alias", () => {
    expect(createTaskSchema).toBeDefined();
  });
});
