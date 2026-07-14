"use client";

import { useState } from "react";
import Link from "next/link";
import { formatTime } from "@/lib/utils/format-timestamp";
import { ScreenshotLightbox } from "@/components/shared/screenshot-lightbox";

export interface LogEntryData {
  id: string;
  taskId: string | null;
  agentType: string;
  event: string;
  payload: string | null;
  timestamp: string;
}

const eventColors: Record<string, string> = {
  tool_start: "text-primary",
  content_block_start: "text-primary",
  message_start: "text-primary",
  content_block_delta: "text-muted-foreground",
  error: "text-destructive",
  completed: "text-chart-2",
  screenshot: "text-primary",
};

export function LogEntry({ entry, taskName }: { entry: LogEntryData; taskName?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const time = formatTime(entry.timestamp);

  let preview = "";
  let screenshotData: { documentId: string; thumbnailUrl: string } | null = null;
  try {
    if (entry.payload) {
      const parsed = JSON.parse(entry.payload);
      if (entry.event === "screenshot" && parsed.documentId) {
        screenshotData = parsed;
        preview = parsed.toolName ?? "screenshot";
      } else if (parsed.tool) {
        preview = `${parsed.tool}`;
      } else if (parsed.text) {
        preview = parsed.text.slice(0, 80);
      } else if (parsed.error) {
        preview = parsed.error.slice(0, 80);
      } else if (parsed.result) {
        preview = parsed.result.slice(0, 80);
      }
    }
  } catch {
    preview = entry.payload?.slice(0, 80) ?? "";
  }

  const color = eventColors[entry.event] ?? "text-muted-foreground";

  return (
    <>
      <button
        type="button"
        className="w-full text-left font-mono text-sm py-0.5 hover:bg-muted/50 px-2 rounded"
        onClick={() => screenshotData ? setLightboxOpen(true) : setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label={`Log entry: ${entry.event} at ${time}`}
      >
        <span className="text-muted-foreground">[{time}]</span>{" "}
        {taskName && entry.taskId && (
          <>
            <Link
              href={`/tasks/${entry.taskId}`}
              className="text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {taskName}
            </Link>{" "}
          </>
        )}
        <span className={color}>[{entry.event}]</span>{" "}
        <span className="text-foreground">{preview}</span>
        {screenshotData && (
          <div className="mt-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <img
              src={screenshotData.thumbnailUrl}
              alt="Screenshot"
              className="rounded border border-border hover:border-primary transition-colors"
              style={{ width: 100, height: 60, objectFit: "cover" }}
              loading="lazy"
              onClick={() => setLightboxOpen(true)}
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
            <span className="text-xs text-primary" onClick={() => setLightboxOpen(true)}>
              Click to expand
            </span>
          </div>
        )}
        {expanded && entry.payload && !screenshotData && (
          <pre className="text-xs text-muted-foreground bg-muted p-2 rounded mt-1 overflow-auto max-h-40 whitespace-pre-wrap">
            {JSON.stringify(JSON.parse(entry.payload), null, 2)}
          </pre>
        )}
      </button>
      {screenshotData && (
        <ScreenshotLightbox
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          imageUrl={`/api/documents/${screenshotData.documentId}/file?inline=1`}
          width={0}
          height={0}
        />
      )}
    </>
  );
}
