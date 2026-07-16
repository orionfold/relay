import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardModuleDefinition } from "@/lib/dashboard/modules";
import { cn } from "@/lib/utils";

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
      className={cn(
        "surface-card h-full min-w-0",
        definition.span === "wide" ? "lg:col-span-3" : "lg:col-span-2"
      )}
    >
      <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {definition.title}
        </CardTitle>
        <Link
          href={definition.sourceRoute}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Open
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
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
