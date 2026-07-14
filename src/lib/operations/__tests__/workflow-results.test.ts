import { describe, expect, it } from "vitest";
import { extractWorkflowTerminalResult } from "../workflow-result";

describe("workflow receipt terminal-result extraction", () => {
  it.each([
    [
      "sequence",
      {
        _state: {
          stepStates: [
            { status: "completed", result: "research" },
            { status: "completed", result: "sequence final" },
          ],
        },
      },
      "sequence final",
    ],
    [
      "parallel synthesis",
      {
        _state: {
          stepStates: [
            { status: "completed", result: "branch one" },
            { status: "completed", result: "branch two" },
            { status: "completed", result: "parallel synthesis" },
          ],
        },
      },
      "parallel synthesis",
    ],
    [
      "swarm refinery",
      {
        _state: {
          stepStates: [
            { status: "completed", result: "mayor" },
            { status: "completed", result: "worker" },
            { status: "completed", result: "swarm refinery" },
          ],
        },
      },
      "swarm refinery",
    ],
    [
      "loop final iteration",
      {
        _loopState: {
          iterations: [
            { status: "completed", result: "iteration one" },
            { status: "completed", result: "loop final" },
          ],
        },
      },
      "loop final",
    ],
  ])("uses the %s result shape", (_name, state, expected) => {
    expect(
      extractWorkflowTerminalResult(JSON.stringify(state), ["task fallback"])
    ).toBe(expected);
  });

  it("uses only run-scoped task results when no current definition state is supplied", () => {
    expect(
      extractWorkflowTerminalResult("", ["old run first", "old run final"])
    ).toBe("old run final");
  });
});
