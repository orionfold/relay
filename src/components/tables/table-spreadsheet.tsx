"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CellDisplay } from "./table-cell-editor";
import { SpreadsheetColumnHeader } from "./table-column-header";
import { TableColumnSheet } from "./table-column-sheet";
import { TableToolbar } from "./table-toolbar";
import { TableImportWizard } from "./table-import-wizard";
import { TableRowSheet } from "./table-row-sheet";
import { TableEnrichmentSheet } from "./table-enrichment-sheet";
import { TableEnrichmentRuns } from "./table-enrichment-runs";
import { EmptyState } from "@/components/shared/empty-state";
import { Table2 } from "lucide-react";
import { evaluateComputedColumns } from "@/lib/tables/computed";
import type { ColumnDef, SortSpec } from "@/lib/tables/types";
import type { UserTableRowRow } from "@/lib/db/schema";

interface TableSpreadsheetProps {
  tableId: string;
  columns: ColumnDef[];
  initialRows: UserTableRowRow[];
  initialSelectedRowId?: string | null;
}

interface ParsedRow {
  id: string;
  data: Record<string, unknown>;
  position: number;
  createdBy: string | null;
}

function parseRows(rows: UserTableRowRow[]): ParsedRow[] {
  return rows.map((r) => ({
    id: r.id,
    data: JSON.parse(r.data) as Record<string, unknown>,
    position: r.position,
    createdBy: r.createdBy,
  }));
}

