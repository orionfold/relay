import { NextRequest, NextResponse } from "next/server";
import { revalidateAppRuntimeForTable } from "@/lib/apps/app-runtime-cache";
import { updateRow, deleteRows, getRow } from "@/lib/data/tables";
import { updateRowSchema } from "@/lib/tables/validation";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; rowId: string }> }
) {
  const { rowId } = await params;

  try {
    const body = await req.json();
    const parsed = updateRowSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const before = await getRow(rowId);
    const row = await updateRow(rowId, parsed.data);
    if (!row) {
      return NextResponse.json({ error: "Row not found" }, { status: 404 });
    }
    if (!before || before.data !== row.data) {
      await revalidateAppRuntimeForTable(row.tableId);
    }
    return NextResponse.json(row);
  } catch (err) {
    console.error("[tables] PATCH row error:", err);
    return NextResponse.json(
      { error: "Failed to update row" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; rowId: string }> }
) {
  const { rowId } = await params;

  try {
    const row = await getRow(rowId);
    await deleteRows([rowId]);
    if (row) {
      await revalidateAppRuntimeForTable(row.tableId);
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[tables] DELETE row error:", err);
    return NextResponse.json(
      { error: "Failed to delete row" },
      { status: 500 }
    );
  }
}
