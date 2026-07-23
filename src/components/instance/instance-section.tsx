"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { RelayCellBoundary } from "@/lib/instance/cell-boundary";

interface InstanceConfig {
  instanceId: string;
  branchName: string;
  isPrivateInstance: boolean;
  createdAt: number;
}

interface Guardrails {
  prePushHookInstalled: boolean;
  prePushHookVersion: string;
  pushRemoteBlocked: string[];
  consentStatus: "not_yet" | "enabled" | "declined_permanently";
  firstBootCompletedAt: number | null;
}

interface UpgradeState {
  lastPolledAt: number | null;
  upgradeAvailable: boolean;
  commitsBehind: number;
  lastSuccessfulUpgradeAt: number | null;
  pollFailureCount: number;
  lastPollError: string | null;
}

interface ConfigResponse {
  devMode: boolean;
  skippedReason?: "no_git" | string;
  boundary: RelayCellBoundary;
  maintenance?: {
    launchContext: {
      packageVersion: string;
      dataDir: string;
      hostRoot: string | null;
      port: number;
    };
    upgradeCommand: string;
  } | null;
  config: InstanceConfig | null;
  guardrails: Guardrails | null;
  upgrade: UpgradeState | null;
}

/**
 * Settings → Instance section. The active Relay cell facts remain visible in
 * every mode; git-backed bootstrap and upgrade maintenance follows as a
 * separate card when applicable.
 */
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

