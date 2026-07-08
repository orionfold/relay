"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessageRow } from "@/lib/db/schema";
import { ChatMessage } from "./chat-message";
import { Button } from "@/components/ui/button";
import { ArrowDown } from "lucide-react";

interface ChatMessageListProps {
  messages: ChatMessageRow[];
  isStreaming: boolean;
  conversationId?: string;
  onMessageStatusChange?: (messageId: string, status: string) => void;
}

export function ChatMessageList({
  messages,
  isStreaming,
  conversationId,
  onMessageStatusChange,
}: ChatMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  // Auto-scroll to bottom when new messages arrive (unless user scrolled up)
  useEffect(() => {
    if (!userScrolledUp) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, userScrolledUp]);

  // Detect scroll position
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const isNearBottom = distanceFromBottom < 100;

      setShowScrollButton(!isNearBottom);
      setUserScrolledUp(!isNearBottom);
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setUserScrolledUp(false);
  };

  return (
    <div ref={scrollRef} className="relative h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            isStreaming={isStreaming && msg.status === "streaming"}
            conversationId={conversationId}
            onStatusChange={onMessageStatusChange}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom FAB */}
      {showScrollButton && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-full shadow-md"
            onClick={scrollToBottom}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
