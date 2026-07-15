import {
  SUPPORTED_AGENT_RUNTIMES,
  type AgentRuntimeId,
} from "@/lib/agents/runtime/catalog";

export type ChatEngineId =
  | "claude-agent-sdk"
  | "codex-app-server"
  | "ollama-http"
  | "openai-compatible-sse";

export type ChatTerminalProtocol =
  | "claude-sdk-result"
  | "codex-turn-completed"
  | "ollama-done-frame"
  | "openai-compatible-done-marker";

export type ChatToolMode = "agent-tools" | "no-provider-tool-loop";

interface SupportedChatRuntimeContract {
  supported: true;
  engine: ChatEngineId;
  terminalProtocol: ChatTerminalProtocol;
  modelNamespace: string | null;
  toolMode: ChatToolMode;
  usageSource: string;
  costSource: "catalog-pricing" | "provider-reported" | "unknown";
}

interface UnsupportedChatRuntimeContract {
  supported: false;
  engine: null;
  reason: string;
}

export type ChatRuntimeContract =
  | SupportedChatRuntimeContract
  | UnsupportedChatRuntimeContract;

/**
 * Exhaustive runtime-to-Chat boundary declaration.
 *
 * This is deliberately separate from task adapter capabilities. A runtime can
 * execute tasks without having a Chat engine. Keeping the exception explicit
 * prevents an unsupported runtime from falling through to the Claude SDK.
 */
export const CHAT_RUNTIME_CONTRACTS = {
  "claude-code": {
    supported: true,
    engine: "claude-agent-sdk",
    terminalProtocol: "claude-sdk-result",
    modelNamespace: null,
    toolMode: "agent-tools",
    usageSource: "claude-agent-sdk-stream",
    costSource: "catalog-pricing",
  },
  "openai-codex-app-server": {
    supported: true,
    engine: "codex-app-server",
    terminalProtocol: "codex-turn-completed",
    modelNamespace: null,
    toolMode: "agent-tools",
    usageSource: "codex-app-server-stream",
    costSource: "catalog-pricing",
  },
  "anthropic-direct": {
    supported: false,
    engine: null,
    reason:
      "Anthropic Direct is a task runtime and does not have a Relay Chat engine.",
  },
  "openai-direct": {
    supported: false,
    engine: null,
    reason:
      "OpenAI Direct is a task runtime and does not have a Relay Chat engine.",
  },
  ollama: {
    supported: true,
    engine: "ollama-http",
    terminalProtocol: "ollama-done-frame",
    modelNamespace: "ollama:",
    toolMode: "no-provider-tool-loop",
    usageSource: "ollama-chat-stream",
    costSource: "unknown",
  },
  litellm: {
    supported: true,
    engine: "openai-compatible-sse",
    terminalProtocol: "openai-compatible-done-marker",
    modelNamespace: "litellm:",
    toolMode: "no-provider-tool-loop",
    usageSource: "litellm-chat-completion-stream",
    costSource: "provider-reported",
  },
  lmstudio: {
    supported: true,
    engine: "openai-compatible-sse",
    terminalProtocol: "openai-compatible-done-marker",
    modelNamespace: "lmstudio:",
    toolMode: "no-provider-tool-loop",
    usageSource: "lmstudio-chat-completion-stream",
    costSource: "unknown",
  },
} as const satisfies Record<AgentRuntimeId, ChatRuntimeContract>;

export type ChatRuntimeId = {
  [RuntimeId in AgentRuntimeId]:
    (typeof CHAT_RUNTIME_CONTRACTS)[RuntimeId]["supported"] extends true
      ? RuntimeId
      : never;
}[AgentRuntimeId];

export class ChatRuntimeUnsupportedError extends Error {
  readonly runtimeId: AgentRuntimeId;

  constructor(runtimeId: AgentRuntimeId, reason: string) {
    super(reason);
    this.name = "ChatRuntimeUnsupportedError";
    this.runtimeId = runtimeId;
  }
}

export function getChatRuntimeContract(
  runtimeId: AgentRuntimeId
): ChatRuntimeContract {
  return CHAT_RUNTIME_CONTRACTS[runtimeId];
}

export function isChatRuntimeId(
  runtimeId: AgentRuntimeId
): runtimeId is ChatRuntimeId {
  return CHAT_RUNTIME_CONTRACTS[runtimeId].supported;
}

export function listChatRuntimeIds(): ChatRuntimeId[] {
  return SUPPORTED_AGENT_RUNTIMES.filter(isChatRuntimeId);
}

export function requireChatRuntimeContract(
  runtimeId: AgentRuntimeId
): SupportedChatRuntimeContract {
  const contract = getChatRuntimeContract(runtimeId);
  if (!contract.supported) {
    throw new ChatRuntimeUnsupportedError(runtimeId, contract.reason);
  }
  return contract;
}
