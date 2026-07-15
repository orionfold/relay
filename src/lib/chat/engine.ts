import { query } from "@anthropic-ai/claude-agent-sdk";
import { db } from "@/lib/db";
import { projects, chatMessages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthEnv } from "@/lib/settings/auth";
import {
  buildClaudeSdkEnv,
  CLAUDE_SDK_SETTING_SOURCES,
  CLAUDE_SDK_ALLOWED_TOOLS,
  CLAUDE_SDK_READ_ONLY_FS_TOOLS,
} from "@/lib/agents/runtime/claude-sdk";
import {
  extractUsageSnapshot,
  mergeUsageSnapshot,
  recordUsageLedgerEntry,
  type UsageSnapshot,
} from "@/lib/usage/ledger";
import { enforceBudgetGuardrails } from "@/lib/settings/budget-guardrails";
import { getSetting } from "@/lib/settings/helpers";
import { SETTINGS_KEYS } from "@/lib/constants/settings";
import {
  getConversation,
  addMessage,
  updateMessageStatus,
  updateMessageContent,
  updateConversation,
} from "@/lib/data/chat";
import { buildChatContext, type MentionReference } from "./context-builder";
import { finalizeStreamingMessage } from "./reconcile";
import { recordTermination } from "./stream-telemetry";
import { registerChatStream, unregisterChatStream } from "./active-streams";
import {
  detectEntities,
  extractToolResultEntities,
  deduplicateByEntityId,
  type ToolResultCapture,
} from "./entity-detector";
import { detectComposedApp } from "@/lib/apps/composition-detector";
import type { ChatStreamEvent, ChatQuestion, ScreenshotAttachment } from "./types";
import { getProviderForRuntime, DEFAULT_CHAT_MODEL } from "./types";
import { persistScreenshot, SCREENSHOT_TOOL_NAMES } from "@/lib/screenshots/persist";
import {
  createSideChannel,
  emitSideChannelEvent,
  createPendingRequest,
  cleanupConversation,
  type ToolPermissionResponse,
} from "./permission-bridge";
import { isToolAllowed } from "@/lib/settings/permissions";
import { getLaunchCwd, getWorkspaceContext } from "@/lib/environment/workspace-context";
import { createToolServer } from "./ainative-tools";
import {
  getBrowserMcpServers,
  getBrowserAllowedToolPatterns,
  getExternalMcpServers,
  getExternalAllowedToolPatterns,
  isBrowserTool,
  isBrowserReadOnly,
  isExaTool,
  isExaReadOnly,
} from "@/lib/agents/browser-mcp";
import { resolveChatExecutionTarget } from "@/lib/agents/runtime/execution-target";
import { classifyMessage } from "./planner/classifier";
import { buildCompositionHint } from "./planner/composition-hint";
import {
  detectViewEditingIntent,
  buildViewEditingHint,
} from "./planner/view-editing-hint";

// Re-exported from runtime/claude-sdk.ts so chat/engine.ts remains a stable
// import surface for the Phase 1a test suite. The canonical definitions
// live in the runtime module since task execution needs them too — see
// features/task-runtime-skill-parity.md Task 1.
export {
  CLAUDE_SDK_SETTING_SOURCES,
  CLAUDE_SDK_ALLOWED_TOOLS,
  CLAUDE_SDK_READ_ONLY_FS_TOOLS,
} from "@/lib/agents/runtime/claude-sdk";

/**
 * Pure auto-allow policy for SDK filesystem + Skill tools. Exposed for tests.
 * Returns `{ behavior: "allow" }` for auto-allowed tools, or
 * `{ behavior: "pending" }` to signal "route through permission flow".
 * The real canUseTool in query() options uses the full side-channel bridge.
 */
export async function canUseToolForTest(
  toolName: string,
  _input: Record<string, unknown>
): Promise<ToolPermissionResponse | { behavior: "pending" }> {
  if (CLAUDE_SDK_READ_ONLY_FS_TOOLS.has(toolName)) {
    return { behavior: "allow" };
  }
  if (toolName === "Skill") {
    return { behavior: "allow" };
  }
  return { behavior: "pending" };
}

/**
 * M4.5 compose-path Skill denial. Pure function exposing the deny branch
 * so it can be unit-tested without running the full SDK query loop.
 * Mirrors the logic in canUseTool at the Skill-tool branch.
 *
 * When verdictKind is "compose", the planner has routed this turn to
 * composition — the model must call create_profile/create_blueprint/
 * create_table directly rather than invoke a skill (which would shadow
 * the composition hint via hard-directive skill trigger language).
 */
export function composeSkillPolicyForTest(
  skillName: string,
  verdictKind: "compose" | "scaffold" | "conversation"
): ToolPermissionResponse {
  if (verdictKind === "compose") {
    return {
      behavior: "deny",
      message: `Skill '${skillName}' is disabled for this turn. This is an app-composition request — call list_profiles/list_blueprints/create_profile/create_blueprint directly.`,
    };
  }
  return { behavior: "allow", updatedInput: {} };
}

