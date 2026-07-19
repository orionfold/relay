"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { buildPackRemovalDescription } from "./pack-removal-copy";

interface AppDetailActionsProps {
  appId: string;
  appName: string;
  tableCount: number;
  profileCount: number;
  blueprintCount: number;
  scheduleCount: number;
  fileCount: number;
}

export function AppDetailActions({
  appId,
  appName,
  tableCount,
  profileCount,
  blueprintCount,
  scheduleCount,
  fileCount,
}: AppDetailActionsProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const description = buildPackRemovalDescription({
    appName,
    tableCount,
    profileCount,
    blueprintCount,
    scheduleCount,
    fileCount,
  });

  // The AlertDialog blocks pointer events while open, and `onOpenChange` is
  // gated by `!pending` — so a second click cannot fire while the delete is
  // in flight. `useTransition` gives us the pending signal but does NOT
  // serialize on its own.
  function handleConfirm() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/apps/${encodeURIComponent(appId)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        toast.success(`Removed ${appName}; retained business data is unchanged.`);
        setConfirmOpen(false);
        router.push("/apps");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Delete failed");
      }
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
        Remove pack
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => !pending && setConfirmOpen(open)}
        title={`Remove ${appName}?`}
        description={description}
        confirmLabel={pending ? "Removing…" : "Remove pack"}
        destructive
        onConfirm={handleConfirm}
      />
    </>
  );
}
