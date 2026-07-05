"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function AuthStatusDot({ showLabel = false }: { showLabel?: boolean } = {}) {
  const [status, setStatus] = useState<"connected" | "disconnected" | "loading">("loading");

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          setStatus(
            data.hasKey || data.apiKeySource === "oauth" || data.apiKeySource === "env"
              ? "connected"
              : "disconnected"
          );
        }
      } catch {
        setStatus("disconnected");
      }
    }

    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, []);

  const colors = {
    connected: "bg-success",
    disconnected: "bg-status-failed",
    loading: "bg-muted-foreground/40",
  };

  const labels = {
    connected: "API Connected",
    disconnected: "API Disconnected",
    loading: "Checking...",
  };

  // Short, visible labels for the bar's labeled variant (FEAT-12). The dot is
  // green/red/grey per the shared status-dot legend grammar; the adjacent word
  // disambiguates it from the rail's cyan live-data dot.
  const shortLabels = {
    connected: "Connected",
    disconnected: "Disconnected",
    loading: "Checking",
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link href="/settings" className="flex items-center gap-1.5">
          <span
            className={`inline-block h-2 w-2 rounded-full ${colors[status]}`}
            aria-label={labels[status]}
          />
          {showLabel && (
            <span className="text-xs text-muted-foreground">
              {shortLabels[status]}
            </span>
          )}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-xs">{labels[status]}</p>
      </TooltipContent>
    </Tooltip>
  );
}
