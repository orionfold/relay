import { describe, it, expect } from "vitest";
import { headerStatus } from "../header-status";
import type { RuntimeState } from "../types";

const base = { app: { id: "a", name: "App" } } as unknown as RuntimeState;

describe("headerStatus (BUG-2 — no fake Running pulse on idle)", () => {
  it("reports 'ready' when nothing is in flight", () => {
    expect(headerStatus({ ...base, activeRunCount: 0 })).toBe("ready");
  });

  it("reports 'ready' when activeRunCount is undefined (baseline query failed)", () => {
    expect(headerStatus({ ...base })).toBe("ready");
  });

  it("reports 'running' only when a task is actually in flight", () => {
    expect(headerStatus({ ...base, activeRunCount: 1 })).toBe("running");
    expect(headerStatus({ ...base, activeRunCount: 3 })).toBe("running");
  });
});
