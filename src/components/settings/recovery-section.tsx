"use client";

import { useCallback, useEffect, useState } from "react";
import { ArchiveRestore, CheckCircle2, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Receipt = {
  operationId: string;
  operation: "create" | "verify" | "drill" | "restore";
  status: "ready" | "verified" | "restored" | "failed";
  reasonCode: string;
  bundleFile: string;
  completedAt: string;
  durationMs: number;
  dbIntegrity: "ok" | "not-checked";
  authIntegrity: "ok" | "absent" | "not-checked";
  secretRootPresent: boolean | null;
};

type RecoveryStatus = {
  destinationConfigured: boolean;
  keyConfigured: boolean;
  destinationSource: "environment" | "none";
  keySource: "environment" | "none";
  latest: Receipt | null;
  receipts: Receipt[];
};

export function RecoverySection() {
  const [status, setStatus] = useState<RecoveryStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<"create" | "verify" | "drill" | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/recovery", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || body.error || "Recovery status failed");
      setStatus(body);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Recovery status failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function run(next: "create" | "verify" | "drill") {
    const bundleFile = status?.receipts.find((receipt) => receipt.status !== "failed" && receipt.bundleFile.endsWith(".relay-recovery"))?.bundleFile;
    if (next !== "create" && !bundleFile) return;
    setAction(next);
    try {
      const response = await fetch(next === "create" ? "/api/recovery" : `/api/recovery/${next}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: next === "create" ? undefined : JSON.stringify({ bundleFile }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || body.error || "Recovery operation failed");
      toast.success(next === "create" ? "Encrypted recovery bundle is ready" : next === "drill" ? "Isolated restore drill passed" : "Recovery bundle verified");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Recovery operation failed");
    } finally {
      setAction(null);
    }
  }

  const configured = Boolean(status?.destinationConfigured && status?.keyConfigured);
  const latestPassed = status?.latest && status.latest.status !== "failed";
  const latestBundle = status?.receipts.find((receipt) => receipt.status !== "failed" && receipt.bundleFile.endsWith(".relay-recovery"))?.bundleFile;

  return (
    <Card className="surface-card" id="settings-recovery">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2"><ArchiveRestore className="h-5 w-5" />Encrypted recovery</CardTitle>
            <CardDescription>Portable, customer-owned Cell recovery without an Orionfold-held key.</CardDescription>
          </div>
          <Badge variant={configured ? "secondary" : "outline"}>{configured ? "Configured" : "Setup required"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Checking recovery configuration…</div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="surface-card-muted rounded-lg border p-3">
                <p className="flex items-center gap-2 text-sm font-medium"><KeyRound className="h-4 w-4" />Customer recovery key</p>
                <p className="mt-1 text-xs text-muted-foreground">{status?.keyConfigured ? `Present via ${status.keySource}` : "Not configured"}. Key bytes and file paths are never returned to this page.</p>
              </div>
              <div className="surface-card-muted rounded-lg border p-3">
                <p className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4" />Separate destination</p>
                <p className="mt-1 text-xs text-muted-foreground">{status?.destinationConfigured ? `Present via ${status.destinationSource}` : "Not configured"}. Store the bundle and key in different locations.</p>
              </div>
            </div>

            {!configured && (
              <div className="rounded-lg border border-status-warning/40 bg-status-warning/8 p-3 text-sm">
                Create a key with <code className="font-mono text-xs">relay recovery key create --out …</code>, then set <code className="font-mono text-xs">RELAY_RECOVERY_KEY_FILE</code> and <code className="font-mono text-xs">RELAY_RECOVERY_DESTINATION</code> on the server.
              </div>
            )}

            {status?.latest && (
              <div className="surface-card-muted rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-medium">{latestPassed && <CheckCircle2 className="h-4 w-4 text-status-completed" />}Latest: {status.latest.status}</p>
                  <span className="text-xs text-muted-foreground">{new Date(status.latest.completedAt).toLocaleString()}</span>
                </div>
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{status.latest.bundleFile}</p>
                <p className="mt-1 text-xs text-muted-foreground">{status.latest.reasonCode} · DB {status.latest.dbIntegrity} · access {status.latest.authIntegrity} · {status.latest.durationMs}ms observed</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void run("create")} disabled={!configured || action !== null}>{action === "create" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create encrypted bundle</Button>
              <Button variant="outline" onClick={() => void run("verify")} disabled={!configured || !latestBundle || action !== null}>{action === "verify" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Verify latest</Button>
              <Button variant="outline" onClick={() => void run("drill")} disabled={!configured || !latestBundle || action !== null}>{action === "drill" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Run restore drill</Button>
            </div>
            <p className="text-xs text-muted-foreground">Restore is intentionally offline and accepts only a missing or empty data root. Relay cannot recover a lost customer key and makes no RPO/RTO promise from a local-directory destination.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
