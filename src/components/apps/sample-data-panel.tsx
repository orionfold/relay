"use client";

import { useState } from "react";
import { FlaskConical, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  RemoveSampleDataResult,
  SampleDataSummary,
} from "@/lib/packs/sample-data";

export function SampleDataPanel({
  initialSummary,
}: {
  initialSummary: SampleDataSummary;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const sampleTotal =
    summary.untouchedRows +
    summary.editedRows +
    summary.untouchedCustomers +
    summary.editedCustomers;
  const untouchedTotal =
    summary.untouchedRows + summary.untouchedCustomers;

  if (sampleTotal === 0) return null;

  async function removeSamples() {
    setRemoving(true);
    try {
      const response = await fetch(
        `/api/apps/${encodeURIComponent(summary.appId)}/sample-data`,
        { method: "DELETE" }
      );
      const body = (await response.json()) as
        | RemoveSampleDataResult
        | { error?: string };
      if (!response.ok || !("removedRows" in body)) {
        throw new Error(
          "error" in body && body.error
            ? body.error
            : "Sample removal failed."
        );
      }
      setSummary(body);
      setConfirming(false);
      toast.success(
        `Removed ${body.removedRows} untouched sample rows. Your own and edited data was kept.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Sample removal failed."
      );
    } finally {
      setRemoving(false);
    }
  }

  return (
    <section
      aria-labelledby="sample-data-heading"
      className="surface-card rounded-lg border p-4"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <FlaskConical className="h-4 w-4 text-muted-foreground" aria-hidden />
            <h2 id="sample-data-heading" className="text-sm font-semibold">
              Explore with sample data
            </h2>
            <Badge variant="outline">Synthetic</Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            These fictional clients and current-month engagements make the
            workflows and dashboard useful immediately. They are not your
            customer records.
          </p>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {summary.tableCounts
              .filter((table) => table.untouched + table.edited > 0)
              .map((table) => (
                <span key={table.tableId}>
                  {table.tableName}: {table.untouched + table.edited} sample
                </span>
              ))}
            {summary.editedRows + summary.editedCustomers > 0 && (
              <span>
                · {summary.editedRows + summary.editedCustomers} edited sample
                {summary.editedRows + summary.editedCustomers === 1 ? "" : "s"} protected
              </span>
            )}
          </div>
        </div>

        {untouchedTotal === 0 ? (
          <Badge variant="success">Untouched samples removed</Badge>
        ) : !confirming ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirming(true)}
          >
            Use my own data
          </Button>
        ) : (
          <div className="surface-card-muted max-w-sm rounded-md border p-3 text-sm">
            <p className="font-medium">Remove untouched samples?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Relay will remove {summary.untouchedRows} untouched rows and{" "}
              {summary.untouchedCustomers} unreferenced sample customers.
              Edited samples and everything you created stay in place.
            </p>
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={removing}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
              <Button size="sm" disabled={removing} onClick={removeSamples}>
                {removing ? "Removing…" : "Remove untouched samples"}
              </Button>
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        This action is repeatable and never removes edited or customer-created
        records.
      </div>
    </section>
  );
}
