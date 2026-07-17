import { describe, expect, it } from "vitest";
import { InvalidRelayCellIdError } from "@/lib/config/env";
import { classifyExecutionTargetError } from "../execution-target-preview";

describe("classifyExecutionTargetError", () => {
  it("preserves the named managed Cell identity failure", () => {
    expect(classifyExecutionTargetError(new InvalidRelayCellIdError())).toEqual({
      code: "cell_identity_invalid",
      message: "RELAY_CELL_ID must be a lowercase DNS label of at most 63 characters.",
    });
  });
});
