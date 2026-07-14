"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useWorkflowStatus } from "./hooks/use-workflow-status";
import { SequencePatternView } from "./views/sequence-pattern-view";
import { LoopPatternView } from "./views/loop-pattern-view";
import { WorkflowLoadingSkeleton } from "./shared/workflow-loading-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OperationsReceiptHistory } from "@/components/operations/operations-receipt-history";

/**
 * Thin router for the workflow detail page (TDR-031). Owns polling + the
 * delete confirm dialog and dispatches to a pattern-specific subview. The
 * if/else on `data.pattern` uses TypeScript's discriminated-union narrowing
 * so each subview receives its own arm, with `.state` guaranteed present on
 * the non-loop arm — which is why PR #6's `s.state?.result` optional chain
 * is no longer needed and has been removed.
 */
export function WorkflowStatusView({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const { data, setData, refetch } = useWorkflowStatus(workflowId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = useCallback(async () => {
    setConfirmDelete(false);
    const res = await fetch(`/api/workflows/${workflowId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Workflow deleted");
      router.push("/workflows");
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error ?? "Failed to delete workflow");
    }
  }, [router, workflowId]);

  const onRequestDelete = useCallback(() => setConfirmDelete(true), []);

  if (!data) return <WorkflowLoadingSkeleton />;

  return (
    <>
      {data.pattern === "loop" ? (
        <LoopPatternView data={data} onRefresh={refetch} onRequestDelete={onRequestDelete} />
      ) : (
        <SequencePatternView
          data={data}
          setData={setData}
          onRefresh={refetch}
          onRequestDelete={onRequestDelete}
        />
      )}
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Operations Receipts ({data.receipts?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <OperationsReceiptHistory
            receipts={data.receipts ?? []}
            reconciliationErrors={data.receiptReconciliationErrors}
          />
        </CardContent>
      </Card>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete Workflow"
        description="This will permanently delete this workflow and cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        destructive
      />
    </>
  );
}
