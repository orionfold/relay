"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { tableSourceVariant } from "@/lib/constants/table-status";
import { PackPill } from "@/components/shared/pack-pill";
import { formatRowCount } from "./utils";
import type { TableWithRelations } from "./types";

interface TableListTableProps {
  tables: TableWithRelations[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  /** Resolves a projectId to its pack display name, or null (FEAT-8). */
  packNameForProject?: (projectId: string | null | undefined) => string | null;
}

export function TableListTable({
  tables,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  onSelect,
  onOpen,
  packNameForProject,
}: TableListTableProps) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={
                  tables.length > 0 && selected.size === tables.length
                }
                onCheckedChange={onToggleSelectAll}
              />
            </TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Project</TableHead>
            <TableHead className="text-right">Columns</TableHead>
            <TableHead className="text-right">Rows</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tables.map((t) => (
            <TableRow
              key={t.id}
              onClick={() => onSelect(t.id)}
              onDoubleClick={() => onOpen(t.id)}
            >
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selected.has(t.id)}
                  onCheckedChange={() => onToggleSelect(t.id)}
                />
              </TableCell>
              <TableCell className="font-medium">{t.name}</TableCell>
              <TableCell className="text-muted-foreground">
                {(() => {
                  const packName = packNameForProject?.(t.projectId);
                  return packName ? (
                    <PackPill packName={packName} />
                  ) : (
                    (t.projectName ?? "—")
                  );
                })()}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {t.columnCount}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {formatRowCount(t.rowCount)}
              </TableCell>
              <TableCell>
                <Badge variant={tableSourceVariant[t.source]}>
                  {t.source}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {t.updatedAt
                  ? new Date(t.updatedAt).toLocaleDateString()
                  : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
