"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table2 } from "lucide-react";
import { tableSourceVariant } from "@/lib/constants/table-status";
import { PackPill } from "@/components/shared/pack-pill";
import { formatRowCount, formatColumnCount } from "./utils";
import type { TableWithRelations } from "./types";

interface TableGridProps {
  tables: TableWithRelations[];
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  /** Resolves a projectId to its pack display name, or null (FEAT-8). */
  packNameForProject?: (projectId: string | null | undefined) => string | null;
}

export function TableGrid({
  tables,
  onSelect,
  onOpen,
  packNameForProject,
}: TableGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {tables.map((t) => (
        <Card
          key={t.id}
          tone="schema"
          watermark={Table2}
          className="cursor-pointer hover:border-primary/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          tabIndex={0}
          onClick={() => onSelect(t.id)}
          onDoubleClick={() => onOpen(t.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onOpen(t.id);
          }}
        >
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <CardTitle className="text-sm font-medium">
                {t.name}
              </CardTitle>
              <Badge variant={tableSourceVariant[t.source]} className="text-xs">
                {t.source}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {t.description && (
              <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                {t.description}
              </p>
            )}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{formatColumnCount(t.columnCount)}</span>
              <span>{formatRowCount(t.rowCount)}</span>
              {(() => {
                const packName = packNameForProject?.(t.projectId);
                if (packName) return <PackPill packName={packName} />;
                return t.projectName ? (
                  <span className="truncate">{t.projectName}</span>
                ) : null;
              })()}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
