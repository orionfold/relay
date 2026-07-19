import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/apps/registry", () => ({
  getApp: vi.fn(),
  removeInstalledPack: vi.fn(),
}));

import { DELETE } from "../route";
import { removeInstalledPack } from "@/lib/apps/registry";

function makeRequest(): Request {
  return new Request("http://localhost/api/apps/x", { method: "DELETE" });
}

describe("DELETE /api/apps/[id]", () => {
  beforeEach(() => {
    vi.mocked(removeInstalledPack).mockReset();
  });

  it("removes only pack-owned registration/schedules and reports retained data", async () => {
    vi.mocked(removeInstalledPack).mockResolvedValue({
      manifestRemoved: true,
      schedulesRemoved: 1,
      retained: {
        tables: 2,
        profiles: 3,
        blueprints: 4,
        customersAndAttribution: true,
      },
    });

    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "wealth-tracker" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      manifestRemoved: true,
      schedulesRemoved: 1,
      retained: {
        tables: 2,
        profiles: 3,
        blueprints: 4,
        customersAndAttribution: true,
      },
    });
    expect(removeInstalledPack).toHaveBeenCalledWith("wealth-tracker");
  });

  it("returns 404 without mutating anything when the pack is absent", async () => {
    vi.mocked(removeInstalledPack).mockResolvedValue(null);

    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "ghost" }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Pack not found" });
  });

  it("returns 500 with a sanitized message when removal fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.mocked(removeInstalledPack).mockRejectedValue(
      new Error("ENOENT /Users/alice/.relay/apps/broken/manifest.yaml")
    );

    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "broken" }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to remove pack");
    expect(body.error).not.toMatch(/\/Users\//);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("returns 400 when the id is empty", async () => {
    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "" }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Pack id is required" });
    expect(removeInstalledPack).not.toHaveBeenCalled();
  });
});
