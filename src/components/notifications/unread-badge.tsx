"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

export function UnreadBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let eventSource: EventSource | null = null;

    async function fetchCount() {
      try {
        const res = await fetch("/api/notifications?countOnly=true&unread=true");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setCount(data.count ?? 0);
        }
      } catch {
        // Silently fail
      }
    }

    fetchCount();
    // Aligned with InboxList polling at 10s to reduce duplicate requests
    const interval = setInterval(fetchCount, 10_000);

    // Real-time badge updates for workflow checkpoints
    // (fix-inbox-checkpoint-realtime): the badge must jump the instant a
    // checkpoint is raised, not on the next 10s tick. Re-count immediately
    // whenever the pending-approvals set changes (SSE trigger). Poll remains
    // the fallback for other notification types and on SSE failure.
    try {
      eventSource = new EventSource("/api/notifications/pending-approvals/stream");
      eventSource.onmessage = () => {
        if (!cancelled) void fetchCount();
      };
      eventSource.onerror = () => {
        eventSource?.close();
        eventSource = null;
      };
    } catch {
      // EventSource unavailable — the 10s poll remains the delivery path.
    }

    return () => {
      cancelled = true;
      clearInterval(interval);
      eventSource?.close();
    };
  }, []);

  if (count === 0) return null;

  return (
    <Badge variant="destructive" className="ml-auto text-xs h-5 min-w-5 px-1.5" aria-label={`${count} unread notifications`}>
      {count > 99 ? "99+" : count}
    </Badge>
  );
}
