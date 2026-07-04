"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

interface AppDetailActionsProps {
  appId: string;
  appName: string;
  tableCount: number;
  scheduleCount: number;
  fileCount: number;
}

export function AppDetailActions({
  appId,
  appName,
  tableCount,
  scheduleCount,
  fileCount,
}: AppDetailActionsProps) {
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
    `This will remove ${appName} and ${summary || "its manifest"}. ` +
    `Profiles and blueprints stay available for reuse. This cannot be undone.`;

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
        toast.success(`Deleted ${appName}`);
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
        Delete app
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => !pending && setConfirmOpen(open)}
        title={`Delete ${appName}?`}
        description={description}
        confirmLabel={pending ? "Deleting…" : "Delete app"}
        destructive
        onConfirm={handleConfirm}
      />
    </>
  );
}
