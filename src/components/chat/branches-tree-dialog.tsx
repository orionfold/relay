"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ConversationRow } from "@/lib/db/schema";

interface BranchesTreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | null;
  onSelect: (id: string) => void;
}

interface TreeNode {
  conv: ConversationRow;
  children: TreeNode[];
  depth: number;
}

function buildTree(family: ConversationRow[]): TreeNode | null {
  const byId = new Map(family.map((c) => [c.id, c]));
  const root = family.find((c) => c.parentConversationId == null);
  if (!root) return null;

  const childrenByParent = new Map<string, ConversationRow[]>();
  for (const c of family) {
    const pid = c.parentConversationId;
    if (pid && byId.has(pid)) {
      const arr = childrenByParent.get(pid) ?? [];
      arr.push(c);
      childrenByParent.set(pid, arr);
    }
  }

  function walk(conv: ConversationRow, depth: number): TreeNode {
    const kids = (childrenByParent.get(conv.id) ?? []).map((k) =>
      walk(k, depth + 1)
    );
    return { conv, children: kids, depth };
  }
  return walk(root, 0);
}

function flattenTree(node: TreeNode): TreeNode[] {
  const out: TreeNode[] = [node];
  for (const c of node.children) out.push(...flattenTree(c));
  return out;
}

export function BranchesTreeDialog({
  open,
  onOpenChange,
  conversationId,
  onSelect,
}: BranchesTreeDialogProps) {
  const [family, setFamily] = useState<ConversationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !conversationId) return;
    let cancelled = false;
    setFamily(null);
    setError(null);
    fetch(`/api/chat/conversations/${conversationId}/branches`)
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))
      )
      .then((data) => {
        if (!cancelled) setFamily(data.family ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? "Failed to load branches");
      });
    return () => {
      cancelled = true;
    };
  }, [open, conversationId]);

  const tree = family ? buildTree(family) : null;
  const nodes = tree ? flattenTree(tree) : [];
  const isSingleNode = nodes.length <= 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Branches</DialogTitle>
          <DialogDescription>
            All conversations in this branching tree. Click a node to switch to
            it.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2 max-h-[60vh] overflow-y-auto">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {family == null && !error && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {family != null && isSingleNode && (
            <p className="text-sm text-muted-foreground">
              No branches yet. Use &ldquo;Branch from here&rdquo; on any
              assistant message to fork a new conversation.
            </p>
          )}
          {family != null && !isSingleNode && (
            <ul className="space-y-1">
              {nodes.map((n) => (
                <li
                  key={n.conv.id}
                  style={{ paddingLeft: `${n.depth * 16}px` }}
                  className={cn(
                    "text-sm rounded-md px-2 py-1 ",
                    n.conv.id === conversationId
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted/50"
                  )}
                  onClick={() => onSelect(n.conv.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(n.conv.id);
                    }
                  }}
                >
                  {n.conv.title || "Untitled"}
                  {n.conv.id === conversationId && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      (current)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
