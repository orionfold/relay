import { describe, expect, it } from "vitest";
import {
  normalizeSuccessCriteria,
  OperationsCriteriaValidationError,
  parseStoredSuccessCriteria,
  serializeSuccessCriteria,
} from "../criteria";

describe("Operations Receipt success criteria", () => {
  it("normalizes the approved four-check grammar", () => {
    const criteria = normalizeSuccessCriteria([
      {
        id: "completed",
        label: "Run completed",
        level: "required",
        check: "status_is",
        value: "completed",
      },
      {
        id: "contains-summary",
        label: "Includes summary",
        level: "required",
        check: "result_contains",
        value: "summary",
      },
      {
        id: "has-output",
        label: "Created an output",
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
    ]);

    expect(criteria).toHaveLength(4);
    expect(parseStoredSuccessCriteria(serializeSuccessCriteria(criteria))).toEqual(
      criteria
    );
  });

  it("rejects duplicate ids and unsupported or invalid check values", () => {
    expect(() =>
      normalizeSuccessCriteria([
        {
          id: "same",
          label: "First",
          level: "required",
          check: "status_is",
          value: "completed",
        },
        {
          id: "same",
          label: "Second",
          level: "advisory",
          check: "duration_at_most_seconds",
          value: 0,
        },
      ])
    ).toThrow(OperationsCriteriaValidationError);

    expect(() =>
      normalizeSuccessCriteria([
        {
          id: "unsafe",
          label: "Run arbitrary code",
          level: "required",
          check: "script",
          value: "process.exit()",
        },
      ])
    ).toThrow(OperationsCriteriaValidationError);
  });

  it("treats null and an empty list as no declared bar", () => {
    expect(parseStoredSuccessCriteria(null)).toEqual([]);
    expect(serializeSuccessCriteria([])).toBeNull();
  });

  it("names corrupt stored JSON instead of silently treating it as empty", () => {
    expect(() => parseStoredSuccessCriteria("{bad json")).toThrow(
      /not valid JSON/
    );
  });
});
