"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, AlertTriangle, RefreshCw, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorTimeline } from "./error-timeline";

interface DebugAnalysis {
  rootCause: {
    type: "budget_exceeded" | "timeout" | "transient" | "unknown";
    summary: string;
  };
  timeline: Array<{
    timestamp: string;
    event: string;
    severity: "success" | "warning" | "error";
    details: string;
  }>;
  suggestions: Array<{
    tier: "quick" | "better" | "best";
    title: string;
    description: string;
  }>;
  stepErrors: Array<{
    stepId: string;
    stepName: string;
    error: string;
  }>;
}

const TIER_STYLES = {
  quick: "bg-emerald-50 text-emerald-700 border-emerald-200",
  better: "bg-amber-50 text-amber-700 border-amber-200",
  best: "bg-blue-50 text-blue-700 border-blue-200",
} as const;

const CAUSE_LABELS: Record<string, string> = {
  budget_exceeded: "Budget Exceeded",
  timeout: "Timeout / Turn Limit",
  transient: "Transient Error",
  unknown: "Unknown",
};

interface WorkflowDebugPanelProps {
  workflowId: string;
}

export function WorkflowDebugPanel({ workflowId }: WorkflowDebugPanelProps) {
  const [open, setOpen] = useState(false);
  const [analysis, setAnalysis] = useState<DebugAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!open || analysis) return;

    setLoading(true);
    fetch(`/api/workflows/${workflowId}/debug`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setAnalysis(data);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, workflowId, analysis]);

  const handleRerun = async () => {
    setRetrying(true);
    try {
      await fetch(`/api/workflows/${workflowId}/execute`, { method: "POST" });
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="rounded-lg border border-red-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-red-50/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <span className="text-sm font-medium">Debug Analysis</span>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="border-t px-4 py-4 space-y-4">
          {loading && (
            <div className="space-y-3">
              <div className="h-16 rounded-lg bg-muted animate-pulse" />
              <div className="h-32 rounded-lg bg-muted animate-pulse" />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600">Failed to load analysis: {error}</p>
          )}

          {analysis && (
            <>
              {/* Root cause summary */}
              <div className="rounded-lg border-l-4 border-l-red-500 border border-red-100 bg-red-50/30 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="destructive" className="text-xs">
                    {CAUSE_LABELS[analysis.rootCause.type] ?? analysis.rootCause.type}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {analysis.rootCause.summary}
                </p>
              </div>

              {/* Step errors */}
              {analysis.stepErrors.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Failed Steps
                  </h4>
                  {analysis.stepErrors.map((se) => (
                    <div key={se.stepId} className="rounded border p-2 text-xs">
                      <span className="font-medium">{se.stepName}:</span>{" "}
                      <span className="text-muted-foreground">{se.error}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Timeline */}
              {analysis.timeline.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Event Timeline
                  </h4>
                  <ErrorTimeline events={analysis.timeline} />
                </div>
              )}

              {/* Suggestions */}
              {analysis.suggestions.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Fix Suggestions
                  </h4>
                  <div className="space-y-2">
                    {analysis.suggestions.map((s, i) => (
                      <div key={i} className={`rounded-lg border p-3 ${TIER_STYLES[s.tier]}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {s.tier}
                          </Badge>
                          <span className="text-sm font-medium">{s.title}</span>
                        </div>
                        <p className="text-xs opacity-80">{s.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t">
                <Button size="sm" onClick={handleRerun} disabled={retrying}>
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${retrying ? "animate-spin" : ""}`} />
                  Re-run Workflow
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/workflows?id=${workflowId}&tab=logs`}>
                    <FileText className="h-3.5 w-3.5 mr-1.5" />
                    View Full Logs
                  </Link>
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
