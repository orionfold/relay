"use client";

import { useState } from "react";
import { ExternalLink, ImageOff } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  categoryTone,
  numericPresentation,
  resolveRenderColumns,
  safeThumbnailUrl,
} from "@/lib/tables/render";
import type { ColumnDef } from "@/lib/tables/types";

interface RenderRow {
  id: string;
  data: Record<string, unknown>;
  sampleState?: "sample" | "sample-edited" | null;
}

interface TableRenderViewProps {
  columns: ColumnDef[];
  rows: RenderRow[];
  selectedRows: Set<string>;
  onToggleSelect: (rowId: string) => void;
  onOpenRow: (row: RenderRow) => void;
}

const categoryClasses = [
  "border-status-running/30 bg-status-running/10 text-foreground",
  "border-status-completed/30 bg-status-completed/10 text-foreground",
  "border-status-warning/30 bg-status-warning/10 text-foreground",
  "border-primary/30 bg-primary/10 text-foreground",
  "border-border-strong bg-surface-2 text-foreground",
  "border-muted-foreground/30 bg-muted text-foreground",
];

function text(value: unknown): string {
  return value == null || value === "" ? "Unavailable" : String(value);
}

function dateText(value: unknown): string {
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? text(value)
    : date.toLocaleDateString();
}

function linkHref(column: ColumnDef, value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  if (column.dataType === "email") return `mailto:${value}`;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function TableRenderView({
  columns,
  rows,
  selectedRows,
  onToggleSelect,
  onOpenRow,
}: TableRenderViewProps) {
  const resolved = resolveRenderColumns(columns);
  const title = resolved.find((entry) => entry.role === "title");
  const description = resolved.find((entry) => entry.role === "description");
  const image = resolved.find((entry) => entry.role === "image");
  const categories = resolved.filter((entry) => entry.role === "category");
  const metrics = resolved.filter((entry) => entry.role === "metric");
  const metadata = resolved.filter((entry) =>
    ["date", "link", "boolean", "meta"].includes(entry.role)
  );

  if (rows.length === 0) {
    return (
      <div className="surface-card-muted rounded-lg p-8 text-center text-sm text-muted-foreground">
        No rows yet. Add a row to see the rendered view.
      </div>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {rows.map((row) => (
        <RenderItem
          key={row.id}
          row={row}
          rows={rows}
          title={title}
          description={description}
          image={image}
          categories={categories}
          metrics={metrics}
          metadata={metadata}
          selected={selectedRows.has(row.id)}
          onToggleSelect={() => onToggleSelect(row.id)}
          onOpen={() => onOpenRow(row)}
        />
      ))}
    </div>
  );
}

function RenderItem({
  row,
  rows,
  title,
  description,
  image,
  categories,
  metrics,
  metadata,
  selected,
  onToggleSelect,
  onOpen,
}: {
  row: RenderRow;
  rows: RenderRow[];
  title?: ReturnType<typeof resolveRenderColumns>[number];
  description?: ReturnType<typeof resolveRenderColumns>[number];
  image?: ReturnType<typeof resolveRenderColumns>[number];
  categories: ReturnType<typeof resolveRenderColumns>;
  metrics: ReturnType<typeof resolveRenderColumns>;
  metadata: ReturnType<typeof resolveRenderColumns>;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const thumbnail = image
    ? safeThumbnailUrl(row.data[image.column.name])
    : null;
  const itemTitle = title ? text(row.data[title.column.name]) : "Untitled row";

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Open ${itemTitle}`}
      data-interactive-surface=""
      data-interactive-outline="preserve"
      className={cn(
        "interactive-list-item surface-card rounded-lg border p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "bg-muted"
      )}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="flex min-w-0 gap-3">
        <div onClick={(event) => event.stopPropagation()}>
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelect}
            aria-label={`Select ${itemTitle}`}
          />
        </div>

        {image && (
          <div className="surface-card-muted flex h-[72px] w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border">
            {thumbnail && !imageFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbnail}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <ImageOff
                className="h-5 w-5 text-muted-foreground"
                aria-label="Image unavailable"
              />
            )}
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-medium">{itemTitle}</h3>
              {row.sampleState && (
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {row.sampleState === "sample-edited"
                    ? "Edited sample"
                    : "Sample"}
                </Badge>
              )}
            </div>
            {description && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {text(row.data[description.column.name])}
              </p>
            )}
          </div>

          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {categories.map(({ column }) => {
                const value = row.data[column.name];
                if (value == null || value === "") return null;
                return (
                  <span
                    key={column.name}
                    className={cn(
                      "inline-flex rounded-md border px-2 py-0.5 text-xs font-medium",
                      categoryClasses[categoryTone(value)]
                    )}
                  >
                    {text(value)}
                  </span>
                );
              })}
            </div>
          )}

          {metrics.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {metrics.map(({ column }) => {
                const value = row.data[column.name];
                const presentation = numericPresentation(
                  value,
                  rows.map((candidate) => candidate.data[column.name]),
                  column.config
                );
                return (
                  <div
                    key={column.name}
                    className="surface-card-muted rounded-md border p-2"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {column.displayName}
                      </span>
                      <span className="text-sm font-medium tabular-nums">
                        {Number.isFinite(Number(value))
                          ? Number(value).toLocaleString()
                          : text(value)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        {presentation.normalized != null && (
                          <div
                            className="h-full bg-primary"
                            style={{
                              width: `${Math.max(8, presentation.normalized * 100)}%`,
                            }}
                          />
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {presentation.label}
                        {presentation.direction !== "Neutral"
                          ? ` · ${presentation.direction}`
                          : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {metadata.length > 0 && (
            <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
              {metadata.map(({ column, role }) => {
                const value = row.data[column.name];
                const href = role === "link" ? linkHref(column, value) : null;
                return (
                  <div key={column.name} className="flex min-w-0 gap-2">
                    <dt className="shrink-0 text-muted-foreground">
                      {column.displayName}
                    </dt>
                    <dd className="min-w-0 truncate">
                      {href ? (
                        <a
                          href={href}
                          target={href.startsWith("mailto:") ? undefined : "_blank"}
                          rel={href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
                          className="inline-flex max-w-full items-center gap-1 text-primary underline underline-offset-2"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <span className="truncate">{text(value)}</span>
                          {!href.startsWith("mailto:") && (
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          )}
                        </a>
                      ) : role === "date" ? (
                        dateText(value)
                      ) : role === "boolean" ? (
                        value ? "Yes" : "No"
                      ) : (
                        text(value)
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}
        </div>
      </div>
    </article>
  );
}
