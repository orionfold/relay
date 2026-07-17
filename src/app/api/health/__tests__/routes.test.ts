import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prepare } = vi.hoisted(() => ({ prepare: vi.fn() }));
vi.mock("@/lib/db", () => ({ sqlite: { prepare } }));
vi.mock("@/lib/packs/install", () => ({ relayCoreVersion: () => "0.43.0" }));

import { GET as live } from "@/app/api/health/live/route";
import { GET as ready } from "@/app/api/health/ready/route";

describe("Relay cell health routes", () => {
  const originalCellId = process.env.RELAY_CELL_ID;

  beforeEach(() => {
    prepare.mockReturnValue({ get: () => ({ ready: 1 }) });
    process.env.RELAY_CELL_ID = "cell-a";
  });

  afterEach(() => {
    prepare.mockReset();
    if (originalCellId === undefined) delete process.env.RELAY_CELL_ID;
    else process.env.RELAY_CELL_ID = originalCellId;
  });

  it("keeps liveness storage-independent and non-cacheable", async () => {
    const response = live();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "live", contractVersion: 1 });
    expect(prepare).not.toHaveBeenCalled();
  });

  it("returns bounded cell/version/schema readiness without paths", async () => {
    const response = ready();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ready",
      cellId: "cell-a",
      relayVersion: "0.43.0",
      schema: { contractVersion: 1, min: 1, max: 1 },
    });
  });

  it("retains the local readiness identity for an unmanaged process", async () => {
    delete process.env.RELAY_CELL_ID;

    expect(await ready().json()).toMatchObject({
      status: "ready",
      cellId: "local",
    });
  });

  it("fails closed with stable reasons for invalid identity or SQLite", async () => {
    process.env.RELAY_CELL_ID = "Customer / A";
    expect(await ready().json()).toMatchObject({ reason: "CELL_ID_INVALID" });

    process.env.RELAY_CELL_ID = "cell-a";
    prepare.mockImplementation(() => {
      throw new Error("path and secret must not escape");
    });
    const response = ready();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "not_ready",
      reason: "SQLITE_UNAVAILABLE",
      contractVersion: 1,
    });
  });
});
