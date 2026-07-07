import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getTable, listRows } from "@/lib/data/tables";
import { PageShell } from "@/components/shared/page-shell";
import { TableDetailTabs } from "@/components/tables/table-detail-tabs";
import { evaluateComputedColumns } from "@/lib/tables/computed";
import type { ColumnDef } from "@/lib/tables/types";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ row?: string | string[] }>;
}

export default async function TableDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const rowParam = Array.isArray(query.row) ? query.row[0] : query.row;
  const table = await getTable(id);

  if (!table) {
    notFound();
  }

  let columns: ColumnDef[] = [];
  try {
    columns = JSON.parse(table.columnSchema) as ColumnDef[];
  } catch {
    columns = [];
  }

  // Fetch project name if table is linked to a project
  let projectName: string | null = null;
  if (table.projectId) {
    const project = db
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, table.projectId))
      .get();
    projectName = project?.name ?? null;
  }

  const rawRows = await listRows(id, { limit: 500 });
  const rows = evaluateComputedColumns(columns, rawRows);

  return (
    <PageShell
      title={table.name}
      description={table.description ?? undefined}
      backHref="/tables"
      backLabel="Tables"
    >
      <TableDetailTabs
        tableId={id}
        columns={columns}
        initialRows={rows}
        tableMeta={{
          source: table.source,
          projectName,
          rowCount: table.rowCount,
          createdAt: table.createdAt ? new Date(table.createdAt).toISOString() : null,
          updatedAt: table.updatedAt ? new Date(table.updatedAt).toISOString() : null,
        }}
        selectedRowId={rowParam ?? null}
      />
    </PageShell>
  );
}
