"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { ConversationRow } from "@/lib/db/schema";
import type { PromptCategory } from "@/lib/chat/types";
import { useChatSession } from "./chat-session-provider";
import { ConversationList } from "./conversation-list";
import { ChatMessageList } from "./chat-message-list";
import { ChatInput } from "./chat-input";
import { ChatEmptyState } from "./chat-empty-state";
import { ChatActivityIndicator } from "./chat-activity-indicator";
import { ConversationTemplatePicker } from "./conversation-template-picker";
import { BranchesTreeDialog } from "./branches-tree-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { PanelRightOpen, Sparkles } from "lucide-react";

interface ChatShellProps {
  initialConversations: ConversationRow[];
  promptCategories: PromptCategory[];
  starters?: import("@/lib/apps/starters").StarterTemplate[];
  initialActiveId?: string | null;
}

/**
 * Thin view component for the /chat route. All chat-domain state lives in
 * `ChatSessionProvider` (rendered from `src/app/layout.tsx`), so unmounting
 * this component — e.g., when the user navigates to another sidebar view —
 * does not touch the in-flight SSE reader loop or clear any messages. On
 * remount, we read the provider's current state and render it directly.
 *
 * See `features/chat-session-persistence-provider.md`.
 */
export function ChatShell({
  initialConversations,
  promptCategories,
  starters,
  initialActiveId,
}: ChatShellProps) {
  const session = useChatSession();
  const {
    conversations,
    activeId,
    messages,
    isStreaming,
    modelId,
    savedDefaultModel,
    availableModels,
    hydrated,
    hydrate,
    setActiveConversation,
    sendMessage,
    stopStreaming,
    createConversation,
    deleteConversation,
    renameConversation,
    setMessageStatus,
    setModelId,
  } = session;

  // View-local state only
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [hoverPreview, setHoverPreview] = useState<string | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [branchesDialogId, setBranchesDialogId] = useState<string | null>(null);
  // Seed signal for the composer — starter cards + example chips set this to
  // fill the textarea without sending. Nonce drives re-seed on repeated clicks.
  const [seedSignal, setSeedSignal] = useState<{ value: string; nonce: number }>({ value: "", nonce: 0 });

  const seedComposer = useCallback((value: string) => {
    setSeedSignal({ value, nonce: Date.now() });
  }, []);

  const hasRelatives = useCallback(
    (id: string) => {
      const conv = conversations.find((c) => c.id === id);
      if (!conv) return false;
      if (conv.parentConversationId != null) return true;
      return conversations.some((c) => c.parentConversationId === id);
    },
    [conversations]
  );

  // Open the template picker from any source (empty-state button, slash
  // command, palette). Central handler keeps the open state authoritative.
  useEffect(() => {
    function onOpen() {
      setTemplatePickerOpen(true);
    }
    window.addEventListener("ainative.chat.openTemplatePicker", onOpen);
    return () =>
      window.removeEventListener("ainative.chat.openTemplatePicker", onOpen);
  }, []);

  // M4.5: re-submit handler for ExtensionFallbackCard's "Try this" button.
  // The card dispatches a CustomEvent with the compose-alt prompt; we
  // forward it to the session's sendMessage as a new user turn.
  useEffect(() => {
    function onSubmit(e: Event) {
      const ce = e as CustomEvent<{ content: string }>;
      const content = ce.detail?.content;
      if (typeof content === "string" && content.trim()) {
        void sendMessage(content);
      }
    }
    window.addEventListener("ainative-chat-submit", onSubmit);
    return () => window.removeEventListener("ainative-chat-submit", onSubmit);
  }, [sendMessage]);

  // Track streaming state + activeId in refs so the unmount cleanup sees the
  // values at unmount time, not at effect-setup time (closure-capture bug).
  // If ChatShell unmounts while a stream is in flight (user navigated away),
  // log a telemetry breadcrumb. The stream itself continues inside
  // ChatSessionProvider — this log only exists so diagnostics can confirm
  // the provider-hoisting fix is holding. See `src/lib/chat/stream-telemetry.ts`
  // for the full reason code list.
  const isStreamingRef = useRef(isStreaming);
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    return () => {
      if (isStreamingRef.current) {
        // eslint-disable-next-line no-console
        console.info("[chat-stream] client.stream.view-remount", {
          conversationId: activeIdRef.current,
        });
      }
    };
    // Empty deps: exactly-once cleanup on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hydrate provider once with the server-rendered conversation list.
  // Subsequent remounts are no-ops — the provider preserves its state.
  useEffect(() => {
    hydrate({
      conversations: initialConversations,
      initialActiveId: initialActiveId ?? null,
    });
    // Intentionally run only on mount: initialConversations is the
    // server-rendered snapshot for this specific page visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId),
    [conversations, activeId]
  );

  // Extract spawned task IDs from messages (execute_task tool results)
  const spawnedTaskIds = useMemo(() => {
    const taskIds: string[] = [];
    for (const msg of messages) {
      if (msg.metadata) {
        try {
          const meta =
            typeof msg.metadata === "string"
              ? JSON.parse(msg.metadata)
              : msg.metadata;
          if (
            meta.type === "permission_request" &&
            meta.toolName === "mcp__relay__execute_task"
          ) {
            const input = meta.toolInput;
            if (input?.taskId) taskIds.push(input.taskId);
          }
        } catch {
          // Ignore parse errors
        }
      }
      if (msg.role === "assistant" && msg.content) {
        const taskIdMatch = msg.content.match(
          /Execution started.*?taskId["\s:]+([a-f0-9-]{36})/i
        );
        if (taskIdMatch) taskIds.push(taskIdMatch[1]);
      }
    }
    return [...new Set(taskIds)];
  }, [messages]);

  // ── Action wrappers ──────────────────────────────────────────────────
  const handleNewChat = useCallback(async () => {
    await createConversation();
    setMobileListOpen(false);
  }, [createConversation]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveConversation(id);
      setMobileListOpen(false);
    },
    [setActiveConversation]
  );

  const handleDeleteConversation = useCallback(
    (id: string) => deleteConversation(id),
    [deleteConversation]
  );

  const handleRenameConversation = useCallback(
    (id: string, title: string) => renameConversation(id, title),
    [renameConversation]
  );

  const handleSuggestionClick = useCallback(
    (prompt: string) => {
      void sendMessage(prompt);
    },
    [sendMessage]
  );

  const handleMessageStatusChange = useCallback(
    (messageId: string, status: string) => {
      setMessageStatus(
        messageId,
        status as "pending" | "streaming" | "complete" | "error"
      );
    },
    [setMessageStatus]
  );

  // Suppress unused warnings from props we still accept but no longer own.
  // `hydrated` tells us whether the provider has data — we can use it to
  // skip the empty-state flash on a remount that finds existing state.
  void hydrated;

  // ── Render ───────────────────────────────────────────────────────────
  const conversationListContent = (
    <ConversationList
      conversations={conversations}
      activeId={activeId}
      onSelect={handleSelectConversation}
      onNewChat={handleNewChat}
      onDelete={handleDeleteConversation}
      onRename={handleRenameConversation}
      branchingEnabled={session.branchingEnabled}
      hasRelatives={hasRelatives}
      onViewBranches={(id) => setBranchesDialogId(id)}
    />
  );

  return (
    <div className="bg-background">
      <div className="surface-page-shell flex h-[calc(100dvh-var(--chrome-header)-var(--chrome-rail)-6.25rem)] min-h-[30rem] flex-col gap-4 rounded-none border-0 p-5 shadow-none sm:p-6 lg:p-7">
        <div className="mx-auto w-full max-w-6xl">
          <h1 className="text-xl font-semibold tracking-tight">Chat</h1>
        </div>
        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 overflow-hidden rounded-xl border border-border bg-[var(--surface-1)] shadow-[var(--shadow-subtle)]">
          {/* Main chat area */}
          <div className="relative flex min-w-0 flex-1 flex-col">
            {/* Mobile header */}
            <div className="flex items-center gap-2 border-b border-border px-4 py-2 lg:hidden">
              <span className="flex-1 truncate text-sm font-medium">
                {activeConversation?.title ?? "New Chat"}
              </span>
              <Sheet open={mobileListOpen} onOpenChange={setMobileListOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <PanelRightOpen className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[280px] p-0">
                  {conversationListContent}
                </SheetContent>
              </Sheet>
            </div>

            {messages.length === 0 ? (
              /* Hero mode: vertically centered greeting + input + chips */
              <div className="flex flex-1 items-center justify-center overflow-hidden">
                <ChatEmptyState
                  promptCategories={promptCategories}
                  starters={starters}
                  onSuggestionClick={handleSuggestionClick}
                  onSeedComposer={seedComposer}
                  onHoverPreview={setHoverPreview}
                >
                  <ChatInput
                    onSend={sendMessage}
                    onStop={stopStreaming}
                    isStreaming={isStreaming}
                    isHeroMode
                    previewText={hoverPreview}
                    modelId={modelId}
                    savedDefaultModel={savedDefaultModel}
                    onModelChange={setModelId}
                    availableModels={availableModels}
                    projectId={activeConversation?.projectId}
                    conversationId={activeId}
                    seedSignal={seedSignal}
                  />
                  <div className="mt-3 flex justify-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => setTemplatePickerOpen(true)}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Start from template
                    </Button>
                  </div>
                </ChatEmptyState>
              </div>
            ) : (
              <>
                {/* Messages */}
                <div className="min-h-0 flex-1 overflow-hidden">
                  <ChatMessageList
                    messages={messages}
                    isStreaming={isStreaming}
                    conversationId={activeId ?? undefined}
                    onMessageStatusChange={handleMessageStatusChange}
                  />
                </div>

                {/* Background activity indicator */}
                {spawnedTaskIds.length > 0 && (
                  <ChatActivityIndicator taskIds={spawnedTaskIds} />
                )}

                {/* Docked input */}
                <ChatInput
                  onSend={sendMessage}
                  onStop={stopStreaming}
                  isStreaming={isStreaming}
                  isHeroMode={false}
                  modelId={modelId}
                  savedDefaultModel={savedDefaultModel}
                  onModelChange={setModelId}
                  availableModels={availableModels}
                  projectId={activeConversation?.projectId}
                  conversationId={activeId}
                />
              </>
            )}
          </div>

          <ConversationTemplatePicker
            open={templatePickerOpen}
            onOpenChange={setTemplatePickerOpen}
          />

          <BranchesTreeDialog
            open={branchesDialogId != null}
            onOpenChange={(o) => {
              if (!o) setBranchesDialogId(null);
            }}
            conversationId={branchesDialogId}
            onSelect={(id) => {
              setActiveConversation(id);
              setBranchesDialogId(null);
            }}
          />

          {/* Desktop conversation list — right side */}
          <div className="hidden border-border lg:flex lg:w-[280px] lg:flex-col lg:border-l">
            {conversationListContent}
          </div>
        </div>
      </div>
    </div>
  );
}
