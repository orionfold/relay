import { NextRequest, NextResponse } from "next/server";
import { getTable, listRows } from "@/lib/data/tables";
import type { ColumnDef } from "@/lib/tables/types";
import { writeXlsxWorkbook } from "@/lib/spreadsheets/xlsx";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const table = await getTable(id);
    if (!table) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const format = url.searchParams.get("format") ?? "csv";

    let columns: ColumnDef[] = [];
    try {
      columns = JSON.parse(table.columnSchema) as ColumnDef[];
    } catch {
      columns = [];
    }

    // Fetch all rows (up to 10000)
    const rows = await listRows(id, { limit: 10000 });
    const parsedRows = rows.map((r) => JSON.parse(r.data) as Record<string, unknown>);

    switch (format) {
      case "json":
        return new NextResponse(JSON.stringify(parsedRows, null, 2), {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="${table.name}.json"`,
          },
        });

      case "xlsx": {
        const data = [
          columns.map((column) => column.displayName),
          ...parsedRows.map((row) =>
            columns.map((column) => row[column.name] ?? ""),
          ),
        ];
        const buffer = await writeXlsxWorkbook(data, table.name);
        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="${table.name}.xlsx"`,
          },
        });
      }

      case "csv":
      default: {
        const lines: string[] = [];
        // Header
        lines.push(columns.map((c) => escapeCsvField(c.displayName)).join(","));
        // Data rows
        for (const row of parsedRows) {
          lines.push(
            columns.map((c) => escapeCsvField(String(row[c.name] ?? ""))).join(",")
          );
        }
        const csv = lines.join("\n");
        return new NextResponse(csv, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${table.name}.csv"`,
          },
        });
      }
    }
  } catch (err) {
    console.error("[tables/export] GET error:", err);
    return NextResponse.json({ error: "Failed to export table" }, { status: 500 });
  }
}

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
