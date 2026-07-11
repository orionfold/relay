import { describe, it, expect, vi, beforeEach } from "vitest";

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a) },
}));

import { toastDraftCreated, toastRunStarted } from "../run-now-toast";

beforeEach(() => vi.clearAllMocks());

describe("toastDraftCreated (BUG-4 — honest copy, no 'Run started' lie)", () => {
  it("never claims a run started; says a draft was created", () => {
    toastDraftCreated("wf-1");
    const [message] = toastSuccess.mock.calls[0];
    expect(message).toMatch(/draft created/i);
    expect(message).not.toMatch(/run started/i);
  });

  it("deep-links to the workflow's Execute page when an id is present", () => {
    const pushState = vi.spyOn(window.history, "pushState");
    toastDraftCreated("wf-42");
    const opts = toastSuccess.mock.calls[0][1] as {
      action?: { label: string; onClick: () => void };
    };
    expect(opts.action?.label).toMatch(/open workflow/i);
    opts.action?.onClick();
    expect(pushState).toHaveBeenCalledWith(null, "", "/workflows/wf-42");
    pushState.mockRestore();
  });

  it("still avoids the lie when no workflowId is returned", () => {
    toastDraftCreated(undefined);
    const [message, opts] = toastSuccess.mock.calls[0];
    expect(message).toMatch(/draft created/i);
    expect(opts).toBeUndefined();
  });
});

describe("toastRunStarted (CF-FEAT-8 — signpost the live-watch surface)", () => {
  it("names Monitor as where to watch the running workflow", () => {
    toastRunStarted("wf-1");
    const [message] = toastSuccess.mock.calls[0];
    expect(message).toMatch(/run started/i);
    expect(message).toMatch(/monitor/i);
  });

  it("opens this run's detail page from the action button", () => {
    const pushState = vi.spyOn(window.history, "pushState");
    toastRunStarted("wf-7");
    const opts = toastSuccess.mock.calls[0][1] as {
      action?: { label: string; onClick: () => void };
    };
    expect(opts.action?.label).toMatch(/open run/i);
    opts.action?.onClick();
    expect(pushState).toHaveBeenCalledWith(null, "", "/workflows/wf-7");
    pushState.mockRestore();
  });

  it("still signposts Monitor when no workflowId is returned", () => {
    toastRunStarted(undefined);
    const [message, opts] = toastSuccess.mock.calls[0];
    expect(message).toMatch(/monitor/i);
    expect(opts).toBeUndefined();
  });
});
