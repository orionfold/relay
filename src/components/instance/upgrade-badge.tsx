"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { UpgradeState } from "@/lib/instance/types";

interface InstanceConfig {
  instanceId: string;
  branchName: string;
  isPrivateInstance: boolean;
  createdAt: number;
}

interface ConfigResponse {
  devMode?: boolean;
  config: InstanceConfig | null;
  upgrade: UpgradeState | null;
}

type StatusResponse = UpgradeState & { devMode?: boolean };

/**
 * Sidebar upgrade badge + pre-flight modal combined into a single Client
 * Component. Fetches status on mount and every 5 minutes; renders nothing
 * when no upgrade is available. When clicked, opens the pre-flight modal
 * and loads the full config for the fact panel.
 *
 * Combined into one component because Next.js 16's stricter client/server
 * boundary rules reject passing callback props between separately-imported
 * client components unless they're Server Actions. Bundling the two here
 * preserves the spec's separation of concerns at the design level while
 * satisfying the framework.
 */
export function UpgradeBadge() {
  const router = useRouter();
  const [state, setState] = useState<StatusResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await fetch("/api/instance/upgrade/status", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as StatusResponse;
        if (!cancelled) setState(data);
      } catch {
        // Silent — the badge is ambient; status fetch failures should not
        // produce UI noise. Persistent poll failures surface as a warning
        // variant via state.pollFailureCount >= 3.
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 5 * 60 * 1000);
    // Refetch when the tab regains focus — picks up DB changes made by the
    // hourly poller or by a manual "Check for upgrades" click while the user
    // was running git commands in the terminal.
    window.addEventListener("focus", fetchStatus);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", fetchStatus);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch("/api/instance/config", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ConfigResponse;
        if (!cancelled) setConfig(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function startUpgrade() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/instance/upgrade", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { taskId: string };
      setOpen(false);
      router.push(`/tasks/${data.taskId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  }

  if (!state || state.devMode || !state.upgradeAvailable) return null;

  const failing = state.pollFailureCount >= 3;
  const count = state.commitsBehind;
  const label = failing
    ? "Check failing"
    : `${count} update${count === 1 ? "" : "s"}`;
  const tooltip = failing
    ? "Upgrade check failing. Click to retry"
    : `${count} upstream update${count === 1 ? "" : "s"} ready to merge`;
  const buttonClass = failing
    ? "h-7 px-2 rounded-md border border-amber-500/40 bg-amber-500/10 text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-colors inline-flex items-center gap-1.5 group-data-[collapsible=icon]:hidden"
    : "h-7 px-2 rounded-md border border-blue-500/40 bg-blue-500/10 text-[11px] font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-500/20 transition-colors inline-flex items-center gap-1.5 group-data-[collapsible=icon]:hidden";

  const modalUpgrade = config?.upgrade ?? null;
  const modalCount = modalUpgrade?.commitsBehind ?? count;
  const lastUpgradeText = modalUpgrade?.lastSuccessfulUpgradeAt
    ? new Date(modalUpgrade.lastSuccessfulUpgradeAt * 1000).toLocaleString()
    : "never";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={tooltip}
          title={tooltip}
          className={buttonClass}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }}
        >
          <ArrowUpCircle className="h-3 w-3" aria-hidden />
          <span>{label}</span>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upgrade available</DialogTitle>
          <DialogDescription>
            {modalCount} commit{modalCount === 1 ? "" : "s"} ready to merge into{" "}
            <code className="font-mono text-xs">
              {config?.config?.branchName ?? "…"}
            </code>
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-4 text-sm text-muted-foreground">Loading instance state…</div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {config && !loading && (
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <span className="text-muted-foreground">Branch</span>
              <code className="font-mono text-xs">{config.config?.branchName ?? "—"}</code>
              <span className="text-muted-foreground">Data directory</span>
              <code className="font-mono text-xs break-all">
                {config.config?.isPrivateInstance ? "custom" : "default"}
              </code>
              <span className="text-muted-foreground">Commits behind</span>
              <span>{modalCount}</span>
              <span className="text-muted-foreground">Last successful upgrade</span>
              <span>{lastUpgradeText}</span>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              Orionfold Relay will stash any uncommitted work, merge <code className="font-mono">main</code> into{" "}
              <code className="font-mono">{config.config?.branchName ?? "your branch"}</code>, install any new
              dependencies, and ask you to resolve conflicts if any appear.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={starting}>
            Cancel
          </Button>
          <Button onClick={startUpgrade} disabled={loading || starting || !config?.config}>
            {starting ? "Starting…" : "Start upgrade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
