"use client";

import { useState, useCallback } from "react";
import type { PromptCategory } from "@/lib/chat/types";
import type { StarterTemplate } from "@/lib/apps/starters";
import {
  Bot,
  Search,
  PlusCircle,
  Bug,
  Zap,
  Sparkles,
  X,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppComposerHero } from "./app-composer-hero";

interface ChatEmptyStateProps {
  promptCategories: PromptCategory[];
  starters?: StarterTemplate[];
  onSuggestionClick: (prompt: string) => void;
  /**
   * Seeds the composer textarea WITHOUT sending. Used by starter cards and
   * example chips, where the prompt is long-form and the user should review
   * before submitting. Distinct from `onSuggestionClick`, which auto-sends
   * (correct for the short prompt-category items in the tabs below).
   */
  onSeedComposer?: (value: string) => void;
  onHoverPreview: (prompt: string | null) => void;
  children?: React.ReactNode;
}

const iconMap: Record<string, typeof Search> = {
  Search,
  PlusCircle,
  Bug,
  Zap,
  Sparkles,
};

export function ChatEmptyState({
  promptCategories,
  starters,
  onSuggestionClick,
  onSeedComposer,
  onHoverPreview,
  children,
}: ChatEmptyStateProps) {
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(
    null
  );

  const handleTabClick = useCallback(
    (categoryId: string) => {
      setExpandedCategoryId((prev) =>
        prev === categoryId ? null : categoryId
      );
      onHoverPreview(null);
    },
    [onHoverPreview]
  );

  const handleClose = useCallback(() => {
    setExpandedCategoryId(null);
    onHoverPreview(null);
  }, [onHoverPreview]);

  const handlePromptHover = useCallback(
    (prompt: string) => {
      onHoverPreview(prompt);
    },
    [onHoverPreview]
  );

  const handlePromptLeave = useCallback(() => {
    onHoverPreview(null);
  }, [onHoverPreview]);

  const handlePromptClick = useCallback(
    (prompt: string) => {
      setExpandedCategoryId(null);
      onHoverPreview(null);
      onSuggestionClick(prompt);
    },
    [onSuggestionClick, onHoverPreview]
  );

  const expandedCategory = promptCategories.find(
    (c) => c.id === expandedCategoryId
  );

  return (
    <div className="flex flex-col items-center px-4 w-full">
      {/* Hero heading */}
      <div className="flex flex-col items-center gap-3 mb-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Bot className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-lg font-semibold">Describe an app. Relay builds it.</h2>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          One prompt builds the whole app: profiles, blueprints, tables, and
          schedules. Or ask anything about your workspace.
        </p>
      </div>

      {/* Input slot */}
      {children && <div className="w-full max-w-2xl mb-4">{children}</div>}

      {/* App composer affordance — starter cards + example prompts. Uses
          onSeedComposer (fill-only) instead of onSuggestionClick (click-to-
          send) because these are long compositional prompts the user should
          review before sending. Falls back to onSuggestionClick when no seed
          handler is wired (legacy callers). */}
      {starters && starters.length > 0 && (
        <div className="w-full flex justify-center mb-6">
          <AppComposerHero
            starters={starters}
            onSeedPrompt={onSeedComposer ?? onSuggestionClick}
          />
        </div>
      )}

      {/* Tabbed prompt selector */}
      <div className="w-full max-w-2xl">
        {expandedCategory ? (
          /* Expanded dropdown panel */
          <div className="border border-border rounded-xl overflow-hidden bg-background elevation-1">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {(() => {
                  const Icon = iconMap[expandedCategory.icon] ?? Search;
                  return <Icon className="h-4 w-4" />;
                })()}
                <span>{expandedCategory.label}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleClose}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Sub-prompts list */}
            <div className="py-1">
              {expandedCategory.prompts.map((prompt, i) => (
                <button
                  key={i}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-left text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors group"
                  onMouseEnter={() => handlePromptHover(prompt.prompt)}
                  onMouseLeave={handlePromptLeave}
                  onClick={() => handlePromptClick(prompt.prompt)}
                >
                  <span>{prompt.label}</span>
                  <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Category tab pills */
          <div className="flex flex-wrap items-center justify-center gap-2">
            {promptCategories.map((category) => {
              const Icon = iconMap[category.icon] ?? Search;
              return (
                <Button
                  key={category.id}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-full h-8 px-3 text-xs"
                  onClick={() => handleTabClick(category.id)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {category.label}
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
