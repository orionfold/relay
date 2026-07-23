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

  it("run mode: calls one atomic start boundary with an idempotency key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "started", workflowId: "wf-2" }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await instantiateAndMaybeExecute(
      "bp-1",
      { x: 1 },
      "run",
      "8c36de5a-51bf-4b47-a425-2a852ca87412",
    );

    expect(res).toEqual({ ok: true, workflowId: "wf-2" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/blueprints/bp-1/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          variables: { x: 1 },
          idempotencyKey: "8c36de5a-51bf-4b47-a425-2a852ca87412",
        }),
      }),
    );
  });

  it("run mode: surfaces an atomic-start refusal without claiming success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: "No eligible runtime" }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await instantiateAndMaybeExecute("bp-1", {}, "run");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/no eligible runtime/i);
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("create mode also rejects a missing workflow identity", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await instantiateAndMaybeExecute("bp-1", {}, "create");

    expect(res).toEqual({
      ok: false,
      error: "The draft was created without an identifiable workflow.",
    });
  });
});
