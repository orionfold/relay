import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/apps/app-runtime-cache", () => ({
  revalidateAppRuntimeForTable: vi.fn(),
}));

vi.mock("@/lib/data/tables", () => ({
  getRow: vi.fn(),
  updateRow: vi.fn(),
  deleteRows: vi.fn(),
}));

import { DELETE, PATCH } from "../route";
import { revalidateAppRuntimeForTable } from "@/lib/apps/app-runtime-cache";
import { deleteRows, getRow, updateRow } from "@/lib/data/tables";

function req(body?: unknown) {
  return new Request("http://localhost/api/tables/table-1/rows/row-1", {
    method: body ? "PATCH" : "DELETE",
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "Content-Type": "application/json" } : undefined,
  }) as unknown as import("next/server").NextRequest;
}

describe("PATCH /api/tables/[id]/rows/[rowId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revalidates app runtime caches when row data changes", async () => {
    vi.mocked(getRow).mockResolvedValueOnce({
      id: "row-1",
      tableId: "table-1",
      data: JSON.stringify({ title: "Before" }),
    } as Awaited<ReturnType<typeof getRow>>);
    vi.mocked(updateRow).mockResolvedValue({
      id: "row-1",
      tableId: "table-1",
      data: JSON.stringify({ title: "After" }),
    } as Awaited<ReturnType<typeof updateRow>>);

    const res = await PATCH(req({ data: { title: "After" } }), {
      params: Promise.resolve({ id: "table-1", rowId: "row-1" }),
    });

    expect(res.status).toBe(200);
    expect(revalidateAppRuntimeForTable).toHaveBeenCalledWith("table-1");
  });

  it("does not revalidate app runtime caches for no-op row updates", async () => {
    const unchanged = {
      id: "row-1",
      tableId: "table-1",
      data: JSON.stringify({ title: "Same" }),
    } as Awaited<ReturnType<typeof getRow>>;
    vi.mocked(getRow).mockResolvedValueOnce(unchanged);
    vi.mocked(updateRow).mockResolvedValue(unchanged);

    const res = await PATCH(req({ data: { title: "Same" } }), {
      params: Promise.resolve({ id: "table-1", rowId: "row-1" }),
    });

    expect(res.status).toBe(200);
    expect(revalidateAppRuntimeForTable).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/tables/[id]/rows/[rowId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revalidates app runtime caches when deleting an existing row", async () => {
    vi.mocked(getRow).mockResolvedValueOnce({
      id: "row-1",
      tableId: "table-1",
      data: JSON.stringify({ title: "Delete me" }),
    } as Awaited<ReturnType<typeof getRow>>);
    vi.mocked(deleteRows).mockResolvedValue(undefined);

    const res = await DELETE(req(), {
      params: Promise.resolve({ id: "table-1", rowId: "row-1" }),
    });

    expect(res.status).toBe(204);
    expect(revalidateAppRuntimeForTable).toHaveBeenCalledWith("table-1");
  });
});
