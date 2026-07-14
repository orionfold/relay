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
import { Card } from "@/components/ui/card";
import { getFileIcon, formatSize, getStatusColor } from "./utils";
import type { DocumentWithRelations } from "./types";

interface DocumentTableProps {
  documents: DocumentWithRelations[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onOpen: (doc: DocumentWithRelations) => void;
}

export function DocumentTable({
  documents,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  onOpen,
}: DocumentTableProps) {
  const allSelected = selected.size === documents.length && documents.length > 0;

  return (
    <Card className="overflow-hidden p-0 gap-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected}
                onCheckedChange={onToggleSelectAll}
                aria-label="Select all documents"
              />
            </TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="hidden md:table-cell">Size</TableHead>
            <TableHead className="hidden md:table-cell">Direction</TableHead>
            <TableHead className="hidden lg:table-cell">Workflow</TableHead>
            <TableHead className="hidden lg:table-cell">Task</TableHead>
            <TableHead className="hidden lg:table-cell">Project</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((doc) => {
            const Icon = getFileIcon(doc.mimeType);
            return (
              <TableRow
                key={doc.id}
                onClick={() => onOpen(doc)}
              >
                <TableCell onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(doc.id)}
                    onCheckedChange={() => onToggleSelect(doc.id)}
                    aria-label={`Select ${doc.originalName}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate max-w-[200px]">{doc.originalName}</span>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                  {formatSize(doc.size)}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {doc.direction}
                    </Badge>
                    {doc.direction === "output" && (
                      <span className="text-xs text-muted-foreground">v{doc.version}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell text-muted-foreground text-sm truncate max-w-[140px]">
                  {doc.workflowName ?? "—"}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-sm">
                  {doc.taskTitle ? (
                    <span className="truncate max-w-[150px] block">{doc.taskTitle}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-sm">
                  {doc.projectName ? (
                    <span className="truncate max-w-[120px] block">{doc.projectName}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={getStatusColor(doc.status)}>
                    {doc.status}
                  </Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                  {new Date(doc.createdAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
