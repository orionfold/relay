"use client";

import { useEffect, useState } from "react";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL, type ChatModelOption } from "@/lib/chat/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatModelSelectorProps {
  modelId: string;
  /**
   * The user's saved chat.defaultModel. Used to mark the "(Default)" suffix
   * on whichever model is currently their default. Falls back to the
   * hardcoded DEFAULT_CHAT_MODEL when undefined (pre-settings environments).
   */
  savedDefaultModel?: string;
  onModelChange: (modelId: string) => void;
  models?: ChatModelOption[];
}

const tierEmoji: Record<string, string> = {
  Fast: "\u26A1",
  Balanced: "\u2728",
  Best: "\uD83D\uDC8E",
  "Configured endpoint": "\u25C9",
  Gateway: "\u21C4",
  Server: "\u25C9",
};

export function ChatModelSelector({
  modelId,
  savedDefaultModel,
  onModelChange,
  models = CHAT_MODELS,
}: ChatModelSelectorProps) {
  const effectiveDefault = savedDefaultModel ?? DEFAULT_CHAT_MODEL;
  const [ollamaModels, setOllamaModels] = useState<ChatModelOption[]>([]);

  // Fetch available Ollama models on mount
  useEffect(() => {
    fetch("/api/runtimes/ollama")
      .then((r) => (r.ok ? r.json() : { models: [] }))
      .then((data: { models?: Array<{ name: string; details?: { parameter_size?: string } }> }) => {
        const models = (data.models ?? []).map((m) => ({
          id: `ollama:${m.name}`,
          label: m.name.replace(/:latest$/, ""),
          provider: "ollama" as const,
          tier: "Configured endpoint",
          costLabel: "Cost varies",
        }));
        setOllamaModels(models);
      })
      .catch(() => {});
  }, []);

  const allModels = [...models, ...ollamaModels];
  const current = allModels.find((m) => m.id === modelId) ?? allModels[0] ?? { id: modelId, label: modelId, provider: "anthropic" as const, tier: "Balanced", costLabel: "$$" };

  const anthropicModels = models.filter(
    (m) => m.provider === "anthropic"
  );
  const openaiModels = models.filter((m) => m.provider === "openai");
  const liteLLMModels = models.filter((m) => m.provider === "litellm");
  const lmStudioModels = models.filter((m) => m.provider === "lmstudio");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          {current.label}{modelId === effectiveDefault ? " (Default)" : ""}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Anthropic
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          {anthropicModels.map((m) => (
            <ModelMenuItem
              key={m.id}
              model={m}
              isSelected={m.id === modelId}
              onSelect={onModelChange}
            />
          ))}
        </DropdownMenuGroup>

        {openaiModels.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              OpenAI
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              {openaiModels.map((m) => (
                <ModelMenuItem
                  key={m.id}
                  model={m}
                  isSelected={m.id === modelId}
                  onSelect={onModelChange}
                />
              ))}
            </DropdownMenuGroup>
          </>
        )}

        {ollamaModels.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Ollama
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              {ollamaModels.map((m) => (
                <ModelMenuItem
                  key={m.id}
                  model={m}
                  isSelected={m.id === modelId}
                  onSelect={onModelChange}
                />
              ))}
            </DropdownMenuGroup>
          </>
        )}

        {liteLLMModels.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              LiteLLM gateway
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              {liteLLMModels.map((m) => (
                <ModelMenuItem
                  key={m.id}
                  model={m}
                  isSelected={m.id === modelId}
                  onSelect={onModelChange}
                />
              ))}
            </DropdownMenuGroup>
          </>
        )}

        {lmStudioModels.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              LM Studio server
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              {lmStudioModels.map((m) => (
                <ModelMenuItem
                  key={m.id}
                  model={m}
                  isSelected={m.id === modelId}
                  onSelect={onModelChange}
                />
              ))}
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ModelMenuItem({
  model,
  isSelected,
  onSelect,
}: {
  model: ChatModelOption;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <DropdownMenuItem
      className="flex items-center justify-between"
      onClick={() => onSelect(model.id)}
    >
      <span className="flex items-center gap-2">
        <span className={cn("text-sm", isSelected && "font-medium")}>
          {tierEmoji[model.tier] ?? ""} {model.label}
        </span>
        <span className="text-xs text-muted-foreground">
          {model.costLabel}
        </span>
      </span>
      {isSelected && <Check className="h-3.5 w-3.5" />}
    </DropdownMenuItem>
  );
}
