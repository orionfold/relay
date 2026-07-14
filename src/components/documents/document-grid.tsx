"use client";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { getFileIcon, formatSize, getStatusColor } from "./utils";
import type { DocumentWithRelations } from "./types";

interface DocumentGridProps {
  documents: DocumentWithRelations[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpen: (doc: DocumentWithRelations) => void;
}

export function DocumentGrid({
  documents,
  selected,
  onToggleSelect,
  onOpen,
}: DocumentGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {documents.map((doc) => {
        const Icon = getFileIcon(doc.mimeType);
        const isImage = doc.mimeType.startsWith("image/");

        return (
          <Card
            key={doc.id}
            className="group relative p-3 gap-0 transition-colors"
            onClick={() => onOpen(doc)}
          >
            <div
              className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={selected.has(doc.id)}
                onCheckedChange={() => onToggleSelect(doc.id)}
                aria-label={`Select ${doc.originalName}`}
              />
            </div>

            <div className="flex flex-col items-center gap-2 py-3">
              {isImage ? (
                <img
                  src={`/api/documents/${doc.id}/file?inline=1`}
                  alt={doc.originalName}
                  className="h-16 w-16 object-cover rounded"
                />
              ) : (
                <Icon className="h-10 w-10 text-muted-foreground" />
              )}
            </div>

            <p className="text-sm font-medium truncate">{doc.originalName}</p>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-muted-foreground">
                {formatSize(doc.size)}
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] px-1 py-0 ${getStatusColor(doc.status)}`}
              >
                {doc.status}
              </Badge>
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
              <span className="capitalize">{doc.direction}</span>
              {doc.direction === "output" && <span>v{doc.version}</span>}
            </div>
            {doc.workflowName && (
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                {doc.workflowName}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
