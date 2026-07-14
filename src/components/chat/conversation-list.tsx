"use client";

import { useState } from "react";
import type { ConversationRow } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Plus, MoreHorizontal, Pencil, Trash2, MessageCircle, Search, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveModelLabel } from "@/lib/chat/types";

interface ConversationListProps {
  conversations: ConversationRow[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  branchingEnabled?: boolean;
  hasRelatives?: (id: string) => boolean;
  onViewBranches?: (id: string) => void;
}

function formatRelativeTime(date: Date | string | number): string {
  const now = new Date();
  const d = date instanceof Date ? date : new Date(date);
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onDelete,
  onRename,
  branchingEnabled,
  hasRelatives,
  onViewBranches,
}: ConversationListProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredConversations = searchQuery.trim()
    ? conversations.filter((c) =>
        (c.title || "New Chat").toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

  const handleRenameStart = (id: string, currentTitle: string) => {
    setRenamingId(id);
    setRenameValue(currentTitle || "");
  };

  const handleRenameSubmit = (id: string) => {
    if (renameValue.trim()) {
      onRename(id, renameValue.trim());
    }
    setRenamingId(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border">
        <Button
          onClick={onNewChat}
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          title="New Chat"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <div className="flex items-center flex-1 min-w-0 gap-1.5 rounded-md bg-muted/50 px-2 h-7">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats..."
            className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredConversations.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No conversations yet
          </div>
        ) : (
          <div className="py-1">
            {filteredConversations.map((conv) => (
              <div
                key={conv.id}
                data-interactive-surface=""
                data-interactive-outline="preserve"
                className={cn(
                  "interactive-list-item group flex items-center gap-2 px-3 py-2 mx-1 rounded-lg",
                  activeId === conv.id
                    ? "bg-accent text-accent-foreground"
                    : undefined
                )}
                onClick={() => onSelect(conv.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSelect(conv.id);
                }}
                tabIndex={0}
                role="button"
              >
                <MessageCircle className="h-4 w-4 shrink-0 text-muted-foreground" />

                <div className="flex-1 min-w-0">
                  {renamingId === conv.id ? (
                    <Input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => handleRenameSubmit(conv.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameSubmit(conv.id);
                        if (e.key === "Escape") setRenamingId(null);
                        e.stopPropagation();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-6 text-sm px-1"
                      autoFocus
                    />
                  ) : (
                    <>
                      <div className="text-sm truncate">
                        {conv.title || "New Chat"}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span>{formatRelativeTime(conv.updatedAt)}</span>
                        {conv.modelId && (
                          <span className="text-[10px] text-muted-foreground/50">
                            {resolveModelLabel(conv.modelId)}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRenameStart(conv.id, conv.title ?? "");
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-2" />
                      Rename
                    </DropdownMenuItem>
                    {branchingEnabled && hasRelatives?.(conv.id) && onViewBranches && (
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewBranches(conv.id);
                        }}
                      >
                        <GitBranch className="h-3.5 w-3.5 mr-2" />
                        View branches
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(conv.id);
                      }}
                      className="text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
