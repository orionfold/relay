"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Brain,
  ChevronDown,
  ChevronUp,
  Check,
  Clock,
  History,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PROSE_NOTIFICATION } from "@/lib/constants/prose-styles";
import { formatTimestamp } from "@/lib/utils/format-timestamp";
import type { LearnedContextRow } from "@/lib/db/schema";
import {
  buildLearnedContextHistoryEntries,
  hasMeaningfulDerivedDiff,
} from "@/lib/utils/learned-context-history";

interface ContextHistoryResponse {
  history: LearnedContextRow[];
  currentSize: number;
  limit: number;
  needsSummarization: boolean;
}

interface LearnedContextPanelProps {
  profileId: string;
}

const CHANGE_TYPE_BADGE: Record<
  string,
  { variant: "default" | "secondary" | "outline" | "destructive"; label: string }
> = {
  proposal: { variant: "outline", label: "Proposed" },
  approved: { variant: "default", label: "Approved" },
  rejected: { variant: "destructive", label: "Rejected" },
  rollback: { variant: "secondary", label: "Rollback" },
  summarization: { variant: "secondary", label: "Summarized" },
};

export function LearnedContextPanel({ profileId }: LearnedContextPanelProps) {
  const [data, setData] = useState<ContextHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingManual, setAddingManual] = useState(false);
  const [manualContent, setManualContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${profileId}/context`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // silent
    }
    setLoading(false);
  }, [profileId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    setExpandedDiffs({});
  }, [profileId]);

  async function handleAddManual() {
    if (!manualContent.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/agents/${profileId}/context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ additions: manualContent.trim() }),
      });
      if (res.ok) {
        toast.success("Pattern added");
        setManualContent("");
        setAddingManual(false);
        refresh();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? "Failed to add pattern");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRollback(version: number) {
    try {
      const res = await fetch(`/api/agents/${profileId}/context`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rollback", targetVersion: version }),
      });
      if (res.ok) {
        toast.success(`Rolled back to version ${version}`);
        refresh();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? "Failed to rollback");
      }
    } catch {
      toast.error("Network error");
    }
  }

  if (loading) {
    return (
      <Card className="surface-card">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const history = data?.history ?? [];
  const entries = buildLearnedContextHistoryEntries(history);
  const currentSize = data?.currentSize ?? 0;
  const limit = data?.limit ?? 8000;
  const usagePercent = Math.min((currentSize / limit) * 100, 100);

  return (
    <Card className="surface-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Brain className="h-4 w-4 text-muted-foreground" />
            Learned Context
            {history.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {history.length} {history.length === 1 ? "version" : "versions"}
              </Badge>
            )}
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => setAddingManual(!addingManual)}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add Pattern
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Size progress bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Context size</span>
            <span>
              {currentSize.toLocaleString()} / {limit.toLocaleString()} chars
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${
                usagePercent > 75
                  ? "bg-status-warning"
                  : "bg-primary"
              }`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>
        </div>

        {/* Manual add */}
        {addingManual && (
          <div className="space-y-2">
            <Textarea
              value={manualContent}
              onChange={(e) => setManualContent(e.target.value)}
              rows={4}
              placeholder="Add a pattern, best practice, or insight..."
              className="text-sm"
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={submitting || !manualContent.trim()}
                onClick={handleAddManual}
              >
                {submitting ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Check className="mr-1 h-3 w-3" />
                )}
                Add
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAddingManual(false);
                  setManualContent("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Version timeline */}
        {history.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No learned context yet. Patterns will be proposed after task
              completions.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <History className="h-3 w-3" />
              Version History
            </div>
            <div className="max-h-[32rem] space-y-2 overflow-y-auto">
              {entries.map((entry) => {
                const { row, snapshotContent, derivedDiff } = entry;
                const badgeConfig = CHANGE_TYPE_BADGE[row.changeType] ?? {
                  variant: "outline" as const,
                  label: row.changeType,
                };
                const diffId = `learned-context-diff-${row.id}`;
                const diffExpanded = expandedDiffs[row.id] ?? false;
                const canShowDiff = hasMeaningfulDerivedDiff(derivedDiff);
                const previewLabel =
                  row.changeType === "rollback"
                    ? "Restored Context"
                    : row.changeType === "summarization"
                      ? "Summarized Context"
                      : row.changeType === "approved"
                        ? "Approved Context"
                        : row.changeType === "proposal"
                          ? "Proposed Additions"
                          : "Change Summary";
                return (
                  <div
                    key={row.id}
                    className="surface-card-muted rounded-lg border border-border/60 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={badgeConfig.variant} className="text-xs">
                          {badgeConfig.label}
                        </Badge>
                        <span className="text-xs font-medium text-muted-foreground">
                          v{row.version}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {(row.changeType === "approved" ||
                          row.changeType === "summarization") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={() => handleRollback(row.version)}
                          >
                            <RotateCcw className="mr-1 h-3 w-3" />
                            Rollback
                          </Button>
                        )}
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatTimestamp(
                            row.createdAt instanceof Date
                              ? row.createdAt.toISOString()
                              : new Date(
                                  typeof row.createdAt === "number"
                                    ? row.createdAt * 1000
                                    : row.createdAt
                                ).toISOString()
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          {previewLabel}
                        </p>
                        {canShowDiff && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            aria-expanded={diffExpanded}
                            aria-controls={diffId}
                            onClick={() =>
                              setExpandedDiffs((current) => ({
                                ...current,
                                [row.id]: !current[row.id],
                              }))
                            }
                          >
                            {diffExpanded ? (
                              <ChevronUp className="mr-1 h-3 w-3" />
                            ) : (
                              <ChevronDown className="mr-1 h-3 w-3" />
                            )}
                            {diffExpanded ? "Hide Diff" : "Show Diff"}
                          </Button>
                        )}
                      </div>

                      {snapshotContent ? (
                        <div className={`${PROSE_NOTIFICATION} max-h-48 overflow-auto rounded-md bg-background/50 p-2`}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {snapshotContent}
                          </ReactMarkdown>
                        </div>
                      ) : row.diff ? (
                        <div className={`${PROSE_NOTIFICATION} max-h-40 overflow-auto rounded-md bg-background/50 p-2`}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {row.diff}
                          </ReactMarkdown>
                        </div>
                      ) : null}

                      {canShowDiff && diffExpanded && derivedDiff && (
                        <div
                          id={diffId}
                          className="surface-scroll rounded-md border border-border/60 bg-background/60 p-2"
                        >
                          <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            <span>Unified Diff</span>
                            <span>
                              {derivedDiff.previousVersion === null
                                ? "Initial version"
                                : `vs v${derivedDiff.previousVersion}`}
                            </span>
                          </div>
                          <div className="max-h-64 space-y-1 overflow-y-auto font-mono text-xs">
                            {derivedDiff.lines.map((line, index) => {
                              const toneClass =
                                line.kind === "added"
                                  ? "bg-status-completed/10 text-status-completed"
                                  : line.kind === "removed"
                                    ? "bg-destructive/10 text-destructive"
                                    : "bg-muted/40 text-muted-foreground";
                              const prefix =
                                line.kind === "added"
                                  ? "+"
                                  : line.kind === "removed"
                                    ? "-"
                                    : " ";

                              return (
                                <div
                                  key={`${row.id}-diff-${index}`}
                                  className={`grid grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-sm px-2 py-1 ${toneClass}`}
                                >
                                  <span aria-hidden="true">{prefix}</span>
                                  <span className="whitespace-pre-wrap break-words">
                                    {line.value || " "}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
