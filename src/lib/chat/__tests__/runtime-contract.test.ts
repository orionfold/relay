import { describe, expect, it } from "vitest";
import {
  SUPPORTED_AGENT_RUNTIMES,
  type AgentRuntimeId,
} from "@/lib/agents/runtime/catalog";
import {
  CHAT_RUNTIME_CONTRACTS,
  ChatRuntimeUnsupportedError,
  listChatRuntimeIds,
  requireChatRuntimeContract,
} from "../runtime-contract";

describe("cross-provider Chat runtime contract", () => {
  it("exhaustively declares every shipped runtime in catalog order", () => {
    expect(Object.keys(CHAT_RUNTIME_CONTRACTS)).toEqual(
      SUPPORTED_AGENT_RUNTIMES
    );
  });

  it("declares exactly the five runtimes with real Chat engines", () => {
    expect(listChatRuntimeIds()).toEqual([
      "claude-code",
      "openai-codex-app-server",
      "ollama",
      "litellm",
      "lmstudio",
    ]);
  });

  it.each([
    ["claude-code", "claude-agent-sdk", "claude-sdk-result"],
    [
      "openai-codex-app-server",
      "codex-app-server",
      "codex-turn-completed",
    ],
    ["ollama", "ollama-http", "ollama-done-frame"],
    ["litellm", "openai-compatible-sse", "openai-compatible-done-marker"],
    ["lmstudio", "openai-compatible-sse", "openai-compatible-done-marker"],
  ] as const)(
    "%s keeps its provider-specific engine and terminal protocol",
    (runtimeId, engine, terminalProtocol) => {
      expect(requireChatRuntimeContract(runtimeId)).toMatchObject({
        supported: true,
        engine,
        terminalProtocol,
      });
    }
  );

  it.each([
    ["ollama", "ollama:"],
    ["litellm", "litellm:"],
    ["lmstudio", "lmstudio:"],
  ] as const)("%s preserves its model namespace", (runtimeId, prefix) => {
    expect(requireChatRuntimeContract(runtimeId).modelNamespace).toBe(prefix);
  });

  it("retains provider-specific cost truth", () => {
    expect(requireChatRuntimeContract("litellm").costSource).toBe(
      "provider-reported"
    );
    expect(requireChatRuntimeContract("lmstudio").costSource).toBe("unknown");
    expect(requireChatRuntimeContract("ollama").costSource).toBe("unknown");
  });

  it.each(["anthropic-direct", "openai-direct"] as const)(
    "keeps task-only runtime %s as an explicit Chat exception",
    (runtimeId) => {
      const contract = CHAT_RUNTIME_CONTRACTS[runtimeId];
      expect(contract).toMatchObject({ supported: false, engine: null });
      expect(contract.reason).toContain("task runtime");
      expect(() => requireChatRuntimeContract(runtimeId)).toThrowError(
        ChatRuntimeUnsupportedError
      );
    }
  );

  it("fails closed if the caller supplies an unsupported runtime", () => {
    const runtimeId: AgentRuntimeId = "openai-direct";
    expect(() => requireChatRuntimeContract(runtimeId)).toThrow(
      "does not have a Relay Chat engine"
    );
  });
});