export function InstanceSection() {
  const router = useRouter();
  const [state, setState] = useState<ConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"check" | "init" | "upgrade" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadConfig() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/instance/config", { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ConfigResponse;
      setState(data);
      return data;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setLoading(false);
    }
  }

  // Silent background refresh — used after auto-check on mount so we don't
  // flicker the whole card back to its loading state.
  async function refreshConfigSilent() {
    try {
      const res = await fetch("/api/instance/config", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as ConfigResponse;
      setState(data);
    } catch {
      // Swallow — this is a best-effort refresh after auto-check.
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await loadConfig();
      if (cancelled || !data || data.devMode || !data.config) return;
      // If the cached upgrade state is older than 5 minutes, silently force
      // a fresh check. This self-heals after manual `git pull` + merge in
      // the terminal, so users don't see a stale "N updates pending" count.
      const lastPolled = data.upgrade?.lastPolledAt ?? 0;
      const ageMs = Date.now() - lastPolled * 1000;
      if (ageMs > STALE_THRESHOLD_MS) {
        try {
          const res = await fetch("/api/instance/upgrade/check", {
            method: "POST",
          });
          if (res.ok && !cancelled) {
            await refreshConfigSilent();
          }
        } catch {
          // Silent — manual "Check for upgrades" button remains as fallback.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function checkNow() {
    setBusy("check");
    setMessage(null);
    try {
      const res = await fetch("/api/instance/upgrade/check", { method: "POST" });
      if (res.status === 202) {
        const body = await res.json();
        setMessage(`Check skipped: ${body.skipped ?? body.error ?? "unknown"}`);
      } else if (res.ok) {
        setMessage("Check complete");
        await loadConfig();
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function startUpgrade() {
    setBusy("upgrade");
    setMessage(null);
    try {
      const res = await fetch("/api/instance/upgrade", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { taskId: string };
      router.push(`/tasks/${data.taskId}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  async function reinit() {
    setBusy("init");
    setMessage(null);
    try {
      const res = await fetch("/api/instance/init", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadConfig();
      setMessage("Instance setup re-run complete");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <section className="rounded-xl border bg-card px-5 py-4">
        <h2 className="text-base font-semibold">Relay cell boundary</h2>
        <p className="mt-1 text-sm text-muted-foreground">Loading…</p>
      </section>
    );
  }

  if (loadError || !state) {
    return (
      <section className="rounded-xl border border-status-warning/40 bg-status-warning/10 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Relay cell boundary</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Relay could not load the active cell facts: {loadError ?? "unknown error"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadConfig}>
            Retry
          </Button>
        </div>
      </section>
    );
  }

  // Dev mode: main dev repo. Instance bootstrap is gated off without hiding
  // the real process/data-root boundary.
  if (state?.devMode) {
    return (
      <InstanceLayout boundary={state.boundary}>
        <section className="rounded-xl border bg-card px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold">Instance maintenance</h2>
            <Badge variant="outline" className="text-xs font-normal">
              Dev mode
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Running on the main dev repo. Instance upgrade features are disabled.
            Set{" "}
            <code className="font-mono text-[11px] px-1 py-0.5 rounded bg-muted">
              RELAY_INSTANCE_MODE=true
            </code>{" "}
            to test.
          </p>
        </section>
      </InstanceLayout>
    );
  }

  // npx install: no git repo, so upgrade machinery doesn't apply.
  // Users upgrade via `npx orionfold-relay@latest`, not via git merge.
  if (state?.skippedReason === "no_git") {
    const maintenance = state.maintenance ?? null;
    const copyUpgradeCommand = async () => {
      if (!maintenance?.upgradeCommand) return;
      try {
        await navigator.clipboard.writeText(maintenance.upgradeCommand);
        setMessage("Restart command copied.");
      } catch {
        setMessage(
          "Could not copy the restart command. Select the command and copy it manually.",
        );
      }
    };
    return (
      <InstanceLayout boundary={state.boundary}>
        <section className="rounded-xl border bg-card px-5 py-4 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-base font-semibold">Update this Relay</h2>
              <Badge variant="outline" className="text-xs font-normal">
                npm install
              </Badge>
            </div>
            {maintenance && (
              <Button
                variant="outline"
                size="sm"
                onClick={copyUpgradeCommand}
              >
                Copy restart command
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-prose">
            Updating replaces Relay&apos;s application files, not the data stored
            at{" "}
            <code className="font-mono text-[11px] px-1 py-0.5 rounded bg-muted">
              {state.boundary.dataDirectory}
            </code>
            . After restarting, confirm the version badge and data directory
            shown on this page.
          </p>
          {maintenance ? (
            <>
              <pre className="overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed">
                <code>{maintenance.upgradeCommand}</code>
              </pre>
              <p className="text-xs text-muted-foreground">
                This command preserves port {maintenance.launchContext.port}
                {maintenance.launchContext.hostRoot
                  ? ` and Host state at ${maintenance.launchContext.hostRoot}`
                  : ""}
                .
              </p>
            </>
          ) : (
            <div className="rounded-md border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs">
              Relay could not reconstruct the command used to start this
              instance. Reuse your original command and keep the same data
              directory shown above.
            </div>
          )}
          {message && (
            <div className="text-xs text-muted-foreground">{message}</div>
          )}
        </section>
      </InstanceLayout>
    );
  }

  const config = state?.config ?? null;
  const guardrails = state?.guardrails ?? null;
  const upgrade = state?.upgrade ?? null;
  const hasConfig = config !== null;

  // Not-initialized state
  if (!hasConfig) {
    return (
      <InstanceLayout boundary={state.boundary}>
        <section className="rounded-xl border bg-card px-5 py-4 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-base font-semibold">Instance maintenance</h2>
            <Button
              variant="default"
              size="sm"
              onClick={reinit}
              disabled={busy !== null}
            >
              {busy === "init" ? "Running…" : "Run setup"}
            </Button>
          </div>
          <div className="rounded-md border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs">
            Instance setup incomplete. Run setup to initialize this workspace.
          </div>
          {message && (
            <div className="text-xs text-muted-foreground">{message}</div>
          )}
        </section>
      </InstanceLayout>
    );
  }

  const shortId = config!.instanceId.slice(0, 8) + "…";
  const consentLabel = guardrails?.consentStatus ?? "unknown";
  const hookLabel = guardrails?.prePushHookInstalled
    ? `v${guardrails.prePushHookVersion}`
    : "not installed";
  const blockedLabel = guardrails?.pushRemoteBlocked.length
    ? guardrails.pushRemoteBlocked.join(", ")
    : "none";
  const lastCheck = upgrade?.lastPolledAt
    ? new Date(upgrade.lastPolledAt * 1000).toLocaleString()
    : "never";
  const lastUpgrade = upgrade?.lastSuccessfulUpgradeAt
    ? new Date(upgrade.lastSuccessfulUpgradeAt * 1000).toLocaleString()
    : "never";
  const pollFailing = (upgrade?.pollFailureCount ?? 0) > 0;

  const upgradeAvailable = upgrade?.upgradeAvailable ?? false;
  const upgradeCount = upgrade?.commitsBehind ?? 0;
  const startUpgradeDisabled = busy !== null || !upgradeAvailable;
  const startUpgradeTitle = upgradeAvailable
    ? `Merge ${upgradeCount} upstream commit${upgradeCount === 1 ? "" : "s"} into ${config!.branchName}`
    : "No upgrades available. Click 'Check for upgrades' to refresh";
  const statusMessage = pollFailing && upgrade?.lastPollError
    ? upgrade.lastPollError
    : message;
  const statusToneClass = pollFailing
    ? "text-amber-700 dark:text-amber-400"
    : "text-muted-foreground";

  return (
    <InstanceLayout boundary={state.boundary}>
      <section className="rounded-xl border bg-card">
      <header className="flex items-start justify-between gap-4 px-5 py-3 border-b flex-wrap">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-3 min-w-0 flex-wrap">
            <h2 className="text-base font-semibold">Instance maintenance</h2>
            {upgradeAvailable && (
              <Badge
                variant="outline"
                className="text-xs font-normal border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400"
              >
                {upgradeCount} update{upgradeCount === 1 ? "" : "s"} available
              </Badge>
            )}
            {pollFailing && (
              <Badge variant="destructive" className="text-xs font-normal">
                Poll failing ({upgrade?.pollFailureCount})
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-prose">
            Pull latest changes from{" "}
            <code className="font-mono text-[11px] px-1 py-0.5 rounded bg-muted">
              main
            </code>{" "}
            into{" "}
            <code className="font-mono text-[11px] px-1 py-0.5 rounded bg-muted">
              {config!.branchName}
            </code>
            . Nothing is pushed automatically.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={checkNow}
            disabled={busy !== null}
          >
            {busy === "check" ? "Checking…" : "Check"}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={startUpgrade}
            disabled={startUpgradeDisabled}
            title={startUpgradeTitle}
          >
            {busy === "upgrade"
              ? "Starting…"
              : upgradeAvailable
                ? `Upgrade (${upgradeCount})`
                : "Upgrade"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={reinit}
            disabled={busy !== null}
          >
            {busy === "init" ? "Running…" : "Repair setup"}
          </Button>
        </div>
      </header>

      <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 px-5 py-3 text-sm">
        <Field label="Branch" mono>
          {config!.branchName}
        </Field>
        <Field
          label="Instance ID"
          mono
          title={config!.instanceId}
        >
          {shortId}
        </Field>
        <Field label="Last check">{lastCheck}</Field>
        <Field label="Last upgrade">{lastUpgrade}</Field>
      </dl>

      <div className="flex items-start justify-between gap-3 border-t px-5 py-2.5 text-[11px]">
        <p className={`leading-relaxed ${statusToneClass}`}>
          {statusMessage ?? (
            upgradeAvailable
              ? `Ready to merge ${upgradeCount} upstream update${upgradeCount === 1 ? "" : "s"}.`
              : `Up to date. Last checked: ${lastCheck}.`
          )}
        </p>
        <p className="shrink-0 text-muted-foreground">
          Repairs local setup without changing data or commits.
        </p>
      </div>
      </section>
    </InstanceLayout>
  );
}

function InstanceLayout({
  boundary,
  children,
}: {
  boundary: RelayCellBoundary;
  children: ReactNode;
}) {
  const cellId = boundary.instanceId
    ? `${boundary.instanceId.slice(0, 8)}…`
    : "Not initialized";

  return (
    <div className="space-y-3">
      <section
        className="rounded-xl border bg-card"
        aria-labelledby="relay-cell-boundary-heading"
      >
        <header className="border-b px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="relay-cell-boundary-heading" className="text-base font-semibold">
              Relay cell boundary
            </h2>
            <Badge variant="outline" className="text-xs font-normal">
              Host administrator trusted
            </Badge>
          </div>
          <p className="mt-1 max-w-4xl text-xs leading-relaxed text-muted-foreground">
            This Relay process and data directory form one Relay cell. Customer
            and project records organize work inside this cell; they do not
            isolate data, files, credentials, agents, or runtimes. The Relay Host
            administrator can access every cell on this Host. Use a separate cell
            for client isolation, or a separate VM or machine when the Host
            administrator must not have access.
          </p>
        </header>
        <dl className="grid gap-x-6 gap-y-3 px-5 py-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Cell ID" mono title={boundary.instanceId ?? undefined}>
            {cellId}
          </Field>
          <Field label="Data directory" mono truncate title={boundary.dataDirectory}>
            {boundary.dataDirectory}
          </Field>
          <Field label="Database" mono truncate title={boundary.databasePath}>
            {boundary.databasePath}
          </Field>
          <Field
            label="Launch workspace"
            mono
            truncate
            title={boundary.launchWorkingDirectory}
          >
            {boundary.launchWorkingDirectory}
          </Field>
        </dl>
        <p className="border-t px-5 py-2 text-[11px] text-muted-foreground">
          Data directory source: {boundary.dataDirectorySource === "override" ? "explicit RELAY_DATA_DIR" : "default local Relay data"}.
        </p>
      </section>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  mono,
  truncate,
  title,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
  truncate?: boolean;
  title?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        title={title}
        className={
          "mt-0.5 " +
          (mono ? "font-mono text-xs " : "") +
          (truncate ? "truncate" : "")
        }
      >
        {children}
      </dd>
    </div>
  );
}