export function TableSpreadsheet({
  tableId,
  columns: initialColumns,
  initialRows,
  initialSelectedRowId = null,
}: TableSpreadsheetProps) {
  const [columns, setColumns] = useState<ColumnDef[]>(initialColumns);
  const [rows, setRows] = useState<ParsedRow[]>(() => parseRows(initialRows));
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [sorts, setSorts] = useState<SortSpec[]>([]);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [rowSheetOpen, setRowSheetOpen] = useState(false);
  const [rowSheetRow, setRowSheetRow] = useState<ParsedRow | null>(null);
  const [enrichmentOpen, setEnrichmentOpen] = useState(false);
  const [enrichmentRefreshKey, setEnrichmentRefreshKey] = useState(0);
  const openedInitialRowRef = useRef<string | null>(null);

  // ── Refresh helpers ─────────────────────────────────────────────────

  const refreshTable = useCallback(async () => {
    try {
      const res = await fetch(`/api/tables/${tableId}`);
      if (res.ok) {
        const table = await res.json();
        const parsed = JSON.parse(table.columnSchema) as ColumnDef[];
        setColumns(parsed);
      }
    } catch { /* silent */ }
  }, [tableId]);

  const refreshRows = useCallback(async () => {
    try {
      const sortsParam = sorts.length > 0 ? `&sorts=${encodeURIComponent(JSON.stringify(sorts))}` : "";
      const res = await fetch(`/api/tables/${tableId}/rows?limit=500${sortsParam}`);
      if (res.ok) {
        const raw = (await res.json()) as UserTableRowRow[];
        const enriched = evaluateComputedColumns(columns, raw);
        setRows(parseRows(enriched));
      }
    } catch { /* silent */ }
  }, [tableId, sorts, columns]);

  // ── Boolean toggle (inline for convenience) ─────────────────────────

  const handleToggleBoolean = useCallback(
    (rowId: string, colName: string, newValue: boolean) => {
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? { ...r, data: { ...r.data, [colName]: newValue } }
            : r
        )
      );
      // Save immediately
      fetch(`/api/tables/${tableId}/rows/${rowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { [colName]: newValue } }),
      }).catch(() => toast.error("Failed to save"));
    },
    [tableId]
  );

  // ── Row operations ──────────────────────────────────────────────────

  const handleAddRow = useCallback(async () => {
    try {
      const emptyData: Record<string, unknown> = {};
      for (const col of columns) {
        emptyData[col.name] = col.defaultValue ?? null;
      }

      const res = await fetch(`/api/tables/${tableId}/rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [{ data: emptyData }] }),
      });

      if (res.ok) {
        await refreshRows();
      } else {
        toast.error("Failed to add row");
      }
    } catch {
      toast.error("Failed to add row");
    }
  }, [tableId, columns, refreshRows]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedRows.size === 0) return;

    try {
      const promises = Array.from(selectedRows).map((rowId) =>
        fetch(`/api/tables/${tableId}/rows/${rowId}`, { method: "DELETE" })
      );
      await Promise.all(promises);
      setSelectedRows(new Set());
      await refreshRows();
      toast.success(`Deleted ${selectedRows.size} row(s)`);
    } catch {
      toast.error("Failed to delete rows");
    }
  }, [tableId, selectedRows, refreshRows]);

  // ── Row sheet ──────────────────────────────────────────────────────

  const handleOpenRowSheet = useCallback((row: ParsedRow) => {
    setRowSheetRow(row);
    setRowSheetOpen(true);
  }, []);

  useEffect(() => {
    if (!initialSelectedRowId || openedInitialRowRef.current === initialSelectedRowId) {
      return;
    }
    const selectedRow = rows.find((row) => row.id === initialSelectedRowId);
    if (!selectedRow) {
      return;
    }
    openedInitialRowRef.current = initialSelectedRowId;
    handleOpenRowSheet(selectedRow);
  }, [handleOpenRowSheet, initialSelectedRowId, rows]);

  const handleRowUpdated = useCallback((rowId: string, data: Record<string, unknown>) => {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, data } : r))
    );
  }, []);

  // ── Column operations ───────────────────────────────────────────────

  const handleSort = useCallback(
    (colName: string, direction: "asc" | "desc") => {
      setSorts([{ column: colName, direction }]);
    },
    []
  );

  const handleDeleteColumn = useCallback(
    async (_columnName: string) => {
      toast.info("Column deletion coming soon");
    },
    []
  );

  // Trigger row refresh when sorts change without mutating state during render.
  const prevSortsRef = useRef(sorts);
  useEffect(() => {
    if (prevSortsRef.current === sorts) {
      return;
    }
    prevSortsRef.current = sorts;
    void refreshRows();
  }, [sorts, refreshRows]);

  // ── Selection helpers ───────────────────────────────────────────────

  function toggleRowSelect(rowId: string) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedRows.size === rows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(rows.map((r) => r.id)));
    }
  }

  // ── Render ──────────────────────────────────────────────────────────

  if (columns.length === 0) {
    return (
      <div className="space-y-4">
        <TableToolbar
          tableId={tableId}
          rowCount={0}
          selectedCount={0}
          onAddRow={handleAddRow}
          onAddColumn={() => setColumnSheetOpen(true)}
          onBulkDelete={handleBulkDelete}
          onImport={() => setImportOpen(true)}
        />
        <EmptyState
          icon={Table2}
          heading="No columns defined"
          description="Add columns to start building your table structure."
          action={
            <Button onClick={() => setColumnSheetOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Column
            </Button>
          }
        />
        <TableColumnSheet
          tableId={tableId}
          open={columnSheetOpen}
          onOpenChange={setColumnSheetOpen}
          onColumnAdded={() => { refreshTable(); refreshRows(); }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <TableToolbar
        tableId={tableId}
        rowCount={rows.length}
        selectedCount={selectedRows.size}
        onAddRow={handleAddRow}
        onAddColumn={() => setColumnSheetOpen(true)}
        onBulkDelete={handleBulkDelete}
        onImport={() => setImportOpen(true)}
        onEnrich={() => setEnrichmentOpen(true)}
      />

      <TableEnrichmentRuns
        tableId={tableId}
        refreshKey={enrichmentRefreshKey}
      />

      <div className="rounded-lg border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={rows.length > 0 && selectedRows.size === rows.length}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              {columns.map((col) => {
                const sortDir = sorts.find((s) => s.column === col.name)?.direction ?? null;
                return (
                  <TableHead key={col.name} className="group min-w-[120px]">
                    <SpreadsheetColumnHeader
                      column={col}
                      sortDirection={sortDir}
                      onSort={(dir) => handleSort(col.name, dir)}
                      onRename={() => toast.info("Rename coming soon")}
                      onDelete={() => handleDeleteColumn(col.name)}
                    />
                  </TableHead>
                );
              })}
              <TableHead className="w-10">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setColumnSheetOpen(true)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + 2}
                  className="h-24 text-center text-muted-foreground"
                >
                  No rows yet.{" "}
                  <button
                    className="underline underline-offset-2 hover:text-foreground"
                    onClick={handleAddRow}
                  >
                    Add your first row
                  </button>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(
                    selectedRows.has(row.id) && "bg-muted/50"
                  )}
                  onClick={() => handleOpenRowSheet(row)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedRows.has(row.id)}
                      onCheckedChange={() => toggleRowSelect(row.id)}
                    />
                  </TableCell>
                  {columns.map((col) => {
                    const value = row.data[col.name];

                    return (
                      <TableCell
                        key={col.name}
                        className="min-w-[120px]"
                      >
                        <div className="px-2 py-1 min-h-[32px] flex items-center">
                          <CellDisplay
                            column={col}
                            value={value}
                            onToggleBoolean={
                              col.dataType === "boolean"
                                ? (newVal) => {
                                    handleToggleBoolean(row.id, col.name, newVal);
                                  }
                                : undefined
                            }
                          />
                        </div>
                      </TableCell>
                    );
                  })}
                  <TableCell />
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {rows.length > 0 && (
        <div className="flex justify-start">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={handleAddRow}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Row
          </Button>
        </div>
      )}

      <TableColumnSheet
        tableId={tableId}
        open={columnSheetOpen}
        onOpenChange={setColumnSheetOpen}
        onColumnAdded={() => { refreshTable(); refreshRows(); }}
      />

      <TableImportWizard
        tableId={tableId}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => { refreshTable(); refreshRows(); }}
      />

      <TableEnrichmentSheet
        open={enrichmentOpen}
        onOpenChange={setEnrichmentOpen}
        tableId={tableId}
        columns={columns}
        onLaunched={() => {
          setEnrichmentRefreshKey((current) => current + 1);
          refreshRows();
        }}
      />

      {rowSheetRow && (
        <TableRowSheet
          tableId={tableId}
          columns={columns}
          row={rowSheetRow}
          open={rowSheetOpen}
          onOpenChange={setRowSheetOpen}
          onRowUpdated={handleRowUpdated}
        />
      )}
    </div>
  );
}
