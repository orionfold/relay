"use client";

import { useCallback, useState } from "react";
import type { ChatMessageRow } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { ChatMessageMarkdown } from "./chat-message-markdown";
import { ChatPermissionRequest } from "./chat-permission-request";
import { ChatQuestionInline } from "./chat-question";
import { ChatQuickAccess } from "./chat-quick-access";
import { ScreenshotGallery } from "./screenshot-gallery";
import { AppMaterializedCard } from "./app-materialized-card";
import { BranchActionButton } from "./branch-action-button";
import { useChatSession } from "./chat-session-provider";
import {
  ExtensionFallbackCard,
  type CreatePluginSpecInputForCard,
} from "./extension-fallback-card";
import { AlertCircle } from "lucide-react";
import { parseQuickAccessItems, resolveModelLabel, type ChatQuestion, type QuickAccessItem, type ScreenshotAttachment } from "@/lib/chat/types";
import type { ComposedAppSummary } from "@/lib/apps/composition-detector";
import { APPS_CHANGED_EVENT } from "@/lib/apps/apps-events";

interface ExtensionFallbackSummary {
  plugin: CreatePluginSpecInputForCard;
  rationale: string;
  composeAltPrompt: string;
  explanation: string;
}

interface ChatMessageProps {
  message: ChatMessageRow;
  isStreaming: boolean;
  conversationId?: string;
  onStatusChange?: (messageId: string, status: string) => void;
}

