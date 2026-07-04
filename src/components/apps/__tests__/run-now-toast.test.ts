import { describe, it, expect, vi, beforeEach } from "vitest";

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a) },
}));

import { toastDraftCreated } from "../run-now-toast";

beforeEach(() => vi.clearAllMocks());

describe("toastDraftCreated (BUG-4 — honest copy, no 'Run started' lie)", () => {
  it("never claims a run started; says a draft was created", () => {
    toastDraftCreated("wf-1");
    const [message] = toastSuccess.mock.calls[0];
    expect(message).toMatch(/draft created/i);
    expect(message).not.toMatch(/run started/i);
  });

  it("deep-links to the workflow's Execute page when an id is present", () => {
    toastDraftCreated("wf-42");
    const opts = toastSuccess.mock.calls[0][1] as {
      action?: { label: string; onClick: () => void };
    };
    expect(opts.action?.label).toMatch(/open workflow/i);
    // Simulate the action click → navigates to the workflow detail page.
    // jsdom's window.location.assign isn't spyable, so swap the whole object.
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, assign },
    });
    try {
      opts.action?.onClick();
      expect(assign).toHaveBeenCalledWith("/workflows/wf-42");
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: original,
      });
    }
  });

  it("still avoids the lie when no workflowId is returned", () => {
    toastDraftCreated(undefined);
    const [message, opts] = toastSuccess.mock.calls[0];
    expect(message).toMatch(/draft created/i);
    expect(opts).toBeUndefined();
  });
});
