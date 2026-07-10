"use client";

/**
 * ChatSessionProvider — layout-level provider that owns chat session state.
 *
 * Why this exists:
 *
 * Before this provider, every piece of chat-domain state (conversations,
 * messagesByConversation, activeId, isStreaming, abortController) lived in
 * local useState hooks inside `ChatShell`. ChatShell is rendered from
 * `src/app/chat/page.tsx`, which is a route-level component — so navigating
 * away from /chat via the sidebar unmounted ChatShell and destroyed all
 * state. In-flight SSE reader loops ran off into the void, partial assistant
 * messages were lost from client memory (though the server-side
 * finalizeStreamingMessage() salvaged them into the DB), and on return to
 * /chat the `handleSelectConversation` catch block would call
 * `setMessages([])`, wiping visible turn history entirely.
 *
 * By hoisting state into a provider rendered from `src/app/layout.tsx`
 * around `<main>{children}</main>`, the provider — and everything it holds —
 * persists across child-route transitions. ChatShell becomes a thin "view"
 * that reads from the provider via `useChatSession()`. The SSE reader loop
 * runs inside the provider callback, so view unmounts no longer touch it.
 *
 * See `features/chat-session-persistence-provider.md` for the full spec.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ConversationRow, ChatMessageRow } from "@/lib/db/schema";
import { HelpDialog } from "./help-dialog";
import {
  DEFAULT_CHAT_MODEL,
  CHAT_MODELS,
  getRuntimeForModel,
  type ChatModelOption,
} from "@/lib/chat/types";
import type { MentionReference } from "@/hooks/use-chat-autocomplete";
import { randomId } from "@/lib/utils/uuid";

// ── Types ──────────────────────────────────────────────────────────────

interface StreamingState {
  conversationId: string;
  assistantMsgId: string;
  abortController: AbortController;
  startedAt: number;
}

interface ChatSessionValue {
  // State
  conversations: ConversationRow[];
  activeId: string | null;
  messages: ChatMessageRow[]; // messages for the active conversation
  isStreaming: boolean;
  modelId: string;
  savedDefaultModel: string; // the persisted chat.defaultModel, separate from the currently-displayed modelId
  availableModels: ChatModelOption[];
  hydrated: boolean;
  branchingEnabled: boolean;

  // Actions
  hydrate: (payload: {
    conversations: ConversationRow[];
    initialActiveId: string | null;
  }) => void;
  setActiveConversation: (id: string | null, opts?: { skipLoad?: boolean }) => void;
  sendMessage: (content: string, mentions?: MentionReference[]) => Promise<void>;
  stopStreaming: () => void;
  createConversation: (opts?: { title?: string }) => Promise<string | null>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  setMessageStatus: (
    messageId: string,
    status: "pending" | "streaming" | "complete" | "error"
  ) => void;
  setModelId: (modelId: string) => Promise<void>;
  rewindLastTurn: () => Promise<{ rewoundUserContent: string | null }>;
  restoreLastRewoundPair: () => Promise<void>;
  branchConversation: (input: {
    parentConversationId: string;
    branchedFromMessageId: string;
    title?: string;
  }) => Promise<string | null>;
}

const ChatSessionContext = createContext<ChatSessionValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────

/**
 * Wraps the app and owns all chat session state. Rendered from
 * `src/app/layout.tsx` around `<main>{children}</main>` so it survives
 * sidebar navigation.
 */
