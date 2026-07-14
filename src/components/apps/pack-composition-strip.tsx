import Link from "next/link";
import { Bot, ChevronRight, Clock, Table2, Workflow } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { AppManifest } from "@/lib/apps/registry";

interface PackCompositionStripProps {
  manifest: AppManifest;
}

export function PackCompositionStrip({ manifest }: PackCompositionStripProps) {
  const tables = manifest.tables;

  return (
    <section
      aria-labelledby="pack-composition-heading"
      className="surface-panel rounded-lg border p-4"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <h2 id="pack-composition-heading" className="text-sm font-medium">
            Pack composition
          </h2>
          <p className="max-w-3xl text-xs text-muted-foreground">
            This installed pack owns the primitives below. Tables link directly
            to their data views.
          </p>
        </div>
        <PrimitiveCounts manifest={manifest} />
      </div>

      {tables.length > 0 && (
        <details className="group mt-4 rounded-lg border bg-[var(--surface-1)]">
          <summary className="flex list-none items-center justify-between gap-3 px-3 py-2 text-sm font-medium">
            <span className="inline-flex items-center gap-2">
              <Table2 className="h-4 w-4 text-primary" aria-hidden="true" />
              Owned tables ({tables.length})
            </span>
            <ChevronRight
              className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90"
              aria-hidden="true"
            />
          </summary>
          <div className="grid gap-2 border-t p-3 sm:grid-cols-2 lg:grid-cols-3">
            {tables.map((table) => (
              <Link
                key={table.id}
                href={`/tables/${encodeURIComponent(table.id)}`}
                className="surface-card block rounded-lg border p-3 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate font-mono text-xs font-medium">
                    {table.id}
                  </span>
                  <ChevronRight
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                {table.columns && table.columns.length > 0 && (
                  <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                    {table.columns.join(", ")}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function PrimitiveCounts({ manifest }: { manifest: AppManifest }) {
  const counts = [
    { label: "Agents", value: manifest.profiles.length, icon: Bot },
    { label: "Workflows", value: manifest.blueprints.length, icon: Workflow },
    { label: "Tables", value: manifest.tables.length, icon: Table2 },
    { label: "Schedules", value: manifest.schedules.length, icon: Clock },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
      {counts.map(({ label, value, icon: Icon }) => (
        <Card key={label} className="min-w-[7rem]">
          <CardContent className="flex items-center gap-2 p-2.5">
            <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className="text-sm font-semibold tabular-nums">{value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
