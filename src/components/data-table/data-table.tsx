"use client";

import { useState } from "react";
import {
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
  type OnChangeFn,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTableToolbar } from "./data-table-toolbar";
import { DataTablePagination } from "./data-table-pagination";
import { cn } from "@/lib/utils";

export type Density = "compact" | "comfortable" | "spacious";

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  /** Callback when a row is clicked (e.g., to open detail pane) */
  onRowClick?: (row: TData) => void;
  /** Enable row selection checkboxes */
  selectable?: boolean;
  /** Controlled selection state */
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  /** Optional toolbar content (filters, actions) */
  toolbarContent?: React.ReactNode;
  /** Show density toggle in toolbar */
  showDensityToggle?: boolean;
  /** Initial density */
  defaultDensity?: Density;
  /** Controlled density from parent — overrides internal state */
  controlledDensity?: Density;
  /** Hide the toolbar entirely (when parent renders its own controls) */
  hideToolbar?: boolean;
  /** Page size options */
  pageSizeOptions?: number[];
  /** Hide pagination */
  hidePagination?: boolean;
  /** Unique row ID accessor (defaults to 'id') */
  getRowId?: (row: TData) => string;
}

const densityClasses: Record<Density, string> = {
  compact: "h-8 text-xs",
  comfortable: "h-10 text-sm",
  spacious: "h-12 text-sm",
};

/**
 * DataTable<T> — generic, sortable, selectable data table.
 *
 * Built on @tanstack/react-table + shadcn Table primitive.
 * Features: sticky header, row selection, density toggle, sortable columns,
 * keyboard navigation (arrow keys + Enter), and row-click callback.
 */
export function DataTable<TData>({
  columns,
  data,
  onRowClick,
  selectable = false,
  rowSelection: controlledRowSelection,
  onRowSelectionChange,
  toolbarContent,
  showDensityToggle = true,
  defaultDensity = "comfortable",
  controlledDensity,
  hideToolbar = false,
  pageSizeOptions = [10, 25, 50, 100],
  hidePagination = false,
  getRowId,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [internalDensity, setInternalDensity] = useState<Density>(defaultDensity);
  const density = controlledDensity ?? internalDensity;
  const setDensity = setInternalDensity;
  const [internalRowSelection, setInternalRowSelection] =
    useState<RowSelectionState>({});

  const rowSelection = controlledRowSelection ?? internalRowSelection;
  const setRowSelection = onRowSelectionChange ?? setInternalRowSelection;

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      rowSelection: selectable ? rowSelection : {},
    },
    enableRowSelection: selectable,
    onSortingChange: setSorting,
    onRowSelectionChange: selectable ? setRowSelection : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: hidePagination ? undefined : getPaginationRowModel(),
    getRowId: getRowId as ((row: TData) => string) | undefined,
  });

  return (
    <div className="space-y-3">
      {!hideToolbar && (
        <DataTableToolbar
          density={density}
          onDensityChange={setDensity}
          showDensityToggle={showDensityToggle}
          selectedCount={
            selectable ? Object.keys(rowSelection).length : undefined
          }
        >
          {toolbarContent}
        </DataTableToolbar>
      )}

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader className="bg-surface-2 sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "font-medium text-muted-foreground",
                      densityClasses[density]
                    )}
                    style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={cn(
                    densityClasses[density],
                    onRowClick &&
                      " hover:bg-accent/50 transition-colors"
                  )}
                  onClick={() => onRowClick?.(row.original)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && onRowClick) {
                      onRowClick(row.original);
                    }
                  }}
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={densityClasses[density]}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {!hidePagination && data.length > pageSizeOptions[0] && (
        <DataTablePagination
          table={table}
          pageSizeOptions={pageSizeOptions}
        />
      )}
    </div>
  );
}
