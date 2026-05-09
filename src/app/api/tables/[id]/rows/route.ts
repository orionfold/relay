import { NextRequest, NextResponse } from "next/server";
import { getTable, listRows, addRows } from "@/lib/data/tables";
import { rowQuerySchema, addRowsSchema } from "@/lib/tables/validation";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const existing = await getTable(id);
    if (!existing) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const limit = url.searchParams.get("limit")
      ? Number(url.searchParams.get("limit"))
      : undefined;
    const offset = url.searchParams.get("offset")
      ? Number(url.searchParams.get("offset"))
      : undefined;

    let filters: unknown;
    let sorts: unknown;

    const filtersParam = url.searchParams.get("filters");
    if (filtersParam) {
      try {
        filters = JSON.parse(filtersParam);
      } catch {
        return NextResponse.json(
          { error: "Invalid filters JSON" },
          { status: 400 }
        );
      }
    }

    const sortsParam = url.searchParams.get("sorts");
    if (sortsParam) {
      try {
        sorts = JSON.parse(sortsParam);
      } catch {
        return NextResponse.json(
          { error: "Invalid sorts JSON" },
          { status: 400 }
        );
      }
    }

    const parsed = rowQuerySchema.safeParse({ limit, offset, filters, sorts });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const rows = await listRows(id, parsed.data);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[tables] GET rows error:", err);
    return NextResponse.json(
      { error: "Failed to list rows" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const existing = await getTable(id);
    if (!existing) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = addRowsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { ids, skippedHashes } = await addRows(id, parsed.data.rows);
    return NextResponse.json(
      { ids, skipped: skippedHashes.length },
      { status: 201 }
    );
  } catch (err) {
    console.error("[tables] POST rows error:", err);
    return NextResponse.json(
      { error: "Failed to add rows" },
      { status: 500 }
    );
  }
}