interface PermissionMetadata {
  type: "permission_request";
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

interface QuestionMetadata {
  type: "question";
  requestId: string;
  questions: ChatQuestion[];
}

type SystemMetadata = PermissionMetadata | QuestionMetadata;

function ComposedAppCard({ app }: { app: ComposedAppSummary }) {
  const [appStatus, setAppStatus] = useState<"running" | "undone">("running");
  const handleUndo = useCallback(async () => {
    const res = await fetch(`/api/apps/${encodeURIComponent(app.appId)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setAppStatus("undone");
      window.dispatchEvent(new CustomEvent(APPS_CHANGED_EVENT));
    }
  }, [app.appId]);

  return (
    <AppMaterializedCard
      appId={app.appId}
      name={app.displayName}
      primitives={app.primitives}
      status={appStatus}
      onUndo={handleUndo}
      className="mt-2"
    />
  );
}

function ExtensionFallbackWrapper({
  summary,
}: {
  summary: ExtensionFallbackSummary;
}) {
  const handleScaffold = async (inputs: CreatePluginSpecInputForCard) => {
    const res = await fetch("/api/plugins/scaffold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inputs),
    });
    if (!res.ok) {
      const err = await res
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<{
      ok: true;
      id: string;
      pluginDir: string;
      tools: string[];
    }>;
  };

  const handleTryAlt = (prompt: string) => {
    window.dispatchEvent(
      new CustomEvent("ainative-chat-submit", { detail: { content: prompt } })
    );
  };

  return (
    <ExtensionFallbackCard
      explanation={summary.explanation}
      composeAltPrompt={summary.composeAltPrompt}
      pluginSlug={summary.plugin.id}
      pluginInputs={summary.plugin}
      onScaffold={handleScaffold}
      onTryAlt={handleTryAlt}
      className="mt-2"
    />
  );
}

export function ChatMessage({ message, isStreaming, conversationId, onStatusChange }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const isError = message.status === "error";
  const isRewound = message.rewoundAt != null;

  const session = useChatSession();
  const branchingEnabled = session.branchingEnabled;
  const parentTitle =
    session.conversations.find((c) => c.id === conversationId)?.title ?? null;

  // Rewound messages render as a single collapsed gray placeholder regardless
  // of role. They stay visible to the user but are filtered from agent
  // context server-side (see context-builder ancestor walk).
  if (isRewound) {
    return (
      <div className="text-xs text-muted-foreground italic px-4 py-1.5 opacity-60">
        Rewound · {message.role === "user" ? "your turn" : "assistant turn"} hidden from context
      </div>
    );
  }

  // Handle system messages (permission requests, questions)
  if (isSystem && message.metadata && conversationId) {
    try {
      const meta = JSON.parse(message.metadata) as SystemMetadata;

      if (meta.type === "permission_request") {
        return (
          <ChatPermissionRequest
            conversationId={conversationId}
            requestId={meta.requestId}
            messageId={message.id}
            toolName={meta.toolName}
            toolInput={meta.toolInput}
            status={message.status ?? "pending"}
            onStatusChange={onStatusChange ? (status) => onStatusChange(message.id, status) : undefined}
          />
        );
      }

      if (meta.type === "question") {
        return (
          <ChatQuestionInline
            conversationId={conversationId}
            requestId={meta.requestId}
            messageId={message.id}
            questions={meta.questions}
            status={message.status ?? "pending"}
            onStatusChange={onStatusChange ? (status) => onStatusChange(message.id, status) : undefined}
          />
        );
      }
    } catch {
      // Invalid metadata — fall through to default rendering
    }
  }

  // Skip rendering system messages without valid metadata
  if (isSystem) return null;

  // Extract Quick Access pills, model label, and screenshot attachments from assistant messages
  let quickAccess: QuickAccessItem[] = [];
  let attachments: ScreenshotAttachment[] = [];
  let modelLabel: string | null = null;
  let fallbackReason: string | null = null;
  let composedApp: ComposedAppSummary | null = null;
  let extensionFallback: ExtensionFallbackSummary | null = null;
  if (!isUser && message.metadata) {
    try {
      const meta = JSON.parse(message.metadata);
      quickAccess = parseQuickAccessItems(meta.quickAccess);
      if (Array.isArray(meta.attachments)) attachments = meta.attachments;
      if (meta.modelId) modelLabel = resolveModelLabel(meta.modelId);
      if (meta.fallbackReason) fallbackReason = meta.fallbackReason;
      if (meta.composedApp && typeof meta.composedApp === "object") {
        composedApp = meta.composedApp as ComposedAppSummary;
      }
      if (
        meta.extensionFallback &&
        typeof meta.extensionFallback === "object"
      ) {
        extensionFallback = meta.extensionFallback as ExtensionFallbackSummary;
      }
    } catch {
      // Invalid metadata
    }
  }

  return (
    <div>
      {/* Message bubble */}
      <div
        className={cn(
          "rounded-xl px-4 py-2.5",
          isUser
            ? "bg-muted text-foreground"
            : cn(
                "bg-card",
                isError && "border border-destructive/50"
              )
        )}
      >
        {isError && !isUser && (
          <div className="flex items-center gap-1.5 text-destructive text-xs mb-1.5">
            <AlertCircle className="h-3 w-3" />
            Error
          </div>
        )}

        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="text-sm">
            {message.content ? (
              <ChatMessageMarkdown
                content={message.content}
                attachments={attachments}
              />
            ) : isStreaming ? (
              <span className="text-muted-foreground text-xs animate-pulse">
                {(() => {
                  try {
                    const meta = message.metadata ? JSON.parse(message.metadata) : null;
                    return meta?.statusMessage || "Thinking...";
                  } catch { return "Thinking..."; }
                })()}
              </span>
            ) : null}
            {/* Legacy fallback: messages saved before inline screenshot rendering
                stored attachments in metadata but never embedded markdown image
                refs in `content`. Detect that case and show the trailing gallery
                so historical conversations don't lose their visuals. */}
            {attachments.length > 0 &&
              !attachments.some((att) =>
                message.content?.includes(`](${att.thumbnailUrl})`)
              ) && <ScreenshotGallery attachments={attachments} />}
            {isStreaming && message.content && (
              <span className="inline-block w-0.5 h-4 bg-foreground animate-pulse ml-0.5 align-text-bottom" />
            )}
            <ChatQuickAccess
              items={message.status === "complete" && !isStreaming ? quickAccess : []}
            />
          </div>
        )}
      </div>
      {composedApp && <ComposedAppCard app={composedApp} />}
      {extensionFallback && (
        <ExtensionFallbackWrapper summary={extensionFallback} />
      )}
      {/* Model label for completed assistant messages */}
      {!isUser && !isStreaming && modelLabel && (
        <div className="mt-0.5 ml-1 space-y-0.5">
          <span className="block text-[10px] text-muted-foreground/50">
            {modelLabel}
          </span>
          {fallbackReason && (
            <span className="block text-[10px] text-amber-700/80 dark:text-amber-300/80">
              {fallbackReason}
            </span>
          )}
        </div>
      )}
      {/* Branch action — completed assistant messages only, gated on flag */}
      {!isUser && !isStreaming && branchingEnabled && conversationId && (
        <div className="mt-1 ml-1">
          <BranchActionButton
            parentConversationId={conversationId}
            branchedFromMessageId={message.id}
            parentTitle={parentTitle}
            onBranch={(input) => session.branchConversation(input)}
          />
        </div>
      )}
    </div>
  );
}