// ── Streaming input wrapper (required for MCP tools) ─────────────────

async function* generatePrompt(text: string) {
  yield {
    type: "user" as const,
    message: { role: "user" as const, content: text },
    parent_tool_use_id: null,
    session_id: crypto.randomUUID(),
  };
}

// ── Error diagnostics ──────────────────────────────────────────────────

/**
 * Translate a raw SDK / process error + stderr into an actionable message.
 * The Claude Code subprocess can exit with code 1 for many reasons;
 * stderr output usually reveals the real cause.
 */
function diagnoseProcessError(rawMessage: string, stderr: string): string {
  const combined = `${rawMessage}\n${stderr}`.toLowerCase();

  if (combined.includes("authentication") || combined.includes("not logged in") || combined.includes("oauth") || combined.includes("token expired")) {
    return "Authentication failed — please check your API key or run `claude login` to refresh OAuth tokens. (Settings → Authentication)";
  }
  if (combined.includes("rate limit") || combined.includes("rate_limit") || combined.includes("429")) {
    return "Rate limit reached — please wait a moment before sending another message.";
  }
  if (combined.includes("billing") || combined.includes("insufficient") || combined.includes("payment")) {
    return "Billing issue — your account may need a payment method or has exceeded its budget.";
  }
  if (combined.includes("enoent") || combined.includes("not found") || combined.includes("command not found")) {
    return "Claude Code CLI not found — please install it with `npm install -g @anthropic-ai/claude-code`.";
  }
  if (combined.includes("model") && (combined.includes("not available") || combined.includes("invalid"))) {
    return "The selected model is not available for your account. Try switching to a different model.";
  }

  // Generic process exit — append stderr hint if available
  if (/process exited with code \d+/i.test(rawMessage)) {
    if (stderr) {
      // Extract last meaningful line from stderr
      const lines = stderr.split("\n").filter((l) => l.trim());
      const lastLine = lines[lines.length - 1] ?? "";
      return `${rawMessage}${lastLine ? ` — ${lastLine}` : ""}. Check Settings → Authentication if this persists.`;
    }
    return `${rawMessage}. This usually means an authentication or configuration issue — check Settings → Authentication.`;
  }

  return rawMessage;
}

// ── Stream-shaping helpers (exported for unit tests) ──────────────────

/**
 * Returns the separator to insert before appending new text to `fullText`.
 * The Anthropic stream delivers text in `content_block`s with no trailing
 * newline, so adjacent blocks (e.g. before/after a tool_use turn break) fuse
 * together visually unless we inject a paragraph break.
 */
export function paragraphSeparator(fullText: string): string {
  return fullText.length > 0 && !fullText.endsWith("\n") ? "\n\n" : "";
}

/**
 * Builds the inline markdown segment for a captured screenshot. The leading
 * separator preserves paragraph spacing relative to the prose that came
 * before; the trailing `\n\n` makes sure subsequent text starts a new block.
 */
