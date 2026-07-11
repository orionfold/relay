"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatModelSelector } from "./chat-model-selector";
import { ChatCommandPopover } from "./chat-command-popover";
import { CapabilityBanner } from "./capability-banner";
import { useChatAutocomplete, type MentionReference } from "@/hooks/use-chat-autocomplete";
import { getToolCatalog } from "@/lib/chat/tool-catalog";
import { useProjectSkills } from "@/hooks/use-project-skills";
import { toggleTheme } from "@/lib/theme";
import type { ChatModelOption } from "@/lib/chat/types";
import { getRuntimeForModel } from "@/lib/chat/types";
import { resolveAgentRuntime } from "@/lib/agents/runtime/catalog";
import { useChatSession } from "./chat-session-provider";

interface ChatInputProps {
  onSend: (content: string, mentions?: MentionReference[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  isHeroMode: boolean;
  previewText?: string | null;
  modelId?: string;
  savedDefaultModel?: string;
  onModelChange?: (modelId: string) => void;
  availableModels?: ChatModelOption[];
  projectId?: string | null;
  /**
   * Conversation id. When set, the input hydrates an initial draft from
   * `sessionStorage["chat:prefill:<id>"]` on mount (one-shot, removed after
   * read). Used by the conversation-template-picker to seed the composer
   * without a schema change.
   */
  conversationId?: string | null;
  /**
   * Imperative seed signal — when `seedSignal.nonce` changes, the textarea
   * value is replaced with `seedSignal.value`. Used by the chat hero's
   * starter cards and example chips, which need to fill the input WITHOUT
   * auto-submitting (so the user can review and edit a long compositional
   * prompt before sending). The nonce-driven design lets the same value be
   * re-seeded on repeated clicks.
   */
  seedSignal?: { value: string; nonce: number };
}

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  isHeroMode,
  previewText,
  modelId,
  savedDefaultModel,
  onModelChange,
  availableModels,
  projectId,
  conversationId,
  seedSignal,
}: ChatInputProps) {
  const router = useRouter();
  const [value, setValue] = useState("");

  // External seed: starter cards / example chips set this to fill the
  // composer without sending. Watching the nonce (not the value) lets the
  // same prompt be re-seeded if the user clicks the same card twice.
  // We track the last consumed nonce so that ChatInput remounts (e.g. when a
  // new conversation is created from a starter click) don't re-apply a stale
  // seed at mount time. Initialize to whatever nonce was current at mount —
  // any subsequent change is a fresh user click and should fire.
  // Track the last consumed nonce so a stale seedSignal can't re-fire on
  // ChatInput remount (e.g. when a starter click creates a new conversation,
  // the input remounts with the same in-memory seedSignal). Initializing the
  // ref to the current nonce skips that initial application; later changes
  // via parent click are real user actions and seed normally.
  const consumedNonceRef = useRef<number>(seedSignal?.nonce ?? 0);
  useEffect(() => {
    const nonce = seedSignal?.nonce ?? 0;
    if (nonce === 0 || nonce === consumedNonceRef.current) return;
    consumedNonceRef.current = nonce;
    setValue(seedSignal!.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedSignal?.nonce]);

  const session = useChatSession();
  const branchingEnabled = session.branchingEnabled;
  const rewindLastTurn = session.rewindLastTurn;
  const restoreLastRewoundPair = session.restoreLastRewoundPair;

  // One-shot hydration from sessionStorage when this input mounts for a
  // conversation that was just created from a template. Two keys:
  //  1. `chat:prefill:<id>` — per-id slot (survives across hero→docked mount)
  //  2. `chat:prefill:pending` — id-less slot written by the template picker
  //     BEFORE it awaits createConversation (race-order safe: by the time
  //     createConversation resolves, this effect has already fired).
  // Key is removed after read so page reload doesn't re-inject.
  useEffect(() => {
    if (!conversationId) return;
    try {
      const idKey = `chat:prefill:${conversationId}`;
      const byId = window.sessionStorage.getItem(idKey);
      const pending = window.sessionStorage.getItem("chat:prefill:pending");
      const seed = byId ?? pending;
      if (seed && seed.length > 0) {
        setValue(seed);
      }
      // Always clear both slots after consumption so reload / nav doesn't
      // re-inject. Clearing even when seed is null is safe — the keys either
      // don't exist (noop) or belong to a stale prior flow.
      window.sessionStorage.removeItem(idKey);
      window.sessionStorage.removeItem("chat:prefill:pending");
    } catch {
      // sessionStorage access can throw in some browser modes — silently
      // fall back to an empty composer.
    }
  }, [conversationId]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autocomplete = useChatAutocomplete({ projectId });
  const { skills: projectSkills } = useProjectSkills(projectId);

  const effectiveRuntime = resolveAgentRuntime(
    modelId ? getRuntimeForModel(modelId) : null
  );

  // Sync textarea ref with autocomplete hook
  useEffect(() => {
    autocomplete.setTextareaRef(textareaRef.current);
  }, [autocomplete.setTextareaRef]);

  // Auto-focus on mount and after sending
  useEffect(() => {
    textareaRef.current?.focus();
  }, [isStreaming]);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed, autocomplete.mentions.length > 0 ? autocomplete.mentions : undefined);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, isStreaming, onSend, autocomplete.mentions]);

  const executeSessionCommand = useCallback((name: string) => {
    switch (name) {
      case "toggle_theme":
        toggleTheme();
        return;
      case "mark_all_read":
        fetch("/api/notifications/mark-all-read", { method: "PATCH" });
        return;
      case "clear":
        window.dispatchEvent(new CustomEvent("ainative.chat.clear"));
        return;
      case "compact":
        window.dispatchEvent(new CustomEvent("ainative.chat.compact"));
        return;
      case "export":
        window.dispatchEvent(new CustomEvent("ainative.chat.export"));
        return;
      case "help":
        window.dispatchEvent(new CustomEvent("ainative.chat.help"));
        return;
      case "settings":
        router.push("/settings");
        return;
      case "new-from-template":
        window.dispatchEvent(new CustomEvent("ainative.chat.openTemplatePicker"));
        return;
    }
  }, [router]);

  // Auto-resize textarea
  const handleInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Let autocomplete handle keys first when popover is open
      if (autocomplete.handleKeyDown(e)) {
        return;
      }

      const cmd = e.metaKey || e.ctrlKey;
      // ⌘⇧Z / Ctrl+Shift+Z — restore most recently rewound pair (must come
      // before the plain ⌘Z handler to win the same key event).
      if (cmd && e.shiftKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (branchingEnabled) {
          void restoreLastRewoundPair();
        }
        return;
      }
      // ⌘Z / Ctrl+Z — rewind last turn and pre-fill composer
      if (cmd && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (!branchingEnabled) return;
        void rewindLastTurn().then((result) => {
          if (result.rewoundUserContent != null) {
            setValue(result.rewoundUserContent);
            requestAnimationFrame(() => {
              textareaRef.current?.focus();
              handleInput();
            });
          }
        });
        return;
      }
      if (cmd && (e.key === "l" || e.key === "L")) {
        e.preventDefault();
        if (!isStreaming) executeSessionCommand("clear");
        return;
      }
      if (cmd && e.key === "/") {
        e.preventDefault();
        textareaRef.current?.focus();
        setValue((v) => (v.startsWith("/") ? v : "/" + v));
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            autocomplete.handleChange(textareaRef.current.value, textareaRef.current);
          }
        });
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      if (e.key === "Escape") {
        textareaRef.current?.blur();
      }
    },
    [
      handleSend,
      autocomplete.handleKeyDown,
      autocomplete.handleChange,
      executeSessionCommand,
      isStreaming,
      branchingEnabled,
      rewindLastTurn,
      restoreLastRewoundPair,
      handleInput,
    ]
  );


  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setValue(newValue);
      handleInput();
      // Notify autocomplete of text changes (must happen after setValue so selectionStart is current)
      requestAnimationFrame(() => {
        autocomplete.handleChange(newValue, textareaRef.current);
      });
    },
    [handleInput, autocomplete.handleChange]
  );

  const handlePopoverSelect = useCallback(
    (item: {
      type: "slash" | "mention";
      id: string;
      label: string;
      text?: string;
      entityType?: string;
      entityId?: string;
    }) => {
      if (item.type === "slash") {
        const entry = getToolCatalog({ includeBrowser: true }).find((t) => t.name === item.id);
        if (entry?.behavior === "execute_immediately") {
          autocomplete.close();
          setValue("");
          executeSessionCommand(entry.name);
          return;
        }
      }

      // For insert_template slash commands and mentions, update textarea value
      const newValue = autocomplete.handleSelect(item);
      if (newValue !== undefined) {
        setValue(newValue);
        handleInput();
        // Refocus textarea
        requestAnimationFrame(() => {
          textareaRef.current?.focus();
        });
      }
    },
    [autocomplete, handleInput, executeSessionCommand]
  );

  // Show preview text in placeholder when hovering a suggestion
  const placeholder = previewText || "Ask anything... (/ for tools, @ for mentions)";

  return (
    <div
      className={cn(
        isHeroMode
          ? "w-full"
          : "sticky bottom-0 bg-transparent pb-[env(safe-area-inset-bottom)]"
      )}
    >
      <div
        className={cn(
          "mx-auto px-4 py-3",
          isHeroMode ? "max-w-2xl" : "max-w-3xl"
        )}
      >
        <div
          className={cn(
            "flex flex-col elevation-2 border border-border",
            isHeroMode ? "rounded-2xl" : "rounded-xl",
            isHeroMode ? "bg-background" : "bg-[var(--surface-1)]"
          )}
        >
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={cn(
              "w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground max-h-[200px] px-4 pt-3",
              isHeroMode ? "min-h-[80px]" : "min-h-[72px]"
            )}
            rows={isHeroMode ? 3 : 3}
            disabled={isStreaming}
          />

          {/* Toolbar row */}
          <div className="flex items-center justify-between px-3 pb-2 pt-1">
            <div className="flex items-center gap-1">
              {modelId && onModelChange && (
                <ChatModelSelector
                  modelId={modelId}
                  savedDefaultModel={savedDefaultModel}
                  onModelChange={onModelChange}
                  models={availableModels}
                />
              )}
            </div>
            <div className="flex items-center gap-1">
              {isStreaming && (
                <Button
                  variant="destructive"
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-lg"
                  onClick={onStop}
                >
                  <Square className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {!isStreaming && (
        <div className="mx-auto max-w-3xl">
          <CapabilityBanner runtimeId={effectiveRuntime} />
        </div>
      )}

      {/* Autocomplete popover — rendered via portal */}
      <ChatCommandPopover
        open={autocomplete.state.open}
        mode={autocomplete.state.mode}
        query={autocomplete.state.query}
        anchorRect={autocomplete.state.anchorRect}
        entityResults={autocomplete.entityResults}
        entityLoading={autocomplete.entityLoading}
        projectProfiles={projectSkills.length > 0 ? projectSkills : undefined}
        activeTab={autocomplete.activeTab}
        onTabChange={autocomplete.setActiveTab}
        onSelect={handlePopoverSelect}
        onClose={autocomplete.close}
        conversationId={conversationId}
      />
    </div>
  );
}
