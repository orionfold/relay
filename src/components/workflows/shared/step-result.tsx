"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { EmbeddedMarkdown } from "@/components/shared/embedded-markdown";
import type { WorkflowStatusDocument } from "@/lib/workflows/types";

/**
 * Expandable step result with gradient fade progressive disclosure.
 * Extracted from the legacy workflow-status-view god component so it can be
 * reused by pattern-specific subviews and LoopStatusView without a circular
 * import.
 */
export function ExpandableResult({ result }: { result: string }) {
  const [expanded, setExpanded] = useState(false);

  if (!result) return null;

  return (
    <div className="mt-2">
      <div
        className={
          expanded
            ? "surface-scroll max-h-[48rem] overflow-auto rounded-lg p-3"
            : result.length > 200
              ? "max-h-20 overflow-hidden mask-fade-bottom"
              : ""
        }
      >
        <EmbeddedMarkdown content={result} hierarchy="embedded" />
      </div>
      {result.length > 200 && (
        <button
          type="button"
          className="mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

/**
 * Document list for a single step or parent task — renders a labeled cluster
 * of links to document detail pages.
 */
export function DocumentList({
  docs,
  label,
}: {
  docs: WorkflowStatusDocument[];
  label: string;
}) {
  if (docs.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-muted-foreground mb-1.5">{label}</p>
      <div className="space-y-1">
        {docs.map((doc) => (
          <Link
            key={doc.id}
            href={`/documents/${doc.id}`}
            className="flex items-center gap-2 text-xs text-brand-blue hover:underline"
          >
            <FileText className="h-3 w-3 shrink-0" />
            {doc.originalName}
          </Link>
        ))}
      </div>
    </div>
  );
}
