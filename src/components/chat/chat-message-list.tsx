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
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  // Auto-scroll to bottom when new messages arrive (unless user scrolled up)
  useEffect(() => {
    if (!userScrolledUp) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, userScrolledUp]);

  // Detect page scroll position. The chat route uses viewport/page scrolling so
  // the composer can stay docked above the browser bottom.
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const isNearBottom = distanceFromBottom < 100;

      setShowScrollButton(!isNearBottom);
      setUserScrolledUp(!isNearBottom);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setUserScrolledUp(false);
  };

  return (
    <div className="relative">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
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
        <div className="fixed bottom-36 left-1/2 z-20 -translate-x-1/2">
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
