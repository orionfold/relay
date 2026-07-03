"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface PackUpdateButtonProps {
  packId: string;
  packName: string;
  newVersion: string;
}

interface UpdateReport {
  previousVersion: string | null;
  newVersion: string;
  backedUp: string[];
}

export function PackUpdateButton({
  packId,
  packName,
  newVersion,
}: PackUpdateButtonProps) {
  const router = useRouter();
  const [updating, setUpdating] = useState(false);
  const [licenseNeeded, setLicenseNeeded] = useState(false);

  const update = async () => {
    if (updating) return; // double-click guard
    setUpdating(true);
    setLicenseNeeded(false);
    try {
      const res = await fetch("/api/packs/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: packId }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body) {
        const report = body as UpdateReport;
        toast.success(`Updated ${packName} to v${report.newVersion}`, {
          description:
            report.backedUp.length > 0
              ? `${report.backedUp.length} user-edited file(s) backed up before overwrite.`
              : undefined,
        });
        router.refresh();
        return;
      }
      if (res.status === 402) {
        // Renewal soft gate (D4) — the installed pack keeps working.
        setLicenseNeeded(true);
        return;
      }
      toast.error(`Could not update ${packName}`, {
        description:
          (body as { error?: string } | null)?.error ??
          `Update failed (HTTP ${res.status}).`,
      });
    } catch (err) {
      toast.error(`Could not update ${packName}`, {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Button
        size="sm"
        variant="outline"
        onClick={update}
        disabled={updating}
        aria-label={`Update ${packName} to v${newVersion}`}
      >
        {updating ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        )}
        {updating ? "Updating…" : `Update to v${newVersion}`}
      </Button>
      {licenseNeeded && (
        <p className="text-xs text-muted-foreground">
          Your installed pack keeps working. Updating needs an active license.{" "}
          <Link
            href="/settings#license"
            className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
          >
            activate one in Settings → License
          </Link>
          .
        </p>
      )}
    </div>
  );
}
