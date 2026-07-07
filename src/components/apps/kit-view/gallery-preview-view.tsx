import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import type { GalleryData } from "@/lib/apps/view-kits/types";

interface GalleryPreviewViewProps {
  gallery: GalleryData;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function safeUrl(value: unknown): string | null {
  const raw = text(value).trim();
  if (!raw) return null;
  // Normalize control chars and whitespace before scheme detection. Browsers
  // ignore these inside URL schemes, so the raw string is not safe to inspect.
  // eslint-disable-next-line no-control-regex
  const normalized = raw.replace(/[\x00-\x20\x7F]/g, "");
  const scheme = normalized.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (scheme) {
    const s = scheme[1]!.toLowerCase();
    if (s !== "http" && s !== "https" && s !== "mailto") return null;
  }
  return raw;
}

export function GalleryPreviewView({ gallery }: GalleryPreviewViewProps) {
  const { spec, rows } = gallery;

  if (rows.length === 0) {
    return (
      <div className="surface-card-muted rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        No gallery items.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => {
        const title = text(row.data[spec.titleColumn]) || "Untitled";
        const subtitle = spec.subtitleColumn ? text(row.data[spec.subtitleColumn]) : "";
        const meta = spec.metaColumn ? text(row.data[spec.metaColumn]) : "";
        const imageUrl = spec.imageUrlColumn
          ? safeUrl(row.data[spec.imageUrlColumn])
          : null;
        const href = spec.hrefColumn ? safeUrl(row.data[spec.hrefColumn]) : null;
        const rowHref = `/tables/${encodeURIComponent(spec.table)}?row=${encodeURIComponent(row.id)}`;

        return (
          <article
            key={row.id}
            className="surface-card-muted group h-full overflow-hidden rounded-lg border transition-colors hover:border-primary hover:bg-accent/50 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
          >
            <Link
              href={rowHref}
              className="block h-full rounded-lg focus-visible:outline-none"
              aria-label={`Open ${title} row in table`}
            >
              {imageUrl && (
                <div
                  data-testid="gallery-image-frame"
                  className="flex aspect-[16/9] items-center justify-center overflow-hidden border-b bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              )}
              <div className="space-y-2 p-3">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <h3 className="min-w-0 truncate text-sm font-medium" title={title}>
                    {title}
                  </h3>
                </div>
                {subtitle && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {subtitle}
                  </p>
                )}
                {meta && (
                  <p className="truncate font-mono text-xs text-muted-foreground" title={meta}>
                    {meta}
                  </p>
                )}
                <span className="inline-flex items-center gap-1 font-medium text-primary">
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  Open row
                </span>
              </div>
            </Link>
            {href && (
              <div className="border-t px-3 py-2">
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1 rounded-sm text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <span className="truncate">Open link</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </a>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
