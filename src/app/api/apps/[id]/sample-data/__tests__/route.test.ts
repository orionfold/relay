import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/packs/sample-data", () => ({
  getSampleDataSummary: vi.fn(),
  removeUntouchedSampleData: vi.fn(),
}));
vi.mock("@/lib/apps/app-runtime-cache", () => ({
  revalidateAppRuntime: vi.fn(),
}));

import { DELETE } from "../route";
import { revalidateAppRuntime } from "@/lib/apps/app-runtime-cache";
import { removeUntouchedSampleData } from "@/lib/packs/sample-data";

describe("DELETE /api/apps/[id]/sample-data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("expires the app runtime snapshot after deleting untouched samples", async () => {
    vi.mocked(removeUntouchedSampleData).mockResolvedValue({
      appId: "relay-agency",
      untouchedRows: 0,
      editedRows: 0,
      untouchedCustomers: 0,
      editedCustomers: 0,
      tableCounts: [],
      removedRows: 35,
      removedCustomers: 6,
      protectedCustomers: 0,
    });

    const response = await DELETE(new Request("http://relay.test") as never, {
      params: Promise.resolve({ id: "relay-agency" }),
    });

    expect(response.status).toBe(200);
    expect(revalidateAppRuntime).toHaveBeenCalledWith("relay-agency", {
      throwOnError: true,
    });
    expect(revalidateAppRuntime).toHaveBeenCalledTimes(1);
  });

  it("does not report success when cache invalidation fails", async () => {
    vi.mocked(removeUntouchedSampleData).mockResolvedValue({
      appId: "relay-agency",
      untouchedRows: 0,
      editedRows: 0,
      untouchedCustomers: 0,
      editedCustomers: 0,
      tableCounts: [],
      removedRows: 35,
      removedCustomers: 6,
      protectedCustomers: 0,
    });
    vi.mocked(revalidateAppRuntime).mockRejectedValue(
      new Error("cache unavailable")
    );

    const response = await DELETE(new Request("http://relay.test") as never, {
      params: Promise.resolve({ id: "relay-agency" }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("was removed"),
    });
  });
});
