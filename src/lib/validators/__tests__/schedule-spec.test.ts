import { describe, it, expect } from "vitest";
import { ScheduleSpecSchema } from "../schedule-spec";

const scheduledMinimal = {
  id: "daily-summary",
  name: "Daily Summary",
  version: "1.0.0",
  prompt: "Summarize today's activity.",
  type: "scheduled",
  interval: "1d",
};

const heartbeatMinimal = {
  id: "inbox-triage",
  name: "Inbox Triage",
  version: "1.0.0",
  prompt: "Scan the inbox.",
  type: "heartbeat",
  interval: "30m",
};

describe("ScheduleSpec schema", () => {
  it("parses a minimal scheduled spec", () => {
    const r = ScheduleSpecSchema.safeParse(scheduledMinimal);
    expect(r.success).toBe(true);
  });

  it("parses a minimal heartbeat spec", () => {
    const r = ScheduleSpecSchema.safeParse(heartbeatMinimal);
    expect(r.success).toBe(true);
  });

  it("rejects unknown type discriminator", () => {
    const r = ScheduleSpecSchema.safeParse({ ...scheduledMinimal, type: "impossible" });
    expect(r.success).toBe(false);
  });

  it("rejects heartbeat-only field on a scheduled spec", () => {
    const r = ScheduleSpecSchema.safeParse({ ...scheduledMinimal, heartbeatChecklist: ["x"] });
    expect(r.success).toBe(false);
  });

  it("rejects both interval and cronExpression together", () => {
    const r = ScheduleSpecSchema.safeParse({ ...scheduledMinimal, cronExpression: "0 9 * * *" });
    expect(r.success).toBe(false);
  });

  it("rejects neither interval nor cronExpression", () => {
    const { interval: _dropped, ...withoutInterval } = scheduledMinimal;
    const r = ScheduleSpecSchema.safeParse(withoutInterval);
    expect(r.success).toBe(false);
  });

  it("rejects invalid id (single-char, uppercase, starts-with-digit, starts-with-hyphen)", () => {
    for (const badId of ["a", "Foo", "1foo", "-foo"]) {
      const r = ScheduleSpecSchema.safeParse({ ...scheduledMinimal, id: badId });
      expect(r.success, `id="${badId}" should be rejected`).toBe(false);
    }
  });

  it("rejects invalid version (non-semver)", () => {
    for (const badVer of ["1.0", "v1.0.0", "1", "1.0.0.0"]) {
      const r = ScheduleSpecSchema.safeParse({ ...scheduledMinimal, version: badVer });
      expect(r.success, `version="${badVer}" should be rejected`).toBe(false);
    }
  });

  it("round-trips the closed Operations Receipt criteria grammar", () => {
    const valid = ScheduleSpecSchema.safeParse({
      ...scheduledMinimal,
      successCriteria: [
        {
          id: "report-created",
          label: "Report created",
          level: "required",
          check: "output_count_at_least",
          value: 1,
        },
      ],
    });
    expect(valid.success).toBe(true);

    const invalid = ScheduleSpecSchema.safeParse({
      ...scheduledMinimal,
      successCriteria: [
        {
          id: "judge",
          label: "Looks good",
          level: "required",
          check: "llm_judge",
          value: "looks good",
        },
      ],
    });
    expect(invalid.success).toBe(false);
  });
});
