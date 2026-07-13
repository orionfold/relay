"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowDown } from "lucide-react";
import { LogEntry } from "./log-entry";
import { LogFilters } from "./log-filters";
import { ConnectionIndicator } from "./connection-indicator";

interface LogEntryData {
  id: string;
  taskId: string | null;
  agentType: string;
  event: string;
  payload: string | null;
  timestamp: string;
}

interface LogStreamProps {
  tasks: { id: string; title: string }[];
  initialTaskId?: string;
}

export function LogStream({ tasks, initialTaskId }: LogStreamProps) {
  const [entries, setEntries] = useState<LogEntryData[]>([]);
  const [connected, setConnected] = useState(false);
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);
  const [taskFilter, setTaskFilter] = useState(initialTaskId ?? "all");
  const [eventFilter, setEventFilter] = useState("all");
  const containerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const params = new URLSearchParams();
    if (taskFilter !== "all") params.set("taskId", taskFilter);
    if (eventFilter !== "all") params.set("eventType", eventFilter);

    const es = new EventSource(`/api/logs/stream?${params}`);
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setEntries((prev) => {
          const next = [...prev, data];
          return next.length > 500 ? next.slice(-500) : next;
        });
      } catch {
        // Invalid JSON
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      // Reconnect after 3s
      setTimeout(connect, 3000);
    };
  }, [taskFilter, eventFilter]);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
    };
  }, [connect]);

  // Auto-scroll
  useEffect(() => {
    if (isAutoScrolling && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries, isAutoScrolling]);

  function handleScroll() {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsAutoScrolling(isAtBottom);
  }

  function jumpToLatest() {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      setIsAutoScrolling(true);
    }
  }

  return (
    <Card className="relative flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-border/60">
        <h3 className="text-sm font-medium">Log Stream</h3>
        <div className="flex items-center gap-4">
          <LogFilters
            taskId={taskFilter}
            eventType={eventFilter}
            tasks={tasks}
            onTaskChange={(v) => {
              setTaskFilter(v);
              setEntries([]);
            }}
            onEventTypeChange={(v) => {
              setEventFilter(v);
              setEntries([]);
            }}
          />
          <ConnectionIndicator connected={connected} />
        </div>
      </div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-[300px] max-h-[calc(100vh-20rem)] overflow-auto p-2"
      >
        {entries.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[200px] text-sm text-muted-foreground">
            Waiting for agent activity...
          </div>
        ) : (
          entries.map((entry) => {
            const taskName = entry.taskId
              ? tasks.find((t) => t.id === entry.taskId)?.title
              : undefined;
            return <LogEntry key={entry.id} entry={entry} taskName={taskName} />;
          })
        )}
      </div>
      {!isAutoScrolling && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <Button size="sm" variant="secondary" onClick={jumpToLatest}>
            <ArrowDown className="h-3.5 w-3.5 mr-1" />
            Jump to latest
          </Button>
        </div>
      )}
    </Card>
  );
}
