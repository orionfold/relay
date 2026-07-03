"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Layers3, Brain } from "lucide-react";
import { LightMarkdown } from "@/components/shared/light-markdown";

interface BatchProposalReviewProps {
  proposalIds: string[];
  profileIds: string[];
  body: string;
  onResponded?: () => void;
  onRequestFailed?: () => void;
  compact?: boolean;
}

export function BatchProposalReview({
  proposalIds,
  profileIds,
  body,
  onResponded,
  onRequestFailed,
  compact = false,
}: BatchProposalReviewProps) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [responded, setResponded] = useState(false);
  const [result, setResult] = useState<{
    action: string;
    count: number;
  } | null>(null);

  async function handleBatchAction(action: "approve" | "reject") {
    setLoading(action);
    setResponded(true);
    onResponded?.();

    try {
      const res = await fetch("/api/context/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalIds, action }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Failed to ${action} batch proposal`);
      }

      const data = await res.json();
      setResult({ action: data.action, count: data.count });
    } catch (error) {
      setResponded(false);
      setResult(null);
      toast.error(
        error instanceof Error ? error.message : "Batch approval failed"
      );
      onRequestFailed?.();
    } finally {
      setLoading(null);
    }
  }

  if (responded && result) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {result.action === "approve" ? (
          <CheckCircle2 className="h-4 w-4 text-status-success" />
        ) : (
          <XCircle className="h-4 w-4 text-status-error" />
        )}
        <span>
          {result.count} proposal{result.count !== 1 ? "s" : ""}{" "}
          {result.action === "approve" ? "approved" : "rejected"}
        </span>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            <Layers3 className="h-3.5 w-3.5" />
            {proposalIds.length} proposals
          </Badge>
          {profileIds.map((id) => (
            <Badge key={id} variant="outline" className="text-xs">
              <Brain className="h-3.5 w-3.5" />
              {id}
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="default"
            disabled={loading !== null}
            onClick={() => handleBatchAction("approve")}
          >
            {loading === "approve" ? "Approving..." : "Approve All"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={loading !== null}
            onClick={() => handleBatchAction("reject")}
          >
            {loading === "reject" ? "Rejecting..." : "Reject All"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className="surface-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="h-4 w-4" />
          Workflow Learning: {proposalIds.length} Proposals
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {profileIds.map((id) => (
            <Badge key={id} variant="outline" className="text-xs">
              {id}
            </Badge>
          ))}
        </div>

        <div className="rounded-lg border p-3 max-h-64 overflow-y-auto">
          <LightMarkdown content={body} />
        </div>

        <div className="flex gap-2">
          <Button
            variant="default"
            disabled={loading !== null}
            onClick={() => handleBatchAction("approve")}
          >
            <CheckCircle2 className="h-4 w-4" />
            {loading === "approve"
              ? "Approving..."
              : `Approve All (${proposalIds.length})`}
          </Button>
          <Button
            variant="outline"
            disabled={loading !== null}
            onClick={() => handleBatchAction("reject")}
          >
            <XCircle className="h-4 w-4" />
            {loading === "reject"
              ? "Rejecting..."
              : `Reject All (${proposalIds.length})`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
