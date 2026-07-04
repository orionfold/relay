import { describe, expect, it } from "vitest";
import { computeSignpost } from "../workflow-header";
import type { WorkflowStatusResponse } from "@/lib/workflows/types";

/**
 * FEAT-7/8: the status-aware signpost. The load-bearing edge case is that
 * `paused` means two different things — a delay pause (resumes on its own) vs.
 * a HITL checkpoint (BUG-3, waiting for the user → Inbox). The signpost must
 * not tell a delayed run to go to the Inbox, nor a HITL run that it resumes
 * automatically.
 */
function makeNonLoop(
  status: string,
  resumeAt: number | null = null
): WorkflowStatusResponse {
  return {
    pattern: "sequence",
    id: "wf-1",
    name: "Demo",
    status,
    resumeAt,
    steps: [],
    workflowState: null,
  } as WorkflowStatusResponse;
}

describe("computeSignpost", () => {
  it("nudges toward Execute on a draft (FEAT-7 — Execute isn't obvious)", () => {
    const s = computeSignpost(makeNonLoop("draft"));
    expect(s?.tone).toBe("info");
    expect(s?.text).toMatch(/execute/i);
    expect(s?.href).toBeUndefined();
  });

  it("points to the steps below while active (the top-level running status)", () => {
    const s = computeSignpost(makeNonLoop("active"));
    expect(s?.icon).toBe("spinner");
    expect(s?.text).toMatch(/watch/i);
  });

  it("also treats the step-level 'running' status as working", () => {
    const s = computeSignpost(makeNonLoop("running"));
    expect(s?.icon).toBe("spinner");
  });

  it("sends a paused HITL run to the Inbox (no resumeAt)", () => {
    const s = computeSignpost(makeNonLoop("paused", null));
    expect(s?.tone).toBe("wait");
    expect(s?.icon).toBe("inbox");
    expect(s?.href).toBe("/inbox");
    expect(s?.text).toMatch(/approval|inbox/i);
  });

  it("labels a delay pause as self-resuming (resumeAt present) — NOT an Inbox prompt", () => {
    const s = computeSignpost(makeNonLoop("paused", Date.now() + 60_000));
    expect(s?.tone).toBe("wait");
    expect(s?.icon).toBe("clock");
    expect(s?.href).toBeUndefined();
    expect(s?.text).toMatch(/resumes/i);
  });

  it("shows no signpost for terminal statuses", () => {
    expect(computeSignpost(makeNonLoop("completed"))).toBeNull();
    expect(computeSignpost(makeNonLoop("failed"))).toBeNull();
    expect(computeSignpost(makeNonLoop("cancelled"))).toBeNull();
  });
});
