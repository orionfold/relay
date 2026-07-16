import { afterEach, describe, expect, it, vi } from "vitest";
import { checkActiveHours } from "../active-hours";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("checkActiveHours", () => {
  it("stays active when no complete window is configured", () => {
    expect(checkActiveHours(null, 17, "UTC")).toEqual({
      isActive: true,
      nextActiveAt: null,
    });
    expect(checkActiveHours(9, null, "UTC")).toEqual({
      isActive: true,
      nextActiveAt: null,
    });
  });

  it("evaluates a same-day window and computes its next UTC opening", () => {
    expect(
      checkActiveHours(9, 17, "UTC", new Date("2026-07-16T10:00:00.000Z"))
    ).toEqual({ isActive: true, nextActiveAt: null });

    const before = checkActiveHours(
      9,
      17,
      "UTC",
      new Date("2026-07-16T08:00:00.000Z")
    );
    expect(before.isActive).toBe(false);
    expect(before.nextActiveAt?.toISOString()).toBe(
      "2026-07-16T09:00:00.000Z"
    );

    const after = checkActiveHours(
      9,
      17,
      "UTC",
      new Date("2026-07-16T18:00:00.000Z")
    );
    expect(after.isActive).toBe(false);
    expect(after.nextActiveAt?.toISOString()).toBe(
      "2026-07-17T09:00:00.000Z"
    );
  });

  it("supports overnight windows", () => {
    expect(
      checkActiveHours(22, 6, "UTC", new Date("2026-07-16T23:00:00.000Z"))
    ).toEqual({ isActive: true, nextActiveAt: null });
    expect(
      checkActiveHours(22, 6, "UTC", new Date("2026-07-16T03:00:00.000Z"))
    ).toEqual({ isActive: true, nextActiveAt: null });

    const midday = checkActiveHours(
      22,
      6,
      "UTC",
      new Date("2026-07-16T12:00:00.000Z")
    );
    expect(midday.isActive).toBe(false);
    expect(midday.nextActiveAt?.toISOString()).toBe(
      "2026-07-16T22:00:00.000Z"
    );
  });

  it("fails open with a visible warning for an invalid timezone", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(
      checkActiveHours(
        9,
        17,
        "Not/A_Timezone",
        new Date("2026-07-16T12:00:00.000Z")
      )
    ).toEqual({ isActive: true, nextActiveAt: null });
    expect(warn).toHaveBeenCalledWith(
      '[active-hours] Invalid timezone "Not/A_Timezone", defaulting to always active'
    );
  });
});