export function ChatSessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  // ── State ────────────────────────────────────────────────────────────
  // Keyed by conversation id so multiple conversations can hold messages
  // without clobbering each other.
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [messagesByConversation, setMessagesByConversation] = useState<
    Record<string, ChatMessageRow[]>
  >({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [streamingState, setStreamingState] = useState<StreamingState | null>(
    null
  );
  const [modelId, setModelIdState] = useState<string>(DEFAULT_CHAT_MODEL);
  const [savedDefaultModel, setSavedDefaultModel] = useState<string>(DEFAULT_CHAT_MODEL);
  const [availableModels, setAvailableModels] =
    useState<ChatModelOption[]>(CHAT_MODELS);
  const [hydrated, setHydrated] = useState(false);
  const [branchingEnabled, setBranchingEnabled] = useState(false);

  const [helpDialogOpen, setHelpDialogOpen] = useState(false);

  // Refs for values read from async callbacks that mustn't see stale state.
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const modelIdRef = useRef<string>(modelId);
  modelIdRef.current = modelId;
  const messagesByConversationRef = useRef<Record<string, ChatMessageRow[]>>({});
  messagesByConversationRef.current = messagesByConversation;

  // ── One-time model + available-models fetch ──────────────────────────
  // Runs once per page load (provider lives in root layout, not /chat page).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/chat")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.defaultModel) {
          setModelIdState(data.defaultModel);
          setSavedDefaultModel(data.defaultModel);
        }
      })
      .catch(() => {});

    fetch("/api/chat/models")
      .then((r) => (r.ok ? r.json() : null))
      .then((models) => {
        if (!cancelled && models?.length) {
          setAvailableModels(models);
        }
      })
      .catch(() => {});

    fetch("/api/chat/branching/flag")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && typeof data?.enabled === "boolean") {
          setBranchingEnabled(data.enabled);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Hydration from server-rendered page ──────────────────────────────
  // ChatShell calls this on mount with the conversations loaded by
  // `src/app/chat/page.tsx`. On first call we populate everything. On
  // subsequent calls (remount after navigation) we only refresh the
  // conversation list — we do NOT clobber in-memory streaming state or
  // messagesByConversation, which may contain a partial assistant message
  // that is still streaming.
  const hydrate = useCallback(
    (payload: {
      conversations: ConversationRow[];
      initialActiveId: string | null;
    }) => {
      setConversations(payload.conversations);
      setHydrated((already) => {
        if (already) return true;
        // First-time hydration: restore active id from URL/prop, then from localStorage.
        let restoredId = payload.initialActiveId;
        if (!restoredId) {
          try {
            restoredId = localStorage.getItem("ainative-active-chat") || null;
          } catch {
            /* localStorage unavailable */
          }
        }
        if (
          restoredId &&
          payload.conversations.some((c) => c.id === restoredId)
        ) {
          setActiveId(restoredId);
          // Fetch messages for the restored conversation. On failure we
          // do NOT clear — we leave messages as-is (empty on first load)
          // and surface a toast.
          void loadMessagesForConversation(restoredId);
        }
        return true;
      });
    },
    // loadMessagesForConversation is stable via useCallback below
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ── Message loading ──────────────────────────────────────────────────
  const loadMessagesForConversation = useCallback(
    async (conversationId: string): Promise<void> => {
      try {
        const res = await fetch(
          `/api/chat/conversations/${conversationId}/messages`
        );
        if (!res.ok) {
          // IMPORTANT: do NOT clear existing messages on failure. The old
          // ChatShell catch-all was `setMessages([])`, which wiped visible
          // turn history on any fetch hiccup. Preserve what we have and
          // surface a non-blocking toast.
          toast.error("Failed to load conversation messages");
          return;
        }
        const rows = (await res.json()) as ChatMessageRow[];
        // Clean up stale "streaming" rows from interrupted prior sessions.
        // The server's reconcile sweep handles this as a safety net, but
        // normalize on the client so the UI never shows a permanent spinner.
        const cleaned = rows.map((m) =>
          m.status === "streaming"
            ? { ...m, status: "complete" as const }
            : m
        );
        setMessagesByConversation((prev) => ({
          ...prev,
          [conversationId]: cleaned,
        }));
      } catch (err) {
        // Network failure — same policy, do NOT clear.
        console.warn(
          "[chat-session] loadMessagesForConversation failed:",
          err
        );
      }
    },
    []
  );

  // ── Conversation selection ───────────────────────────────────────────
  const setActiveConversation = useCallback(
    (id: string | null, opts?: { skipLoad?: boolean }) => {
      setActiveId(id);
      try {
        if (id) localStorage.setItem("ainative-active-chat", id);
        else localStorage.removeItem("ainative-active-chat");
      } catch {
        /* localStorage unavailable */
      }
      // Only update URL when we're on /chat. If the user clicked a
      // conversation from a different route (unlikely today but possible
      // via future deep links), leave their current location alone.
      if (typeof window !== "undefined" && window.location.pathname === "/chat") {
        router.replace(id ? `/chat?c=${id}` : "/chat", { scroll: false });
      }
      if (id && !opts?.skipLoad && !messagesByConversation[id]) {
        void loadMessagesForConversation(id);
      }
      // Also refresh conversation metadata (title, model, etc.) in the
      // background. Failure is non-blocking.
      if (id) {
        fetch(`/api/chat/conversations/${id}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((conv) => {
            if (conv?.modelId) setModelIdState(conv.modelId);
          })
          .catch(() => {});
      }
    },
    [messagesByConversation, loadMessagesForConversation, router]
  );

  // ── Conversation CRUD ────────────────────────────────────────────────
  const createConversation = useCallback(
    async (opts?: { title?: string }): Promise<string | null> => {
    try {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runtimeId: getRuntimeForModel(modelIdRef.current),
          modelId: modelIdRef.current,
          ...(opts?.title ? { title: opts.title } : {}),
        }),
      });
      if (!res.ok) {
        // Never swallow a create failure silently again (#30): a rejected
        // runtime/model used to clear the composer with no signal at all.
        const detail = await res
          .json()
          .then((b) => (b as { error?: string })?.error)
          .catch(() => null);
        toast.error(detail || "Couldn't start a chat with this model. Try another model.");
        return null;
      }
      const conversation = (await res.json()) as ConversationRow;
      setConversations((prev) => [conversation, ...prev]);
      // Set empty messages BEFORE activating so the conversation has an
      // entry in messagesByConversation. Use skipLoad to prevent
      // setActiveConversation from firing an async loadMessagesForConversation
      // that would race with the optimistic messages added by sendMessage().
      setMessagesByConversation((prev) => ({
        ...prev,
        [conversation.id]: [],
      }));
      setActiveConversation(conversation.id, { skipLoad: true });
      return conversation.id;
    } catch {
      return null;
    }
  },
    [setActiveConversation]
  );

  // ── Environment rescan on conversation activation ────────────────────
  // Fire-and-forget; endpoint self-guards with shouldRescan() (5min TTL).
  useEffect(() => {
    if (!activeId) return;
    fetch("/api/environment/rescan-if-stale", { method: "POST" }).catch(() => {});
  }, [activeId]);

  // ── Chat command event listeners ─────────────────────────────────────
  // Handles CustomEvents dispatched by chat-input.tsx (⌘L, slash commands).
  useEffect(() => {
    const handleClear = () => {
      void createConversation();
    };
    const handleCompact = () => {
      toast.info("Compact is not wired yet. Coming soon.");
    };
    const handleExport = async () => {
      const activeConversationId = activeIdRef.current;
      const msgs = activeConversationId
        ? messagesByConversationRef.current[activeConversationId]
        : undefined;
      if (!msgs || msgs.length === 0) {
        toast.error("Nothing to export. This conversation is empty.");
        return;
      }
      const title = `Chat — ${new Date().toISOString().slice(0, 10)}`;
      const markdown = msgs
        .map((m) => `### ${m.role === "user" ? "You" : "Assistant"}\n\n${m.content}`)
        .join("\n\n---\n\n");
      try {
        const res = await fetch("/api/chat/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            markdown,
            conversationId: activeConversationId,
          }),
        });
        if (!res.ok) throw new Error(`Export failed: ${res.status}`);
        toast.success("Conversation exported to documents.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Export failed");
      }
    };
    const handleHelp = () => setHelpDialogOpen(true);

    window.addEventListener("ainative.chat.clear", handleClear);
    window.addEventListener("ainative.chat.compact", handleCompact);
    window.addEventListener("ainative.chat.export", handleExport);
    window.addEventListener("ainative.chat.help", handleHelp);

    return () => {
      window.removeEventListener("ainative.chat.clear", handleClear);
      window.removeEventListener("ainative.chat.compact", handleCompact);
      window.removeEventListener("ainative.chat.export", handleExport);
      window.removeEventListener("ainative.chat.help", handleHelp);
    };
  }, [createConversation]);

  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/chat/conversations/${id}`, { method: "DELETE" });
        setConversations((prev) => prev.filter((c) => c.id !== id));
        setMessagesByConversation((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        if (activeIdRef.current === id) {
          setActiveConversation(null);
        }
      } catch {
        toast.error("Failed to delete conversation");
      }
    },
    [setActiveConversation]
  );

  const renameConversation = useCallback(async (id: string, title: string) => {
    try {
      const res = await fetch(`/api/chat/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        const updated = (await res.json()) as ConversationRow;
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? updated : c))
        );
      }
    } catch {
      toast.error("Failed to rename conversation");
    }
  }, []);

  // ── Message status (used by inline permission / question UI) ─────────
  const setMessageStatus = useCallback(
    (
      messageId: string,
      status: "pending" | "streaming" | "complete" | "error"
    ) => {
      setMessagesByConversation((prev) => {
        const next: Record<string, ChatMessageRow[]> = {};
        for (const [convId, msgs] of Object.entries(prev)) {
          next[convId] = msgs.map((m) =>
            m.id === messageId ? { ...m, status } : m
          );
        }
        return next;
      });
    },
    []
  );

  // ── Model selection ──────────────────────────────────────────────────
  const setModelId = useCallback(async (newModelId: string) => {
    setModelIdState(newModelId);
    const currentActive = activeIdRef.current;
    if (currentActive) {
      const newRuntimeId = getRuntimeForModel(newModelId);
      try {
        await fetch(`/api/chat/conversations/${currentActive}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelId: newModelId, runtimeId: newRuntimeId }),
        });
      } catch {
        /* non-fatal */
      }
      setConversations((prev) =>
        prev.map((c) =>
          c.id === currentActive
            ? { ...c, modelId: newModelId, runtimeId: newRuntimeId }
            : c
        )
      );
    }
  }, []);

  // ── Settings-cascade listener ────────────────────────────────────────
  // When the routing cascade (or any other surface) writes a new
  // chat.defaultModel, the provider's local modelId would otherwise stay
  // stale until a full page reload. This listener keeps the dropdown and
  // the active conversation in sync immediately.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ modelId?: string }>).detail;
      if (!detail?.modelId) return;
      setSavedDefaultModel(detail.modelId);
      void setModelId(detail.modelId);
    };
    window.addEventListener("ainative.chat.default-model-changed", handler);
    return () => {
      window.removeEventListener("ainative.chat.default-model-changed", handler);
    };
  }, [setModelId]);

  // ── Branching: rewind / redo / branch ──────────────────────────────
  // After a successful rewind/redo we re-fetch messages from the server.
  // The optimistic user message inserted by `sendMessage` keeps its
  // client-side `randomId()` even after the SSE `done` event
  // (only the assistant id is reconciled to the server id). The server's
  // markPair/restoreLatestRewoundPair return server-assigned ids; doing a
  // pure client-side optimistic update by id misses the user message,
  // leaving it rewound in the UI even though the DB cleared it. Refetching
  // converges the client to DB truth in one extra round-trip per action.
  const rewindLastTurn = useCallback(
    async (): Promise<{ rewoundUserContent: string | null }> => {
      const convId = activeIdRef.current;
      if (!convId) return { rewoundUserContent: null };
      const msgs = messagesByConversationRef.current[convId] ?? [];
      let target: ChatMessageRow | null = null;
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (m.role === "assistant" && m.rewoundAt == null) {
          target = m;
          break;
        }
      }
      if (!target) return { rewoundUserContent: null };

      try {
        const res = await fetch(
          `/api/chat/conversations/${convId}/rewind`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assistantMessageId: target.id }),
          }
        );
        if (!res.ok) return { rewoundUserContent: null };
        const data = (await res.json()) as { rewoundUserContent: string | null };
        await loadMessagesForConversation(convId);
        return data;
      } catch {
        return { rewoundUserContent: null };
      }
    },
    [loadMessagesForConversation]
  );

  const restoreLastRewoundPair = useCallback(async (): Promise<void> => {
    const convId = activeIdRef.current;
    if (!convId) return;
    try {
      const res = await fetch(
        `/api/chat/conversations/${convId}/redo`,
        { method: "POST" }
      );
      if (!res.ok) return;
      await loadMessagesForConversation(convId);
    } catch {
      /* non-fatal */
    }
  }, [loadMessagesForConversation]);

  const branchConversation = useCallback(
    async (input: {
      parentConversationId: string;
      branchedFromMessageId: string;
      title?: string;
    }): Promise<string | null> => {
      try {
        const res = await fetch("/api/chat/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runtimeId: getRuntimeForModel(modelIdRef.current),
            modelId: modelIdRef.current,
            parentConversationId: input.parentConversationId,
            branchedFromMessageId: input.branchedFromMessageId,
            ...(input.title ? { title: input.title } : {}),
          }),
        });
        if (!res.ok) {
          toast.error("Failed to create branch");
          return null;
        }
        const conversation = (await res.json()) as ConversationRow;
        setConversations((prev) => [conversation, ...prev]);
        setMessagesByConversation((prev) => ({
          ...prev,
          [conversation.id]: [],
        }));
        setActiveConversation(conversation.id, { skipLoad: true });
        return conversation.id;
      } catch {
        toast.error("Failed to create branch");
        return null;
      }
    },
    [setActiveConversation]
  );

  // ── Streaming: sendMessage + stopStreaming ──────────────────────────
  // The SSE reader loop runs inside the provider. If the consumer view
  // (ChatShell) unmounts mid-stream, this loop continues — state updates
  // go to the provider, which is still mounted from the root layout.
  const sendMessage = useCallback(
    async (content: string, mentions?: MentionReference[]): Promise<void> => {
      let conversationId = activeIdRef.current;

      // Create conversation on first message if none active
      if (!conversationId) {
        conversationId = await createConversation();
        if (!conversationId) return;
      }

      // Optimistic user message
      const userMsg: ChatMessageRow = {
        id: randomId(),
        conversationId,
        role: "user",
        content,
        metadata: null,
        status: "complete",
        rewoundAt: null,
        createdAt: new Date(),
      };

      // Placeholder assistant message
      const assistantMsgId = randomId();
      const assistantMsg: ChatMessageRow = {
        id: assistantMsgId,
        conversationId,
        role: "assistant",
        content: "",
        metadata: null,
        status: "streaming",
        rewoundAt: null,
        createdAt: new Date(),
      };

      setMessagesByConversation((prev) => ({
        ...prev,
        [conversationId!]: [...(prev[conversationId!] ?? []), userMsg, assistantMsg],
      }));

      const controller = new AbortController();
      const startedAt = Date.now();
      setStreamingState({
        conversationId,
        assistantMsgId,
        abortController: controller,
        startedAt,
      });

      // Capture conversationId in a local (non-null) binding for callbacks
      const convId = conversationId;

      try {
        const res = await fetch(
          `/api/chat/conversations/${convId}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, mentions }),
            signal: controller.signal,
          }
        );

        if (!res.ok || !res.body) {
          throw new Error("Failed to send message");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // Helper: update the single assistant message being streamed,
        // without touching any other conversation's state.
        const updateAssistant = (
          updater: (msg: ChatMessageRow) => ChatMessageRow
        ) => {
          setMessagesByConversation((prev) => {
            const msgs = prev[convId] ?? [];
            return {
              ...prev,
              [convId]: msgs.map((m) =>
                m.id === assistantMsgId ? updater(m) : m
              ),
            };
          });
        };

        const appendMessage = (msg: ChatMessageRow) => {
          setMessagesByConversation((prev) => ({
            ...prev,
            [convId]: [...(prev[convId] ?? []), msg],
          }));
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.info("[chat-stream] client.stream.done", {
              conversationId: convId,
              messageId: assistantMsgId,
              durationMs: Date.now() - startedAt,
            });
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6);
            try {
              const event = JSON.parse(json);
              if (event.type === "status") {
                updateAssistant((m) => ({
                  ...m,
                  metadata: JSON.stringify({
                    statusPhase: event.phase,
                    statusMessage: event.message,
                  }),
                }));
              } else if (event.type === "delta") {
                updateAssistant((m) => ({
                  ...m,
                  content: m.content + event.content,
                }));
              } else if (event.type === "done") {
                updateAssistant((m) => {
                  const existing = m.metadata
                    ? (() => {
                        try {
                          return JSON.parse(m.metadata!);
                        } catch {
                          return {};
                        }
                      })()
                    : {};
                  if (event.quickAccess?.length) {
                    existing.quickAccess = event.quickAccess;
                  }
                  // Forward composedApp / extensionFallback metadata so the
                  // matching cards (ComposedAppCard, ExtensionFallbackCard)
                  // render on stream completion without requiring a reload.
                  // Server has already persisted these to chat_messages.metadata.
                  if (event.composedApp) {
                    existing.composedApp = event.composedApp;
                  }
                  if (event.extensionFallback) {
                    existing.extensionFallback = event.extensionFallback;
                  }
                  if (event.fallbackReason) {
                    existing.fallbackReason = event.fallbackReason;
                  }
                  // Effective model ID drives the model-label rendering and is
                  // the gate for the fallback chip block. Without it, the chip
                  // stays hidden even when fallbackReason is set.
                  if (event.modelId) {
                    existing.modelId = event.modelId;
                  }
                  return {
                    ...m,
                    id: event.messageId,
                    status: "complete",
                    metadata: JSON.stringify(existing),
                  };
                });
                // Refresh conversation title from server (auto-generated on
                // first exchange).
                fetch(`/api/chat/conversations/${convId}`)
                  .then((r) => (r.ok ? r.json() : null))
                  .then((conv) => {
                    if (conv) {
                      setConversations((prev) =>
                        prev.map((c) =>
                          c.id === convId
                            ? { ...c, title: conv.title, updatedAt: new Date() }
                            : c
                        )
                      );
                    }
                  })
                  .catch(() => {});

              } else if (
                event.type === "permission_request" ||
                event.type === "question"
              ) {
                const systemMsg: ChatMessageRow = {
                  id: event.messageId,
                  conversationId: convId,
                  role: "system",
                  rewoundAt: null,
                  content:
                    event.type === "permission_request"
                      ? `Permission required: ${event.toolName}`
                      : "Agent has a question",
                  metadata: JSON.stringify(
                    event.type === "permission_request"
                      ? {
                          type: "permission_request",
                          requestId: event.requestId,
                          toolName: event.toolName,
                          toolInput: event.toolInput,
                        }
                      : {
                          type: "question",
                          requestId: event.requestId,
                          questions: event.questions,
                        }
                  ),
                  status: "pending",
                  createdAt: new Date(),
                };
                appendMessage(systemMsg);
              } else if (event.type === "screenshot") {
                updateAssistant((m) => {
                  const meta = m.metadata
                    ? (() => {
                        try {
                          return JSON.parse(m.metadata!);
                        } catch {
                          return {};
                        }
                      })()
                    : {};
                  const attachments = Array.isArray(meta.attachments)
                    ? meta.attachments
                    : [];
                  attachments.push({
                    documentId: event.documentId,
                    thumbnailUrl: event.thumbnailUrl,
                    originalUrl: event.originalUrl,
                    width: event.width,
                    height: event.height,
                  });
                  return {
                    ...m,
                    metadata: JSON.stringify({ ...meta, attachments }),
                  };
                });
              } else if (event.type === "error") {
                updateAssistant((m) => ({
                  ...m,
                  content: m.content || event.message,
                  status: "error",
                }));
              }
            } catch {
              // Ignore malformed SSE data
            }
          }
        }
      } catch (error) {
        const isAbort = (error as Error).name === "AbortError";
        if (isAbort) {
          console.info("[chat-stream] client.stream.user-abort", {
            conversationId: convId,
            messageId: assistantMsgId,
            durationMs: Date.now() - startedAt,
          });
        } else {
          console.info("[chat-stream] client.stream.reader-error", {
            conversationId: convId,
            messageId: assistantMsgId,
            durationMs: Date.now() - startedAt,
            error: (error as Error).message,
          });
          setMessagesByConversation((prev) => {
            const msgs = prev[convId] ?? [];
            return {
              ...prev,
              [convId]: msgs.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content:
                        m.content || "Failed to get response. Please try again.",
                      status: "error",
                    }
                  : m
              ),
            };
          });
        }
      } finally {
        setStreamingState(null);
      }
    },
    [createConversation]
  );

  const stopStreaming = useCallback(() => {
    setStreamingState((current) => {
      current?.abortController.abort();
      return current;
    });
  }, []);

  // ── Derived: messages for the active conversation ───────────────────
  const messages = useMemo<ChatMessageRow[]>(
    () => (activeId ? messagesByConversation[activeId] ?? [] : []),
    [activeId, messagesByConversation]
  );

  const isStreaming = streamingState !== null;

  const value = useMemo<ChatSessionValue>(
    () => ({
      conversations,
      activeId,
      messages,
      isStreaming,
      modelId,
      savedDefaultModel,
      availableModels,
      hydrated,
      branchingEnabled,
      hydrate,
      setActiveConversation,
      sendMessage,
      stopStreaming,
      createConversation,
      deleteConversation,
      renameConversation,
      setMessageStatus,
      setModelId,
      rewindLastTurn,
      restoreLastRewoundPair,
      branchConversation,
    }),
    [
      conversations,
      activeId,
      messages,
      isStreaming,
      modelId,
      savedDefaultModel,
      availableModels,
      hydrated,
      branchingEnabled,
      hydrate,
      setActiveConversation,
      sendMessage,
      stopStreaming,
      createConversation,
      deleteConversation,
      renameConversation,
      setMessageStatus,
      setModelId,
      rewindLastTurn,
      restoreLastRewoundPair,
      branchConversation,
    ]
  );

  return (
    <ChatSessionContext.Provider value={value}>
      {children}
      <HelpDialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen} />
    </ChatSessionContext.Provider>
  );
}

/**
 * Consume chat session state and actions. Throws if called outside a
 * `ChatSessionProvider` — that is always a bug and we'd rather fail loud
 * than render stale state.
 */
export function useChatSession(): ChatSessionValue {
  const ctx = useContext(ChatSessionContext);
  if (!ctx) {
    throw new Error(
      "useChatSession must be used within a ChatSessionProvider"
    );
  }
  return ctx;
}
