import { describe, it, expect, vi, afterEach } from "vitest";
import { instantiateAndMaybeExecute } from "../run-now-actions";

describe("instantiateAndMaybeExecute", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("create mode: instantiates only, returns the workflowId, never executes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ workflowId: "wf-1" }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await instantiateAndMaybeExecute("bp-1", {}, "create");

    expect(res).toEqual({ ok: true, workflowId: "wf-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/blueprints/bp-1/instantiate",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("run mode: instantiates THEN executes the returned workflow", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ workflowId: "wf-2" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "started", workflowId: "wf-2" }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await instantiateAndMaybeExecute("bp-1", { x: 1 }, "run");

    expect(res).toEqual({ ok: true, workflowId: "wf-2" });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/workflows/wf-2/execute",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("run mode: surfaces an execute failure without claiming success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ workflowId: "wf-3" }) })
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: "already running" }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await instantiateAndMaybeExecute("bp-1", {}, "run");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/already running/i);
  });

  it("passes through a field-level 400 so the variable form can surface it inline", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ field: "asset", message: "Asset not recognized" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await instantiateAndMaybeExecute("bp-1", {}, "run");

    expect(res).toEqual({ ok: false, error: "Asset not recognized", field: "asset" });
  });

  it("run mode: a missing workflowId is reported, not treated as started", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await instantiateAndMaybeExecute("bp-1", {}, "run");

    expect(res.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1); // never reached execute
  });
});
