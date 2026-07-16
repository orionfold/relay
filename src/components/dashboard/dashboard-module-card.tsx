import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardModuleDefinition } from "@/lib/dashboard/modules";

export function DashboardModuleCard({
  definition,
  children,
  error,
}: {
  definition: DashboardModuleDefinition;
  children: ReactNode;
  error?: string | null;
}) {
  return (
    <Card
      data-dashboard-module={definition.id}
      className="surface-card h-full min-w-0 gap-0 py-0"
    >
      <CardHeader className="flex min-w-0 flex-row items-center justify-between gap-3 px-4 pb-2 pt-4">
        <CardTitle className="min-w-0 truncate text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {definition.title}
        </CardTitle>
        {definition.sourceRoute && definition.sourceLabel && (
          <Link
            href={definition.sourceRoute}
            aria-label={`Open ${definition.sourceLabel}`}
            className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Open {definition.sourceLabel}
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {error ? (
          <div
            role="status"
            className="surface-card-muted flex items-start gap-2 rounded-md border p-3 text-sm"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" />
            <div>
              <p className="font-medium">Module unavailable</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
