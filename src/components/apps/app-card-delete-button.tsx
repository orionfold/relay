"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

interface AppCardDeleteButtonProps {
  appId: string;
  appName: string;
  tableCount: number;
  scheduleCount: number;
  fileCount: number;
}

export function AppCardDeleteButton({
  appId,
  appName,
  tableCount,
  scheduleCount,
  fileCount,
}: AppCardDeleteButtonProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const summary = [
    tableCount > 0
      ? `${tableCount} ${tableCount === 1 ? "table (and its rows, columns, triggers)" : "tables (and their rows, columns, triggers)"}`
      : null,
    scheduleCount > 0
      ? `${scheduleCount} schedule${scheduleCount === 1 ? "" : "s"}`
      : null,
    fileCount > 0
      ? `${fileCount} manifest file${fileCount === 1 ? "" : "s"}`
      : null,
  ]
    .filter(Boolean)
    .join(", ");

  const description =
    `This will remove the installed pack ${appName} and ${summary || "its manifest"}. ` +
    `Profiles and blueprints stay available for reuse. This cannot be undone.`;

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
        toast.success(`Deleted ${appName}`);
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
        aria-label={`Delete ${appName}`}
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
        title={`Delete ${appName}?`}
        description={description}
        confirmLabel={pending ? "Deleting…" : "Delete pack"}
        destructive
        onConfirm={handleConfirm}
      />
    </>
  );
}
