import {
  getRuntimeFeatures,
  resolveAgentRuntime,
  type RuntimeFeatures,
} from "@/lib/agents/runtime/catalog";

/** Screenshot attachment metadata stored in message metadata.attachments */
export interface ScreenshotAttachment {
  documentId: string;
  thumbnailUrl: string;
  originalUrl: string;
  width: number;
  height: number;
}

/** Chat stream event types sent to the client via SSE */
export type ChatStreamEvent =
  | { type: "delta"; content: string }
  | { type: "status"; phase: string; message: string }
  | {
      type: "done";
      messageId: string;
      quickAccess: QuickAccessItem[];
      composedApp?: unknown;
      extensionFallback?: unknown;
      fallbackReason?: string;
      modelId?: string;
    }
  | { type: "error"; message: string }
  | { type: "permission_request"; requestId: string; messageId: string; toolName: string; toolInput: Record<string, unknown> }
  | { type: "question"; requestId: string; messageId: string; questions: ChatQuestion[] }
  | { type: "screenshot"; documentId: string; thumbnailUrl: string; originalUrl: string; width: number; height: number };

/** Structured question from AskUserQuestion tool */
export interface ChatQuestion {
  id?: string;
  question: string;
  header: string;
  options?: { label: string; description: string }[];
  multiSelect?: boolean;
  isSecret?: boolean;
}

/** Entity link detected in an assistant response */
export interface QuickAccessItem {
  entityType: "project" | "task" | "workflow" | "document" | "schedule";
  entityId: string;
  label: string;
  href: string;
}

/** Model catalog entry for the chat model selector */
export interface ChatModelOption {
  id: string;
  label: string;
  provider: "anthropic" | "openai" | "ollama" | "litellm" | "lmstudio";
  tier: string; // "Fast" | "Balanced" | "Best"
  costLabel: string; // "$" | "$$" | "$$$" | "Free"
}

/** Runtime → provider mapping */
export function getProviderForRuntime(runtimeId: string): ChatModelOption["provider"] {
  if (runtimeId === "ollama") return "ollama";
  if (runtimeId === "litellm") return "litellm";
  if (runtimeId === "lmstudio") return "lmstudio";
  return (runtimeId === "openai-codex-app-server" || runtimeId === "openai-direct") ? "openai" : "anthropic";
}

/** Available chat models by provider (fallback when SDKs are unreachable).
 *  IDs must match what the SDKs actually accept:
 *  - Claude SDK: "haiku", "sonnet", "opus" (short names)
 *  - Codex App Server: "gpt-5.4", "gpt-5.3-codex", etc. */
export const CHAT_MODELS: ChatModelOption[] = [
  // Anthropic — uses SDK short names
  { id: "haiku", label: "Haiku", provider: "anthropic", tier: "Fast", costLabel: "$" },
  { id: "sonnet", label: "Sonnet", provider: "anthropic", tier: "Balanced", costLabel: "$$" },
  { id: "opus", label: "Opus", provider: "anthropic", tier: "Best", costLabel: "$$$" },
  // OpenAI — GPT-5.x / Codex family
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", provider: "openai", tier: "Fast", costLabel: "$" },
  { id: "gpt-5.3-codex", label: "Codex 5.3", provider: "openai", tier: "Balanced", costLabel: "$$" },
  { id: "gpt-5.4", label: "GPT-5.4", provider: "openai", tier: "Best", costLabel: "$$$" },
];

export const DEFAULT_CHAT_MODEL = "haiku";

// Validate CHAT_MODELS against runtime catalog at module load
// Warns on stale model IDs that don't appear in any runtime's supported list
try {
  const { listRuntimeCatalog } = require("@/lib/agents/runtime/catalog");
  const allSupportedModels = new Set<string>();
  for (const runtime of listRuntimeCatalog()) {
    for (const model of runtime.models.supported) {
      allSupportedModels.add(model);
    }
  }
  for (const model of CHAT_MODELS) {
    if (!allSupportedModels.has(model.id)) {
      console.warn(
        `[chat-models] CHAT_MODELS entry "${model.id}" not found in any runtime's supported models — may be stale`
      );
    }
  }
} catch {
  // Catalog not available during build/test — skip validation
}

/** Resolve a model ID to its display label (e.g., "opus" → "Opus", "gpt-5.4" → "GPT-5.4") */
export function resolveModelLabel(modelId: string): string {
  const model = CHAT_MODELS.find((m) => m.id === modelId);
  return model?.label ?? modelId;
}

/** Model → runtime mapping (derived from model's provider or ID prefix) */
export function getRuntimeForModel(modelId: string): string {
  const model = CHAT_MODELS.find((m) => m.id === modelId);
  if (model) {
    if (model.provider === "ollama") return "ollama";
    return model.provider === "openai" ? "openai-codex-app-server" : "claude-code";
  }
  // Check dynamically added Ollama models (prefixed with "ollama:")
  if (modelId.startsWith("ollama:")) return "ollama";
  if (modelId.startsWith("litellm:")) return "litellm";
  if (modelId.startsWith("lmstudio:")) return "lmstudio";
  // Fallback: OpenAI models start with "gpt" or "o"
  return /^(gpt|o\d)/.test(modelId) ? "openai-codex-app-server" : "claude-code";
}

/**
 * Model → LLM-surface features. Thin wrapper around getRuntimeForModel +
 * getRuntimeFeatures so chat callers don't need to know runtime IDs.
 */
export function getFeaturesForModel(modelId: string): RuntimeFeatures {
  const runtimeId = resolveAgentRuntime(getRuntimeForModel(modelId));
  return getRuntimeFeatures(runtimeId);
}

/** Suggested prompt category with expandable sub-prompts */
export interface PromptCategory {
  id: string;
  label: string;
  icon: string; // Lucide icon name
  prompts: SuggestedPrompt[];
}

/** Individual suggested prompt with short label and detailed text */
export interface SuggestedPrompt {
  label: string;  // Short display text for dropdown (~40 chars)
  prompt: string; // Full detailed prompt text for hover preview and fill
}
