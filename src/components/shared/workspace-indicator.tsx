"use client";

import { useEffect, useState } from "react";
import { Database, Folder, GitBranch, Wrench } from "lucide-react";

interface WorkspaceData {
  folderName: string;
  parentPath: string;
  gitBranch: string | null;
  isWorktree: boolean;
  dataDir: string | null;
  dataDirMismatch: boolean;
}

interface WorkspaceIndicatorProps {
  variant: "sidebar" | "inline";
}

export function WorkspaceIndicator({ variant }: WorkspaceIndicatorProps) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [fixState, setFixState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [fixResult, setFixResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/workspace/context")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) return null;

  async function handleFix() {
    setFixState("loading");
    try {
      const res = await fetch("/api/workspace/fix-data-dir", { method: "POST" });
      const json = await res.json();
      if (res.ok && json.success) {
        setFixState("done");
        setFixResult(json.dataDir);
      } else {
        setFixState("error");
        setFixResult(json.error || "Fix failed");
      }
    } catch {
      setFixState("error");
      setFixResult("Network error");
    }
  }

  if (variant === "inline") {
    return (
      <span className="text-sm text-muted-foreground">
        <Folder className="h-3 w-3 inline mr-1" />
        {data.parentPath}/
        <span className="font-medium text-foreground">{data.folderName}</span>
        {data.gitBranch && (
          <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground/70">
            <GitBranch className="h-3 w-3" />
            {data.gitBranch}
          </span>
        )}
        {data.dataDir && (
          <span className={`ml-2 inline-flex items-center gap-1 text-xs ${data.dataDirMismatch ? "text-destructive" : "text-muted-foreground/70"}`}>
            <Database className="h-3 w-3" />
            {data.dataDir}
          </span>
        )}
      </span>
    );
  }

  return (
    <div className="min-w-0">
      <p className="text-[12px] text-muted-foreground truncate flex items-center gap-1">
        <Folder className="h-3 w-3 shrink-0" />
        {data.parentPath}/<span className="font-semibold text-foreground">{data.folderName}</span>
      </p>
      {data.gitBranch && (
        <p className="text-[11px] text-muted-foreground/70 truncate flex items-center gap-1 mt-0.5">
          <GitBranch className="h-3 w-3 shrink-0" />
          {data.gitBranch}
          {data.isWorktree && (
            <span className="text-[10px] bg-muted px-1 rounded">worktree</span>
          )}
        </p>
      )}
      {data.dataDir && (
        <p className={`text-[11px] truncate flex items-center gap-1 mt-0.5 ${data.dataDirMismatch ? "text-destructive" : "text-muted-foreground/70"}`}>
          <Database className="h-3 w-3 shrink-0" />
          {data.dataDir}
          {data.dataDirMismatch && fixState === "idle" && (
            <>
              <span className="text-[10px] bg-destructive/10 text-destructive px-1 rounded">shared</span>
              <button
                onClick={handleFix}
                className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded hover:bg-destructive/20 transition-colors inline-flex items-center gap-0.5"
              >
                <Wrench className="h-2.5 w-2.5" />
                Fix
              </button>
            </>
          )}
          {data.dataDirMismatch && fixState === "loading" && (
            <span className="text-[10px] text-muted-foreground animate-pulse">fixing...</span>
          )}
          {data.dataDirMismatch && fixState === "done" && (
            <span className="text-[10px] text-green-600">
              → {fixResult} · Ctrl-C, then re-run npx orionfold-relay
            </span>
          )}
          {data.dataDirMismatch && fixState === "error" && (
            <span className="text-[10px] text-destructive">{fixResult}</span>
          )}
        </p>
      )}
    </div>
  );
}
