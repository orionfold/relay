import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface PageShellProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  filters?: ReactNode;
  detailPane?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Full-bleed mode skips the surface-page-shell wrapper (for pages with custom layout) */
  fullBleed?: boolean;
  /** When set, renders a ghost back-button above the title row */
  backHref?: string;
  /** Label for the back button (defaults to "Back") */
  backLabel?: string;
  /** Optional max-width constraint on the inner surface div (e.g. "max-w-5xl") */
  maxWidth?: string;
}

/**
 * PageShell — consistent page anatomy for all routes.
 *
 * Layout:
 *   ┌──────────────────────────────────┬─────────────┐
 *   │  Title + Actions                 │             │
 *   │  Filters                         │  DetailPane │
 *   │  Content (children)              │  (420px)    │
 *   └──────────────────────────────────┴─────────────┘
 *
 * When `detailPane` is provided, content area uses CSS grid with a 420px right rail.
 * On mobile (<1024px), the detail pane should be rendered as a Sheet overlay
 * by the parent — PageShell only handles the desktop grid layout.
 */
export function PageShell({
  title,
  description,
  actions,
  filters,
  detailPane,
  children,
  className,
  fullBleed = false,
  backHref,
  backLabel = "Back",
  maxWidth,
}: PageShellProps) {
  const content = (
    <>
      {/* Back navigation */}
      {backHref && (
        <Link href={backHref}>
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-1" />
            {backLabel}
          </Button>
        </Link>
      )}

      {/* Title row */}
      {title && (
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {description && (
              <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-2 mt-2 sm:mt-0">{actions}</div>
          )}
        </div>
      )}

      {/* Filter row */}
      {filters && <div className="mt-4">{filters}</div>}

      {/* Content + optional detail pane */}
      {detailPane ? (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_420px]">
          <div className="min-w-0">{children}</div>
          <aside className="hidden lg:block">
            <div className="sticky top-6">{detailPane}</div>
          </aside>
        </div>
      ) : (
        <div className="mt-6">{children}</div>
      )}
    </>
  );

  if (fullBleed) {
    return (
      <div className={cn("bg-background min-h-screen p-4 sm:p-6", className)}>
        {content}
      </div>
    );
  }

  return (
    <div className={cn("bg-background min-h-screen", className)}>
      <div className={cn("surface-page-shell min-h-screen p-5 sm:p-6 lg:p-7", maxWidth, maxWidth && "mx-auto")}>
        {content}
      </div>
    </div>
  );
}