export function inlineScreenshotMarkdown(
  fullText: string,
  thumbnailUrl: string
): string {
  return `${paragraphSeparator(fullText)}![screenshot](${thumbnailUrl})\n\n`;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Send a user message and stream the assistant response.
 * Returns an async iterable of ChatStreamEvent for SSE bridging.
 *
 * The generator merges two event sources:
 *   1. SDK stream events (text deltas, results)
 *   2. Side-channel events from canUseTool (permission requests, questions)
 */
export async function* sendMessage(
  conversationId: string,
  userContent: string,
  signal?: AbortSignal,
  mentions?: MentionReference[]
): AsyncGenerator<ChatStreamEvent> {
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    yield { type: "error", message: "Conversation not found" };
    return;
  }

  let target;
  try {
    target = await resolveChatExecutionTarget({
      requestedRuntimeId: conversation.runtimeId,
      requestedModelId: conversation.modelId,
    });
  } catch (error) {
    yield {
      type: "error",
      message: error instanceof Error ? error.message : "No chat runtime is available",
    };
    return;
  }

  if (target.fallbackApplied && target.fallbackReason) {
    yield {
      type: "status",
      phase: "runtime_fallback",
      message: target.fallbackReason,
    };
  }

  // Route to Codex App Server for OpenAI models
  if (target.effectiveRuntimeId === "openai-codex-app-server") {
    const { sendCodexMessage } = await import("./codex-engine");
    yield* sendCodexMessage(conversationId, userContent, signal, target);
    return;
  }

  // Route to Ollama for local models
  if (target.effectiveRuntimeId === "ollama") {
    const { sendOllamaMessage } = await import("./ollama-engine");
    yield* sendOllamaMessage(conversationId, userContent, signal);
    return;
  }

  if (
    target.effectiveRuntimeId === "litellm" ||
    target.effectiveRuntimeId === "lmstudio"
  ) {
    const { sendOpenAICompatibleMessage } = await import(
      "./openai-compatible-engine"
    );
    yield* sendOpenAICompatibleMessage(
      target.effectiveRuntimeId,
      conversationId,
      userContent,
      signal,
      target
    );
    return;
  }

  const runtimeId = target.effectiveRuntimeId;
  const providerId = getProviderForRuntime(runtimeId);

  // Enforce budget before the turn
  try {
    await enforceBudgetGuardrails({
      runtimeId,
      activityType: "chat_turn",
      projectId: conversation.projectId,
    });
  } catch (error) {
    yield {
      type: "error",
      message: error instanceof Error ? error.message : "Budget limit exceeded",
    };
    return;
  }

  yield { type: "status", phase: "preparing", message: "Preparing context..." };

  // Build context BEFORE persisting user message to avoid double-send
  let projectName: string | null = null;
  let projectCwd: string | null = null;
  if (conversation.projectId) {
    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, conversation.projectId))
      .get();
    if (project) {
      projectName = project.name;
      projectCwd = project.workingDirectory ?? null;
    }
  }

  // Build workspace context — project workingDirectory overrides launch cwd
  const workspace = getWorkspaceContext();
  if (projectCwd) {
    workspace.cwd = projectCwd;
  }

  const context = await buildChatContext({
    conversationId,
    projectId: conversation.projectId,
    projectName,
    workspace,
    mentions,
  });

  // Persist user message (after context is built so it won't appear in history)
  await addMessage({
    conversationId,
    role: "user",
    content: userContent,
  });

  // Auto-title from first message if conversation has no title
  if (!conversation.title) {
    const title =
      userContent.length > 60
        ? userContent.slice(0, 57) + "..."
        : userContent;
    await updateConversation(conversationId, { title });
  }

  // Build prompt: system context with history, user message as the prompt
  // The SDK sends the prompt as the user turn, so we embed history in the system preamble
  const historyBlock = context.history.length > 0
    ? "\n\n## Prior conversation:\n" +
      context.history
        .map((m) => `**${m.role}:** ${m.content}`)
        .join("\n\n")
    : "";

  // M4.5 planner: classify inbound message pre-dispatch. Compose verdicts
  // augment the system prompt with an advisory hint; scaffold verdicts are
  // handled after placeholder creation (short-circuits the LLM call —
  // see block below `registerChatStream`).
  const verdict = classifyMessage(userContent, {
    projectId: conversation.projectId,
    history: context.history
      .filter(
        (m): m is { role: "user" | "assistant"; content: string } =>
          m.role !== "system"
      )
      .map((m) => ({ role: m.role, content: m.content })),
  });

  let systemPreamble = context.systemPrompt + historyBlock;
  if (verdict.kind === "compose") {
    systemPreamble += buildCompositionHint(verdict.plan);
  }
  // View-editing intent — independent of compose verdict so a user
  // mid-conversation can switch a layout without re-triggering composition.
  // Detection is regex-based and tolerant of false positives; the LLM will
  // ignore the hint when the message is unrelated.
  const viewEditDetection = detectViewEditingIntent(userContent);
  if (viewEditDetection.detected) {
    systemPreamble += buildViewEditingHint(viewEditDetection);
  }

  const fullPrompt = [systemPreamble, "", userContent].join("\n");

  // Create placeholder assistant message
  const assistantMsg = await addMessage({
    conversationId,
    role: "assistant",
    content: "",
    status: "streaming",
  });

  registerChatStream(conversationId);

  const startedAt = new Date();
  const runtimeIdForScaffold = runtimeId;
  const providerIdForScaffold = providerId;

  // M4.5 scaffold-path short-circuit. The classifier has pre-inferred a
  // plugin scaffold; skip the LLM call, stream a canned preamble, and
  // persist extensionFallback metadata. chat-message.tsx renders
  // ExtensionFallbackCard from the metadata; its default onScaffold
  // posts to /api/plugins/scaffold.
  if (verdict.kind === "scaffold") {
    try {
      const preamble = [
        "I can scaffold a plugin for that. Here's what I'd generate:",
        "",
        verdict.plan.rationale,
      ].join("\n");

      yield {
        type: "status",
        phase: "generating",
        message: "Planning scaffold...",
      };
      yield { type: "delta", content: preamble };

      await updateMessageContent(assistantMsg.id, preamble);
      await updateMessageStatus(assistantMsg.id, "complete");

      const metadata = JSON.stringify({
        modelId: target.effectiveModelId ?? conversation.modelId,
        runtimeId: runtimeIdForScaffold,
        requestedRuntimeId:
          target.requestedRuntimeId ?? conversation.runtimeId,
        requestedModelId: target.requestedModelId ?? conversation.modelId,
        extensionFallback: {
          plugin: verdict.plan.plugin,
          rationale: verdict.plan.rationale,
          composeAltPrompt: verdict.plan.composeAltPrompt,
          explanation: verdict.plan.explanation,
        },
      });
      await db
        .update(chatMessages)
        .set({ metadata })
        .where(eq(chatMessages.id, assistantMsg.id));

      await recordUsageLedgerEntry({
        projectId: conversation.projectId,
        activityType: "chat_turn",
        runtimeId: runtimeIdForScaffold,
        providerId: providerIdForScaffold,
        modelId:
          target.effectiveModelId ?? conversation.modelId ?? null,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        status: "completed",
        startedAt,
        finishedAt: new Date(),
      });

      recordTermination({
        reason: "stream.completed",
        conversationId,
        messageId: assistantMsg.id,
        durationMs: Date.now() - startedAt.getTime(),
      });

      yield {
        type: "done",
        messageId: assistantMsg.id,
        quickAccess: [],
        extensionFallback: {
          plugin: verdict.plan.plugin,
          rationale: verdict.plan.rationale,
          composeAltPrompt: verdict.plan.composeAltPrompt,
          explanation: verdict.plan.explanation,
        },
      };
      return;
    } finally {
      unregisterChatStream(conversationId);
      cleanupConversation(conversationId);
    }
  }

  // Create side channel for canUseTool → SSE bridge communication
  const sideChannel = createSideChannel(conversationId);
  let usage: UsageSnapshot = {};
  let fullText = "";
  // Capture stderr for diagnostics when the Claude Code process fails
  const stderrChunks: string[] = [];

  try {
    const authEnv = await getAuthEnv();
    const abortController = new AbortController();

    // Forward external abort signal
    if (signal) {
      signal.addEventListener("abort", () => abortController.abort(), {
        once: true,
      });
    }

    // Create in-process MCP server for ainative CRUD tools
    const toolResults: ToolResultCapture[] = [];
    const ainativeServer = createToolServer(
      conversation.projectId,
      (toolName, result) => { toolResults.push({ toolName, result }); },
      projectCwd,
    ).asMcpServer();

    yield { type: "status", phase: "connecting", message: "Connecting to model..." };

    // Read user-configured max turns (Settings → Runtime)
    const maxTurnsSetting = await getSetting(SETTINGS_KEYS.MAX_TURNS);
    const maxTurns = maxTurnsSetting ? parseInt(maxTurnsSetting, 10) || 30 : 30;

    // Merge browser + external MCP servers when enabled in settings
    const [browserServers, browserToolPatterns, externalServers, externalToolPatterns] =
      await Promise.all([
        getBrowserMcpServers(),
        getBrowserAllowedToolPatterns(),
        getExternalMcpServers(),
        getExternalAllowedToolPatterns(),
      ]);

    const response = query({
      prompt: generatePrompt(fullPrompt),
      options: {
        model: target.effectiveModelId || conversation.modelId || undefined,
        maxTurns,
        abortController,
        includePartialMessages: true,
        cwd: workspace.cwd,
        env: buildClaudeSdkEnv(authEnv),
        stderr: (data: string) => {
          stderrChunks.push(data);
          // Keep only last 50 chunks to avoid unbounded memory
          if (stderrChunks.length > 50) stderrChunks.shift();
        },
        // Server key = tool namespace: the Agent SDK derives `mcp__<key>__*`
        // from THIS map key. Must be `relay` so published tools match the
        // allow-list (:510) and the auto-allow gate (:533) below.
        mcpServers: { relay: ainativeServer, ...browserServers, ...externalServers },
        allowedTools: [
          "mcp__relay__*",
          ...browserToolPatterns,
          ...externalToolPatterns,
          ...CLAUDE_SDK_ALLOWED_TOOLS,
        ],
        settingSources: [...CLAUDE_SDK_SETTING_SOURCES],
        // @ts-expect-error Agent SDK canUseTool types are incomplete — our async handler is compatible at runtime
        canUseTool: async (
          toolName: string,
          input: Record<string, unknown>
        ): Promise<ToolPermissionResponse> => {
          // Auto-allow safe ainative tools; gate dangerous ones through permission bridge
          const PERMISSION_GATED_TOOLS = new Set([
            "mcp__relay__execute_task",
            "mcp__relay__cancel_task",
            "mcp__relay__execute_workflow",
            "mcp__relay__delete_workflow",
            "mcp__relay__delete_schedule",
            "mcp__relay__upload_document",
            "mcp__relay__update_document",
            "mcp__relay__delete_document",
            "mcp__relay__set_settings",
          ]);
          if (toolName.startsWith("mcp__relay__") && !PERMISSION_GATED_TOOLS.has(toolName)) {
            // Emit tool-use status so the user sees what the model is doing
            const shortName = toolName.replace("mcp__relay__", "").replace(/_/g, " ");
            emitSideChannelEvent(conversationId, {
              type: "status",
              phase: "tool_use",
              message: `Using ${shortName}...`,
            });
            return { behavior: "allow", updatedInput: input };
          }

          // Exa tools: auto-allow read-only (all Exa tools are read-only)
          if (isExaTool(toolName) && isExaReadOnly(toolName)) {
            const shortName = toolName.replace("mcp__exa__", "").replace(/_/g, " ");
            emitSideChannelEvent(conversationId, {
              type: "status",
              phase: "tool_use",
              message: `Exa: ${shortName}...`,
            });
            return { behavior: "allow", updatedInput: input };
          }

          // Browser tools: auto-allow read-only, gate mutations
          if (isBrowserTool(toolName)) {
            if (isBrowserReadOnly(toolName)) {
              const shortName = toolName
                .replace("mcp__chrome-devtools__", "")
                .replace("mcp__playwright__", "")
                .replace(/_/g, " ");
              emitSideChannelEvent(conversationId, {
                type: "status",
                phase: "tool_use",
                message: `Browser: ${shortName}...`,
              });
              return { behavior: "allow", updatedInput: input };
            }
            // Mutation browser tools fall through to permission check below
          }

          // SDK filesystem read-only tools: auto-allow (mirror browser/exa pattern)
          if (CLAUDE_SDK_READ_ONLY_FS_TOOLS.has(toolName)) {
            emitSideChannelEvent(conversationId, {
              type: "status",
              phase: "tool_use",
              message: `Filesystem: ${toolName.toLowerCase()}...`,
            });
            return { behavior: "allow", updatedInput: input };
          }

          // Skill tool: auto-allow. Rationale: the Skill tool loads skills from
          // ~/.claude/skills/ and .claude/skills/ — the same sources the Claude Code
          // CLI trusts unconditionally. Any tool the skill subsequently invokes
          // (Bash, Edit, etc.) goes through this same canUseTool check. The trust
          // assumption here is identical to using `claude` directly; no new attack
          // surface is introduced. See: features/chat-claude-sdk-skills.md, Error
          // & Rescue Registry row "settingSources loads hostile skill".
          //
          // EXCEPTION: when the M4.5 classifier returns a compose verdict, deny
          // Skill invocations for this turn. The compose-path is a deterministic
          // routing decision that wants direct create_profile/create_blueprint
          // tool calls — not a brainstorming session. Skills like brainstorming
          // + ainative-app have hard "MUST USE" triggers that match "build me an
          // app" and shadow the composition-hint's advisory. Denying Skill here
          // forces the model through the composition-hint's action list.
          if (toolName === "Skill") {
            if (verdict.kind === "compose") {
              const skillName = (input as { skill?: string }).skill ?? "unknown";
              console.log(
                `[chat:compose-deny] Skill='${skillName}' conversationId=${conversationId}`
              );
              return {
                behavior: "deny",
                message: `Skill '${skillName}' is disabled for this turn. This is an app-composition request — call list_profiles/list_blueprints/create_profile/create_blueprint directly.`,
              };
            }
            emitSideChannelEvent(conversationId, {
              type: "status",
              phase: "tool_use",
              message: `Skill: ${(input as { skill?: string }).skill ?? "unknown"}...`,
            });
            return { behavior: "allow", updatedInput: input };
          }

          const isQuestion = toolName === "AskUserQuestion";

          // Layer 1: Check saved user permissions (skip for questions)
          if (!isQuestion) {
            if (await isToolAllowed(toolName, input)) {
              return { behavior: "allow", updatedInput: input };
            }
          }

          // Persist the request as a system message
          const requestId = crypto.randomUUID();
          const systemMsg = await addMessage({
            conversationId,
            role: "system",
            content: isQuestion
              ? `Agent has a question`
              : `Permission required: ${toolName}`,
            status: "pending",
            metadata: JSON.stringify(
              isQuestion
                ? { type: "question", requestId, questions: (input as { questions?: ChatQuestion[] }).questions ?? [] }
                : { type: "permission_request", requestId, toolName, toolInput: input }
            ),
          });

          // Emit event through side channel to SSE bridge
          if (isQuestion) {
            emitSideChannelEvent(conversationId, {
              type: "question",
              requestId,
              messageId: systemMsg.id,
              questions: (input as { questions?: ChatQuestion[] }).questions ?? [],
            });
          } else {
            emitSideChannelEvent(conversationId, {
              type: "permission_request",
              requestId,
              messageId: systemMsg.id,
              toolName,
              toolInput: input,
            });
          }

          // Block until user responds via the respond API
          return createPendingRequest(requestId, conversationId, systemMsg.id);
        },
      },
    });

    let firstEvent = true;
    let hasStreamedDeltas = false;

    // Screenshot interception state
    const pendingScreenshotTools = new Set<string>(); // tool_use IDs for screenshot tools
    const screenshotAttachments: ScreenshotAttachment[] = [];

    // Race the SDK iterator against the permission side-channel.
    //
    // The Agent SDK's canUseTool callback pauses the SDK indefinitely while a
    // permission gate is pending (see docs: "Execution remains paused until
    // your callback returns"). During that pause the SDK emits NO events, so a
    // plain `for await` over the iterator parks — and any UI event a *second*
    // concurrent gate pushes onto the side-channel would sit undrained until
    // the 120s auto-deny fired. That was the "silent second gate" deadlock:
    // the loop's only driver (SDK events) is exactly what the pending gate
    // stalls.
    //
    // Instead we drive the iterator manually and race each `.next()` against a
    // blocking `sideChannel.pull()`. When a side-channel event wins (a gate
    // surfacing while the SDK is paused), we yield it immediately and loop
    // again WITHOUT re-issuing `.next()` — the outstanding SDK promise is kept
    // in `sdkNext` and only replaced once it resolves, so we never call
    // `.next()` twice concurrently. This mirrors the codex-engine wake-signal
    // loop, which never had this bug.
    const sdkIterator = (response as AsyncIterable<Record<string, unknown>>)[
      Symbol.asyncIterator
    ]();
    let sdkNext: Promise<IteratorResult<Record<string, unknown>>> | null =
      sdkIterator.next();
    let sdkDone = false;

    while (!sdkDone) {
      if (signal?.aborted) break;

      // Signal that the model has connected and is processing
      if (firstEvent) {
        firstEvent = false;
        yield { type: "status", phase: "generating", message: "Generating response..." };
      }

      // Race: whichever of the SDK event or a side-channel push resolves first.
      // The SDK promise is persistent (never re-issued while pending); the pull
      // is recreated each turn and resolves with `undefined` on channel close.
      const winner = await Promise.race([
        sdkNext.then((res) => ({ kind: "sdk" as const, res })),
        sideChannel
          .pull()
          .then((event) => ({ kind: "side-channel" as const, event })),
      ]);

      // Side-channel won: the SDK is (likely) paused on a gate. Surface the
      // event now and loop again — `sdkNext` stays pending, unresolved.
      if (winner.kind === "side-channel") {
        // `undefined` means the channel closed (turn ending); ignore it.
        if (winner.event) yield winner.event;
        continue;
      }

      // SDK event won: consume it and re-arm the iterator for the next turn.
      const { res } = winner;
      sdkNext = null;
      if (res.done) {
        sdkDone = true;
        break;
      }
      const raw = res.value;
      sdkNext = sdkIterator.next();

      // Drain any side-channel events buffered alongside this SDK event.
      for (const sideEvent of sideChannel.drain()) {
        yield sideEvent;
      }

      usage = mergeUsageSnapshot(usage, extractUsageSnapshot(raw));

      if (raw.type === "stream_event") {
        // SDK wraps Anthropic API events inside stream_event.event
        const innerEvent = raw.event as Record<string, unknown> | undefined;
        if (innerEvent?.type === "content_block_start") {
          const block = innerEvent.content_block as Record<string, unknown> | undefined;
          if (block?.type === "text" && fullText.length > 0 && !fullText.endsWith("\n")) {
            // New text block after a previous block (often a tool_use turn break) —
            // models don't end blocks with paragraph breaks, so insert one to keep
            // sequential turns visually separated in the chat bubble.
            fullText += "\n\n";
            yield { type: "delta", content: "\n\n" };
          }
        } else if (innerEvent?.type === "content_block_delta") {
          const delta = innerEvent.delta as Record<string, unknown> | undefined;
          if (delta?.type === "text_delta" && typeof delta.text === "string") {
            fullText += delta.text;
            hasStreamedDeltas = true;
            yield { type: "delta", content: delta.text };
          }
        }
      } else if (raw.type === "content_block_start") {
        const block = (raw as Record<string, unknown>).content_block as Record<string, unknown> | undefined;
        if (block?.type === "text" && fullText.length > 0 && !fullText.endsWith("\n")) {
          fullText += "\n\n";
          yield { type: "delta", content: "\n\n" };
        }
      } else if (raw.type === "content_block_delta") {
        const delta = raw.delta as Record<string, unknown> | undefined;
        if (delta?.type === "text_delta" && typeof delta.text === "string") {
          fullText += delta.text;
          hasStreamedDeltas = true;
          yield { type: "delta", content: delta.text };
        }
      } else if (raw.type === "assistant") {
        // Track screenshot tool_use IDs (before the streaming skip)
        const assistantMsg = raw.message as Record<string, unknown> | undefined;
        const assistantBlocks = (assistantMsg?.content ?? raw.content) as Array<Record<string, unknown>> | undefined;
        if (assistantBlocks) {
          for (const block of assistantBlocks) {
            if (
              block.type === "tool_use" &&
              typeof block.name === "string" &&
              SCREENSHOT_TOOL_NAMES.has(block.name) &&
              typeof block.id === "string"
            ) {
              pendingScreenshotTools.add(block.id);
            }
          }
        }

        // Skip if we're already receiving streaming deltas — assistant events
        // are redundant partial messages from includePartialMessages: true
        // and their cumulative text blocks cause duplicate rendering
        if (hasStreamedDeltas) continue;
        // Fallback for non-streaming: extract text from content blocks
        if (assistantBlocks) {
          for (const block of assistantBlocks) {
            if (block.type === "text" && typeof block.text === "string" && !fullText.includes(block.text)) {
              if (fullText.length > 0 && !fullText.endsWith("\n")) {
                fullText += "\n\n";
                yield { type: "delta", content: "\n\n" };
              }
              fullText += block.text;
              yield { type: "delta", content: block.text };
            }
          }
        }
      } else if (raw.type === "user" && pendingScreenshotTools.size > 0) {
        // Intercept tool results that contain screenshot image data
        const userMsg = raw.message as Record<string, unknown> | undefined;
        const userContent = userMsg?.content as Array<Record<string, unknown>> | undefined;
        if (userContent) {
          for (const block of userContent) {
            if (block.type === "tool_result" && typeof block.tool_use_id === "string" && pendingScreenshotTools.has(block.tool_use_id)) {
              pendingScreenshotTools.delete(block.tool_use_id);
              // Extract base64 image data from the tool result content
              const resultContent = block.content as Array<Record<string, unknown>> | undefined;
              if (resultContent) {
                for (const item of resultContent) {
                  if (item.type === "image" && typeof item.source === "object" && item.source !== null) {
                    const source = item.source as Record<string, unknown>;
                    if (source.type === "base64" && typeof source.data === "string") {
                      const attachment = await persistScreenshot(source.data, {
                        conversationId,
                        messageId: assistantMsg.id,
                        projectId: conversation.projectId ?? undefined,
                        toolName: `screenshot_${block.tool_use_id}`,
                      });
                      if (attachment) {
                        screenshotAttachments.push(attachment);
                        yield { type: "screenshot" as const, ...attachment };
                        // Also inject the screenshot inline into the text stream as a
                        // markdown image so it renders next to the prose that captured
                        // it (the markdown renderer resolves the thumbnail src back to
                        // the full attachment via the message's metadata.attachments).
                        const inlineMd = inlineScreenshotMarkdown(
                          fullText,
                          attachment.thumbnailUrl
                        );
                        fullText += inlineMd;
                        yield { type: "delta" as const, content: inlineMd };
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } else if (raw.type === "result") {
        if (raw.is_error && raw.subtype !== "error_max_turns") {
          // SDKResultError has `errors: string[]`; SDKResultSuccess has `result: string`
          const errors = (raw as Record<string, unknown>).errors as string[] | undefined;
          const result = (raw as Record<string, unknown>).result as string | undefined;
          const errorDetail = errors?.length
            ? errors.join("; ")
            : typeof result === "string"
              ? result
              : "Agent SDK returned an error";
          throw new Error(errorDetail);
        }
        // Only emit result text as fallback when streaming didn't deliver content.
        // When deltas were active, fullText is already complete — re-emitting
        // the result would duplicate the entire response.
        if (!hasStreamedDeltas || !fullText) {
          const result = (raw as Record<string, unknown>).result;
          if (typeof result === "string" && result.length > 0) {
            if (result !== fullText) {
              if (result.startsWith(fullText)) {
                const remainder = result.slice(fullText.length);
                if (remainder) {
                  yield { type: "delta" as const, content: remainder };
                }
              } else {
                // Result is unrelated to what we have so far — treat as a new
                // text block and insert a paragraph break before appending.
                if (fullText.length > 0 && !fullText.endsWith("\n")) {
                  yield { type: "delta" as const, content: "\n\n" };
                  fullText += "\n\n";
                }
                yield { type: "delta" as const, content: result };
              }
              fullText = result.startsWith(fullText) ? result : fullText + result;
            }
          }
        }
        break;
      }
    }

    // Drain any remaining side-channel events
    for (const sideEvent of sideChannel.drain()) {
      yield sideEvent;
    }

    // Safety net: if SDK reported output tokens but no text was captured
    if (!fullText && usage.outputTokens && usage.outputTokens > 0) {
      fullText = "(Response was generated but could not be captured. Please try again.)";
      yield { type: "delta", content: fullText };
    }

    // Finalize assistant message
    await updateMessageContent(assistantMsg.id, fullText);
    await updateMessageStatus(assistantMsg.id, "complete");

    // Detect entities for Quick Access pills (tool results + text matching)
    const toolEntities = extractToolResultEntities(toolResults);
    const textEntities = await detectEntities(fullText, conversation.projectId);
    const quickAccess = deduplicateByEntityId([...toolEntities, ...textEntities]);

    // Detect ainative-app composition (TDR-037 self-extension surface)
    const composedApp = detectComposedApp(toolResults);

    // Save usage metadata + quick access links + screenshot attachments
    const metadata = JSON.stringify({
      modelId: usage.modelId ?? target.effectiveModelId ?? conversation.modelId,
      runtimeId,
      requestedRuntimeId: target.requestedRuntimeId ?? conversation.runtimeId,
      requestedModelId: target.requestedModelId ?? conversation.modelId,
      ...(target.fallbackReason ? { fallbackReason: target.fallbackReason } : {}),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      ...(quickAccess.length > 0 ? { quickAccess } : {}),
      ...(screenshotAttachments.length > 0 ? { attachments: screenshotAttachments } : {}),
      ...(composedApp ? { composedApp } : {}),
    });
    await db
      .update(chatMessages)
      .set({ metadata })
      .where(eq(chatMessages.id, assistantMsg.id));

    // Record usage
    await recordUsageLedgerEntry({
      projectId: conversation.projectId,
      activityType: "chat_turn",
      runtimeId,
      providerId,
      modelId: usage.modelId ?? target.effectiveModelId ?? conversation.modelId ?? null,
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      totalTokens: usage.totalTokens ?? null,
      status: "completed",
      startedAt,
      finishedAt: new Date(),
    });

    recordTermination({
      reason: "stream.completed",
      conversationId,
      messageId: assistantMsg.id,
      durationMs: Date.now() - startedAt.getTime(),
    });

    {
      const effectiveModelId =
        usage.modelId ?? target.effectiveModelId ?? conversation.modelId ?? null;
      yield {
        type: "done",
        messageId: assistantMsg.id,
        quickAccess,
        ...(composedApp ? { composedApp } : {}),
        ...(target.fallbackReason ? { fallbackReason: target.fallbackReason } : {}),
        ...(effectiveModelId ? { modelId: effectiveModelId } : {}),
      };
    }
  } catch (error) {
    const rawMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Enrich the error with stderr diagnostics when available
    const stderrTail = stderrChunks.join("").trim();
    const rawErrorMessage = diagnoseProcessError(rawMessage, stderrTail);
    // Truncate at 4KB to prevent multi-MB stderr dumps bloating chat_messages
    const errorMessage =
      rawErrorMessage.length > 4096
        ? rawErrorMessage.slice(0, 4096) + "... (truncated)"
        : rawErrorMessage;

    // Telemetry: record BEFORE the yield below. If this code is reached
    // via iterator abandonment (consumer broke the for-await and the
    // generator's own yield throws GeneratorReturn), control would skip
    // past any post-yield statement. Recording up front guarantees the
    // event lands in the ring buffer regardless of whether the yield
    // completes or aborts. Matches the same invariant we rely on for
    // the success-path recordTermination before the done yield.
    recordTermination({
      reason: signal?.aborted ? "stream.aborted.signal" : "stream.finalized.error",
      conversationId,
      messageId: assistantMsg.id,
      durationMs: Date.now() - startedAt.getTime(),
      error: errorMessage.slice(0, 500),
    });

    if (fullText && fullText.length > 50) {
      // Substantial content was already streamed — complete gracefully with warning
      const warning = `\n\n---\n\n*Response may be incomplete: ${errorMessage}*`;
      fullText += warning;
      yield { type: "delta", content: warning };

      await updateMessageContent(assistantMsg.id, fullText);
      await updateMessageStatus(assistantMsg.id, "complete");

      await recordUsageLedgerEntry({
        projectId: conversation.projectId,
        activityType: "chat_turn",
        runtimeId,
        providerId,
        modelId: usage.modelId ?? target.effectiveModelId ?? conversation.modelId ?? null,
        inputTokens: usage.inputTokens ?? null,
        outputTokens: usage.outputTokens ?? null,
        totalTokens: usage.totalTokens ?? null,
        status: "completed",
        startedAt,
        finishedAt: new Date(),
      });

      yield { type: "done", messageId: assistantMsg.id, quickAccess: [] };
    } else {
      // No meaningful content — show as error. Fallback chain ensures we
      // never write an empty string even if both fullText and errorMessage
      // happen to be blank.
      await updateMessageContent(
        assistantMsg.id,
        fullText ||
          errorMessage ||
          "(Response failed — no error detail available.)"
      );
      await updateMessageStatus(assistantMsg.id, "error");

      await recordUsageLedgerEntry({
        projectId: conversation.projectId,
        activityType: "chat_turn",
        runtimeId,
        providerId,
        modelId: usage.modelId ?? target.effectiveModelId ?? conversation.modelId ?? null,
        inputTokens: usage.inputTokens ?? null,
        outputTokens: usage.outputTokens ?? null,
        totalTokens: usage.totalTokens ?? null,
        status: signal?.aborted ? "cancelled" : "failed",
        startedAt,
        finishedAt: new Date(),
      });

      yield { type: "error", message: errorMessage };
    }
  } finally {
    // Safety net: guarantee the placeholder row never remains in
    // status='streaming' after the generator exits. Catches code paths that
    // bypass the catch block — most notably async iterator abandonment, where
    // a consumer `break`ing out of a `for await` loop triggers the generator's
    // return() method and jumps straight here, skipping catch entirely.
    try {
      await finalizeStreamingMessage(assistantMsg.id, fullText);
    } catch (finalizeErr) {
      console.error("[chat] finalize safety net failed:", finalizeErr);
    }
    unregisterChatStream(conversationId);
    cleanupConversation(conversationId);
  }
}
