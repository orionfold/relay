"use client";

import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PROSE_NOTIFICATION } from "@/lib/constants/prose-styles";
import {
  announceApprovalResolved,
  isAlreadyResolvedApproval,
  readApprovalResponse,
  runApprovalMutation,
} from "@/lib/notifications/approval-client";

interface ContextProposalReviewProps {
  notificationId: string;
  profileId: string;
  proposedAdditions: string;
  onResponded: () => void;
  compact?: boolean;
}

export function ContextProposalReview({
  notificationId,
  profileId,
  proposedAdditions,
  onResponded,
  compact = false,
}: ContextProposalReviewProps) {
  const [editing, setEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(proposedAdditions);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleAction(action: "approve" | "reject") {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await runApprovalMutation(notificationId, async () => {
        const res = await fetch(`/api/agents/${profileId}/context`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            notificationId,
            ...(action === "approve" && editing ? { editedContent } : {}),
          }),
        });
        return readApprovalResponse(
          res,
          `Failed to ${action} proposal`,
          (value): value is { ok: true; warning?: string } =>
            typeof value === "object" &&
            value !== null &&
            (value as { ok?: unknown }).ok === true
        );
      });

      announceApprovalResolved(notificationId);
      if (result.warning) {
        toast.warning(result.warning);
      } else {
        toast.success(
          action === "approve"
            ? "Context approved and applied"
            : "Proposal rejected"
        );
      }
      onResponded();
    } catch (error) {
      if (isAlreadyResolvedApproval(error)) {
        announceApprovalResolved(notificationId);
        onResponded();
        toast.info(
          error instanceof Error
            ? error.message
            : "Context proposal already resolved"
        );
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : `Failed to ${action} context proposal`;
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="default"
            disabled={submitting}
            onClick={() => handleAction("approve")}
          >
            <Check className="mr-1 h-3.5 w-3.5" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={submitting}
            onClick={() => handleAction("reject")}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Reject
          </Button>
        </div>
        {errorMessage && (
          <p role="alert" className="text-xs text-destructive">
            Context decision failed: {errorMessage}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Proposed additions preview / editor */}
      <div className="surface-card-muted rounded-lg p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">
          Proposed Patterns
        </p>
        {editing ? (
          <Textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            rows={8}
            className="font-mono text-xs"
            placeholder="Edit the proposed context additions..."
          />
        ) : (
          <div
            className={`${PROSE_NOTIFICATION} max-h-48 overflow-auto rounded-lg bg-background/50 p-3`}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {proposedAdditions.replace(/\s*\[.*?\]\s*/g, " ").trim()}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="default"
          disabled={submitting}
          onClick={() => handleAction("approve")}
        >
          <Check className="mr-1 h-4 w-4" />
          {editing ? "Save & Approve" : "Approve"}
        </Button>
        <Button
          variant="outline"
          disabled={submitting}
          onClick={() => {
            if (editing) {
              setEditing(false);
              setEditedContent(proposedAdditions);
            } else {
              setEditing(true);
            }
          }}
        >
          <Pencil className="mr-1 h-4 w-4" />
          {editing ? "Cancel Edit" : "Edit & Approve"}
        </Button>
        <Button
          variant="outline"
          className="text-destructive"
          disabled={submitting}
          onClick={() => handleAction("reject")}
        >
          <X className="mr-1 h-4 w-4" />
          Reject
        </Button>
      </div>
      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          Context decision failed: {errorMessage}
        </p>
      )}
    </div>
  );
}
