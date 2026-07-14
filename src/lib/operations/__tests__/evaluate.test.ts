import { describe, expect, it } from "vitest";
import type { SuccessCriteria } from "../criteria";
import { evaluateOperationsReceipt } from "../evaluate";

const criteria: SuccessCriteria = [
  {
    id: "completed",
    label: "Run completed",
    level: "required",
    check: "status_is",
    value: "completed",
  },
  {
    id: "report",
    label: "Produced a report",
    level: "required",
    check: "output_count_at_least",
    value: 1,
  },
  {
    id: "timely",
    label: "Finished within ten minutes",
    level: "advisory",
    check: "duration_at_most_seconds",
    value: 600,
  },
];

describe("Operations Receipt evaluation", () => {
  it("passes when the completed run meets every criterion", () => {
    const result = evaluateOperationsReceipt(criteria, {
      status: "completed",
      result: "Report generated",
      outputCount: 1,
      durationSeconds: 120,
    });

    expect(result.verdict).toBe("passed");
    expect(result.evidence.every((item) => item.status === "passed")).toBe(true);
    expect(result.nextAction).toBe("No action needed.");
  });

  it("fails when a required criterion is definitively false", () => {
    const result = evaluateOperationsReceipt(criteria, {
      status: "completed",
      result: "No report",
      outputCount: 0,
      durationSeconds: 120,
    });

    expect(result.verdict).toBe("failed");
    expect(result.summary).toContain("Produced a report");
  });

  it("marks a completed run at risk when an advisory criterion misses", () => {
    const result = evaluateOperationsReceipt(criteria, {
      status: "completed",
      result: "Report generated",
      outputCount: 1,
      durationSeconds: 900,
    });

    expect(result.verdict).toBe("at_risk");
    expect(result.summary).toContain("Finished within ten minutes");
  });

  it("marks missing evidence at risk instead of passing or failing", () => {
    const result = evaluateOperationsReceipt(
      [
        {
          id: "answer",
          label: "Includes the answer",
          level: "required",
          check: "result_contains",
          value: "answer",
        },
      ],
      {
        status: "completed",
        result: null,
        outputCount: 0,
        durationSeconds: 10,
      }
    );

    expect(result.verdict).toBe("at_risk");
    expect(result.evidence[0]?.status).toBe("missing");
  });

  it("marks a source runtime failure failed regardless of criteria", () => {
    const result = evaluateOperationsReceipt([], {
      status: "failed",
      result: "timeout",
      outputCount: 0,
      durationSeconds: 60,
    });

    expect(result.verdict).toBe("failed");
    expect(result.nextAction).toContain("diagnostics");
  });

  it("marks a completed run without a declared bar at risk", () => {
    const result = evaluateOperationsReceipt([], {
      status: "completed",
      result: "done",
      outputCount: 0,
      durationSeconds: 20,
    });

    expect(result.verdict).toBe("at_risk");
    expect(result.nextAction).toContain("Configure success criteria");
  });
});
