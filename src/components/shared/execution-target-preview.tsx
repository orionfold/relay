"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Cpu, FolderLock, ShieldCheck } from "lucide-react";
import type { ExecutionTargetPreviewResponse } from "@/lib/agents/runtime/execution-target-contract";

export function ExecutionTargetPreview({
  kind,
  id,
  enabled = true,
  revision,
  onReadyChange,
}: {
  kind: "task" | "workflow";
  id: string;
  enabled?: boolean;
  revision?: string | number | null;
  onReadyChange?: (ready: boolean | null) => void;
}) {
  const [data, setData] = useState<ExecutionTargetPreviewResponse | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      onReadyChange?.(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    onReadyChange?.(null);
    fetch(`/api/${kind === "task" ? "tasks" : "workflows"}/${id}/target`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as ExecutionTargetPreviewResponse;
        setData(body);
        onReadyChange?.(body.ready);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setData({
          kind,
          ready: false,
          targets: [],
          context: null,
          error: {
            code: "target_resolution_failed",
            message: "Relay could not preview the execution target. Try again before running.",
          },
        });
        onReadyChange?.(false);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [enabled, id, kind, onReadyChange, revision]);

  if (!enabled) return null;

  if (loading) {
    return (
      <section
        className="surface-control rounded-lg px-3 py-2.5 text-sm text-muted-foreground"
        aria-live="polite"
      >
        Resolving execution target…
      </section>
    );
  }

  if (!data?.ready) {
    return (
      <section
        className="rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2.5"
        aria-live="polite"
      >
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" />
          <div className="min-w-0">
            <p className="text-sm font-medium">Execution target needs attention</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {data?.error?.message ?? "Relay could not resolve an execution target."}
            </p>
            <p className="mt-1 text-xs font-medium">Edit the target before running.</p>
            {data?.context && (
              <ExecutionBoundaryContext context={data.context} kind={data.kind} />
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="surface-control rounded-lg px-3 py-2.5" aria-live="polite">
      <div className="mb-2 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-status-completed" />
        <h3 className="text-sm font-medium">Execution target</h3>
      </div>
      <div className="space-y-2">
        {data.targets.map((target) => (
          <div
            key={target.key}
            className="grid gap-1 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-x-4"
          >
            {data.targets.length > 1 && (
              <p className="truncate font-medium sm:col-span-2">{target.label}</p>
            )}
            <span className="text-muted-foreground">Profile</span>
            <span>{target.profileId ?? "Automatic"}</span>
            <span className="text-muted-foreground">Runs on</span>
            <span className="flex min-w-0 items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{target.effectiveRuntimeLabel}</span>
            </span>
            <span className="text-muted-foreground">Model</span>
            <span className="truncate">
              {target.effectiveModelId ?? "Resolved by runtime at launch"}
            </span>
            <p className="text-muted-foreground sm:col-span-2">
              {target.selectionReason}
            </p>
            {target.skippedRuntimes.length > 0 && (
              <details className="sm:col-span-2">
                <summary className="text-xs font-medium text-muted-foreground">
                  {target.skippedRuntimes.length} runtime
                  {target.skippedRuntimes.length === 1 ? "" : "s"} skipped
                </summary>
                <ul className="mt-1 space-y-1 pl-4 text-xs text-muted-foreground">
                  {target.skippedRuntimes.map((skip) => (
                    <li key={`${target.key}-${skip.runtimeId}`}>
                      <span className="font-medium text-foreground">
                        {skip.runtimeId}:
                      </span>{" "}
                      {skip.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
      </div>
      {data.context && (
        <ExecutionBoundaryContext context={data.context} kind={data.kind} />
      )}
    </section>
  );
}

function ExecutionBoundaryContext({
  context,
  kind,
}: {
  context: NonNullable<ExecutionTargetPreviewResponse["context"]>;
  kind: ExecutionTargetPreviewResponse["kind"];
}) {
  const cellLabel = context.cell.instanceId
    ? `${context.cell.instanceId.slice(0, 8)}…`
    : "Current data-root cell";

  return (
    <div className="mt-3 border-t border-border pt-3 text-xs">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-x-4">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          Relay cell
        </span>
        <span className="font-mono" title={context.cell.instanceId ?? undefined}>
          {cellLabel}
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <FolderLock className="h-3.5 w-3.5 shrink-0" />
          Working directory
        </span>
        <span className="break-all font-mono" title={context.workingDirectory}>
          {context.workingDirectory}
          <span className="ml-1 font-sans text-muted-foreground">
            ({context.workingDirectorySource === "project" ? "project" : "Relay launch workspace"})
          </span>
        </span>
      </div>
      <p className="mt-2 leading-relaxed text-muted-foreground">
        Runtime and working directory choose where this {kind === "workflow" ? "workflow" : "task"} executes;
        they do not create a separate customer data or credential boundary.
      </p>
    </div>
  );
}
