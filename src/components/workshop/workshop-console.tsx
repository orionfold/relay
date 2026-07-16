"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Play,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StatusChip } from "@/components/shared/status-chip";
import type { WorkshopPreflight } from "@/lib/workshop/preflight";
import type { WorkshopRunView } from "@/lib/workshop/runs";

export function WorkshopConsole({
  initialPreflight,
  initialRun,
}: {
  initialPreflight: WorkshopPreflight;
  initialRun: WorkshopRunView | null;
}) {
  const [preflight, setPreflight] = useState(initialPreflight);
  const [run, setRun] = useState(initialRun);
  const [busy, setBusy] = useState<string | null>(null);

  async function refreshPreflight() {
    setBusy("preflight");
    try {
      const response = await fetch("/api/workshop/preflight", {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Preflight failed");
      setPreflight(body);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Preflight failed");
    } finally {
      setBusy(null);
    }
  }

  async function start() {
    setBusy("start");
    try {
      const response = await fetch("/api/workshop/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editionId: "relay-operator-workshop",
          confirmInstall: true,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Starter install failed");
      setRun(body);
      toast.success("Workshop starter installed");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Starter install failed"
      );
    } finally {
      setBusy(null);
    }
  }

  async function refreshRun() {
    if (!run) return;
    setBusy("refresh");
    try {
      const response = await fetch(`/api/workshop/${run.id}`, {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Progress check failed");
      setRun(body);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Progress check failed"
      );
    } finally {
      setBusy(null);
    }
  }

  async function fallback() {
    if (!run) return;
    setBusy("fallback");
    try {
      const response = await fetch(`/api/workshop/${run.id}/fallback`, {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Deterministic rehearsal failed");
      }
      setRun(body);
      toast.success("Deterministic rehearsal completed — no model call was made");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Deterministic rehearsal failed"
      );
    } finally {
      setBusy(null);
    }
  }

  function download() {
    if (!run) return;
    window.location.href = `/api/workshop/${run.id}/export`;
    window.setTimeout(() => void refreshRun(), 1200);
  }

  return (
    <div className="space-y-6">
      <section className="surface-card rounded-xl border p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Preflight</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Read-only checks. No provider call, workspace scan or starter
              installation occurs here.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => void refreshPreflight()}
          >
            <RefreshCw className="h-4 w-4" />
            Check again
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <PreflightFact
            label="Relay version"
            value={`${preflight.relay.version} · ${preflight.relay.compatible ? "compatible" : "incompatible"}`}
            ok={preflight.relay.compatible}
          />
          <PreflightFact
            label="Data directory"
            value={`${preflight.dataDirectory.pathLabel} · ${preflight.dataDirectory.writable ? "writable" : "unavailable"}`}
            ok={preflight.dataDirectory.writable}
          />
          <PreflightFact
            label="Fixture"
            value={`${preflight.fixture.family} · ${preflight.fixture.intact ? "verified" : "mismatch"}`}
            ok={preflight.fixture.intact}
          />
          <PreflightFact
            label="Run options"
            value={`${preflight.runtime.configured.length} configured · deterministic fallback available`}
            ok
          />
        </div>

        {preflight.failures.length > 0 && (
          <div className="mt-4 space-y-2">
            {preflight.failures.map((failure) => (
              <div
                key={failure.code}
                className="surface-card-muted flex gap-2 rounded-md border p-3 text-sm"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" />
                <div>
                  <p className="font-medium">{failure.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {failure.recovery}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {!run && (
          <div className="mt-4 flex justify-end">
            <Button
              disabled={!preflight.ready || busy !== null}
              onClick={() => void start()}
            >
              <Play className="h-4 w-4" />
              Install isolated starter
            </Button>
          </div>
        )}
      </section>

      {run && (
        <section className="surface-card rounded-xl border p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Capstone progress</h2>
                <StatusChip status={run.status} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {run.completedCount}/{run.requiredCount} checkpoints complete ·
                edition {run.editionVersion}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => void refreshRun()}
            >
              <RefreshCw className="h-4 w-4" />
              Check progress
            </Button>
          </div>
          <Progress
            value={(run.completedCount / run.requiredCount) * 100}
            className="mt-4 h-2"
          />

          <div className="mt-4 divide-y rounded-lg border">
            {run.checkpoints.map((checkpoint) => (
              <div
                key={checkpoint.id}
                className="flex flex-wrap items-start gap-3 p-4"
              >
                {checkpoint.status === "passed" ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-status-completed" />
                ) : (
                  <AlertTriangle
                    className={`mt-0.5 h-5 w-5 shrink-0 ${
                      checkpoint.status === "failed"
                        ? "text-status-failed"
                        : "text-status-warning"
                    }`}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{checkpoint.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {checkpoint.detail}
                  </p>
                  {checkpoint.recovery && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Rescue: {checkpoint.recovery}
                    </p>
                  )}
                </div>
                <Link
                  href={checkpoint.sourceRoute}
                  className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
                >
                  Open source
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {!run.receiptId && (
              <Button
                variant="outline"
                disabled={busy !== null}
                onClick={() => void fallback()}
              >
                <Play className="h-4 w-4" />
                Run deterministic rehearsal
              </Button>
            )}
            <Button
              disabled={!run.receiptId || busy !== null}
              onClick={download}
            >
              <Download className="h-4 w-4" />
              Download completion bundle
            </Button>
          </div>
          {run.fallbackUsed && (
            <p className="mt-3 text-right text-xs text-muted-foreground">
              Evidence explicitly records that no model/provider call occurred.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function PreflightFact({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="surface-card-muted rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-start gap-1.5 text-sm font-medium">
        {ok ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-completed" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-failed" />
        )}
        <span>{value}</span>
      </p>
    </div>
  );
}
