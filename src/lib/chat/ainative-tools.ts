import { tool as sdkTool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { type ToolContext } from "./tools/helpers";
import {
  type ToolDefinition,
  type ToolResult,
  toAnthropicToolDef,
  toOpenAIFunctionDef,
  type AnthropicToolDef,
  type OpenAIFunctionDef,
} from "./tool-registry";
import { projectTools } from "./tools/project-tools";
import { taskTools } from "./tools/task-tools";
import { workflowTools } from "./tools/workflow-tools";
import { scheduleTools } from "./tools/schedule-tools";
import { documentTools } from "./tools/document-tools";
import { notificationTools } from "./tools/notification-tools";
import { pluginTools } from "./tools/plugin-tools";
import { profileTools } from "./tools/profile-tools";
import { usageTools } from "./tools/usage-tools";
import { settingsTools } from "./tools/settings-tools";
import { chatHistoryTools } from "./tools/chat-history-tools";
import { handoffTools } from "./tools/handoff-tools";
import { tableTools } from "./tools/table-tools";
import { runtimeTools } from "./tools/runtime-tools";
import { blueprintTools } from "./tools/blueprint-tools";
import { skillTools } from "./tools/skill-tools";
import { scheduleSpecTools } from "./tools/schedule-spec-tools";
import { pluginSpecTools } from "./tools/plugin-spec-tools";
import { appViewTools } from "./tools/app-view-tools";
import { packTools } from "./tools/pack-tools";


// ── Tool server types ────────────────────────────────────────────────

export interface ProviderToolKit {
  tools: AnthropicToolDef[] | OpenAIFunctionDef[];
  /** Execute a tool handler by name. Throws if tool not found. */
  executeHandler(name: string, args: Record<string, unknown>): Promise<ToolResult>;
}

export interface ToolServer {
  /** Backward-compatible SDK MCP server for the chat engine. */
  asMcpServer(): ReturnType<typeof createSdkMcpServer>;
  /** Provider-formatted tool arrays + handler lookup for direct API runtimes. */
  forProvider(provider: "anthropic" | "openai"): ProviderToolKit;
  /** Raw tool definitions for inspection / testing. */
  readonly definitions: ToolDefinition[];
}

// ── Factory ──────────────────────────────────────────────────────────

function collectAllTools(ctx: ToolContext): ToolDefinition[] {
  return [
    ...projectTools(ctx),
    ...taskTools(ctx),
    ...workflowTools(ctx),
    ...scheduleTools(ctx),
    ...documentTools(ctx),
    ...notificationTools(ctx),
    ...pluginTools(ctx),
    ...pluginSpecTools(ctx),
    ...profileTools(ctx),
    ...usageTools(ctx),
    ...settingsTools(ctx),
    ...chatHistoryTools(ctx),
    ...handoffTools(ctx),
    ...tableTools(ctx),
    ...runtimeTools(ctx),
    ...blueprintTools(ctx),
    ...skillTools(ctx),
    ...scheduleSpecTools(ctx),
    ...appViewTools(ctx),
    ...packTools(ctx),
  ];
}

/**
 * Create a tool server that supports both SDK MCP mode and direct API mode.
 *
 * - `.asMcpServer()` re-wraps definitions into SDK `tool()` calls for
 *   backward compatibility with the chat engine.
 * - `.forProvider("anthropic" | "openai")` returns provider-formatted
 *   tool definitions + a handler lookup for direct API runtimes.
 */
export function createToolServer(
  projectId?: string | null,
  onToolResult?: (toolName: string, result: unknown) => void,
  projectDir?: string | null,
): ToolServer {
  const ctx: ToolContext = { projectId, projectDir, onToolResult };
  const allTools = collectAllTools(ctx);

  // Handler lookup map (built once, shared across modes)
  const handlerMap = new Map<string, ToolDefinition["handler"]>(
    allTools.map((t) => [t.name, t.handler]),
  );

  async function executeHandler(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const handler = handlerMap.get(name);
    if (!handler) throw new Error(`Unknown tool: ${name}`);
    return handler(args);
  }

  return {
    asMcpServer() {
      // Re-wrap ToolDefinitions into SDK tool() format
      const sdkTools = allTools.map((def) =>
        sdkTool(def.name, def.description, def.zodShape, def.handler),
      );
      return createSdkMcpServer({
        // MCP server label — produces the mcp__relay__* tool namespace the
        // runtime allow-lists prepend. Renamed from "ainative" in the Relay
        // rebrand; must stay in lockstep with the mcp__relay__* prefixes in
        // claude-agent.ts, chat/engine.ts, and the runtime adapters.
        name: "relay",
        version: "1.0.0",
        tools: sdkTools,
      });
    },

    forProvider(provider) {
      const tools =
        provider === "anthropic"
          ? allTools.map(toAnthropicToolDef)
          : allTools.map(toOpenAIFunctionDef);
      return { tools, executeHandler };
    },

    definitions: allTools,
  };
}
