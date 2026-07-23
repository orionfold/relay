import { describe, expect, it } from "vitest";
import { materializeSampleRows } from "../install";

describe("sample data materialization", () => {
  it("keeps current-month samples meaningful across year boundaries", () => {
    const input = [
      {
        date: "{{current_month}}-04",
        description: "Current-month retainer",
        amount: "1200",
      },
    ];

    expect(
      materializeSampleRows(input, new Date("2027-01-20T12:00:00Z"))
    ).toEqual([
      {
        date: "2027-01-04",
        description: "Current-month retainer",
        amount: "1200",
      },
    ]);
    expect(input[0].date).toBe("{{current_month}}-04");
  });
});
