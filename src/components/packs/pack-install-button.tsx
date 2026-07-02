"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface PackInstallButtonProps {
  packId: string;
  packName: string;
  premium: boolean;
}

interface InstallReport {
  tablesCreated: number;
  customersSeeded: number;
  profilesDropped: number;
  blueprintsDropped: number;
}

function reportSummary(r: InstallReport): string {
  const parts = [
    r.tablesCreated > 0 && `${r.tablesCreated} table(s)`,
    r.customersSeeded > 0 && `${r.customersSeeded} customer(s)`,
    r.profilesDropped > 0 && `${r.profilesDropped} profile(s)`,
    r.blueprintsDropped > 0 && `${r.blueprintsDropped} blueprint(s)`,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "installed";
}

export function PackInstallButton({
  packId,
  packName,
  premium,
}: PackInstallButtonProps) {
  const router = useRouter();
  const [installing, setInstalling] = useState(false);
  const [licenseNeeded, setLicenseNeeded] = useState(false);

  const install = async () => {
    if (installing) return; // double-click guard
    setInstalling(true);
    setLicenseNeeded(false);
    try {
      const res = await fetch("/api/packs/install", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: packId }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body) {
        toast.success(`Installed ${packName}`, {
          description: reportSummary(body as InstallReport),
        });
        router.refresh();
        return;
      }
      if (res.status === 402) {
        // Soft gate → the activation path, not a dead end.
        setLicenseNeeded(true);
        return;
      }
      toast.error(`Could not install ${packName}`, {
        description:
          (body as { error?: string } | null)?.error ??
          `Install failed (HTTP ${res.status}).`,
      });
    } catch (err) {
      toast.error(`Could not install ${packName}`, {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Button
        size="sm"
        variant={premium ? "outline" : "default"}
        onClick={install}
        disabled={installing}
        aria-label={`Install ${packName}`}
      >
        {installing ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4" aria-hidden="true" />
        )}
        {installing ? "Installing…" : premium ? "Install with license" : "Install"}
      </Button>
      {licenseNeeded && (
        <p className="text-xs text-muted-foreground">
          No license found for this pack.{" "}
          <Link
            href="/settings#license"
            className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
          >
            Activate one in Settings → License
          </Link>
        </p>
      )}
    </div>
  );
}
