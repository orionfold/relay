"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { buildPackRemovalDescription } from "./pack-removal-copy";

interface AppCardDeleteButtonProps {
  appId: string;
  appName: string;
  tableCount: number;
  profileCount: number;
  blueprintCount: number;
  scheduleCount: number;
  fileCount: number;
}

export function AppCardDeleteButton({
  appId,
  appName,
  tableCount,
  profileCount,
  blueprintCount,
  scheduleCount,
  fileCount,
}: AppCardDeleteButtonProps) {
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
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Delete failed");
      }
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-destructive"
        aria-label={`Remove ${appName}`}
        onClick={(e) => {
          // Defensive: although the button is rendered as a sibling of the
          // Link (not inside it), stopPropagation guards against future DOM
          // restructuring that might place it inside an interactive ancestor.
          e.preventDefault();
          e.stopPropagation();
          setConfirmOpen(true);
        }}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
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
