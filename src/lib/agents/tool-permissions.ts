/**
 * Shared tool permission handling for task-based runtimes.
 *
 * Extracted from claude-agent.ts so that all task runtimes (Claude SDK,
 * Anthropic Direct, OpenAI Direct) can reuse the same HITL permission
 * logic. Uses DB notification polling — the Inbox UI writes responses.
 */

import { z } from "zod";
import { isPerToolApprovalEnabled } from "@/lib/config/env";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { CanUseToolPolicy } from "./profiles/types";
import { isExaTool, isExaReadOnly } from "./browser-mcp";
import { CLAUDE_SDK_READ_ONLY_FS_TOOLS } from "./runtime/claude-sdk";

// ── Types ────────────────────────────────────────────────────────────

export const toolPermissionResponseSchema = z.object({
  behavior: z.enum(["allow", "deny"]),
  updatedInput: z.unknown().optional(),
  message: z.string().optional(),
});

export type ToolPermissionResponse = z.infer<typeof toolPermissionResponseSchema>;

// ── Caches ───────────────────────────────────────────────────────────

const inFlightPermissionRequests = new Map<string, Promise<ToolPermissionResponse>>();
const settledPermissionRequests = new Map<string, ToolPermissionResponse>();

// ── Response builders ────────────────────────────────────────────────

export function buildAllowedToolPermissionResponse(
  input: Record<string, unknown>,
): ToolPermissionResponse {
  return { behavior: "allow", updatedInput: input };
}

export function normalizeToolPermissionResponse(
  response: ToolPermissionResponse,
  input: Record<string, unknown>,
): ToolPermissionResponse {
  if (response.behavior !== "allow" || response.updatedInput !== undefined) {
    return response;
  }
  return { ...response, updatedInput: input };
}

// ── Cache helpers ────────────────────────────────────────────────────

export function buildPermissionCacheKey(
  taskId: string,
  toolName: string,
  input: Record<string, unknown>,
): string {
  return `${taskId}::${toolName}::${JSON.stringify(input)}`;
}

export function clearPermissionCache(taskId: string) {
  const prefix = `${taskId}::`;

  for (const key of inFlightPermissionRequests.keys()) {
    if (key.startsWith(prefix)) inFlightPermissionRequests.delete(key);
  }
  for (const key of settledPermissionRequests.keys()) {
    if (key.startsWith(prefix)) settledPermissionRequests.delete(key);
  }
}

// ── DB polling ───────────────────────────────────────────────────────

export async function waitForToolPermissionResponse(
  notificationId: string,
): Promise<ToolPermissionResponse> {
  const deadline = Date.now() + 55_000;
  const pollInterval = 1500;

  while (Date.now() < deadline) {
    const [notification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notificationId));

    if (notification?.response) {
      try {
        const parsed = JSON.parse(notification.response);
        const validated = toolPermissionResponseSchema.safeParse(parsed);
        if (validated.success) return validated.data;
        console.error("[tool-permissions] Invalid permission response shape:", validated.error.message);
        return { behavior: "deny", message: "Invalid response format" };
      } catch (err) {
        console.error("[tool-permissions] Failed to parse permission response:", err);
        return { behavior: "deny", message: "Invalid response format" };
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return { behavior: "deny", message: "Permission request timed out" };
}

// ── Main permission handler ──────────────────────────────────────────

/**
 * Handle tool permission for task-based runtimes.
 *
 * Permission layers:
 * 1. Profile canUseToolPolicy (autoApprove / autoDeny)
 * 1.5. External MCP read-only tools (Exa search)
 * 1.75. SDK filesystem read-only tools + Skill auto-approve
 * 1.8. Plugin-MCP per-tool approval overlay (T10) — `never` auto-allows;
 *      `prompt` and `approve` fall through to Layer 2+.
 * 2. Saved user permissions (settings-based patterns)
 * 3. Request deduplication cache
 * 4. DB notification + polling (HITL)
 */
export async function handleToolPermission(
  taskId: string,
  toolName: string,
  input: Record<string, unknown>,
  canUseToolPolicy?: CanUseToolPolicy,
): Promise<ToolPermissionResponse> {
  const isQuestion = toolName === "AskUserQuestion";

  // Layer 1: Profile-level canUseToolPolicy — fastest check, no I/O.
  // Runs BEFORE Layer 1.75's SDK filesystem auto-allow so `autoDeny: ["Read"]`
  // still denies; `autoApprove` for Read/Grep/Glob is redundant (Layer 1.75
  // would also allow) but harmless.
  if (!isQuestion && canUseToolPolicy) {
    if (canUseToolPolicy.autoApprove?.includes(toolName)) {
      return buildAllowedToolPermissionResponse(input);
    }
    if (canUseToolPolicy.autoDeny?.includes(toolName)) {
      return { behavior: "deny", message: `Profile policy denies ${toolName}` };
    }
  }

  // Layer 1.5: External MCP read-only tools — auto-approve without I/O
  if (!isQuestion && isExaTool(toolName) && isExaReadOnly(toolName)) {
    return buildAllowedToolPermissionResponse(input);
  }

  // Layer 1.75: SDK filesystem read-only tools and Skill invocations —
  // auto-approve without I/O. Mirrors the chat-side Phase 1a policy
  // (src/lib/chat/engine.ts canUseTool). Read/Grep/Glob are non-destructive;
  // Skill load is equivalent to using `claude` CLI directly — any tool the
  // loaded skill subsequently invokes (Bash, Edit, etc.) goes through this
  // same canUseTool check. See features/chat-claude-sdk-skills.md Error
  // & Rescue Registry row "settingSources loads hostile skill."
  if (!isQuestion && (CLAUDE_SDK_READ_ONLY_FS_TOOLS.has(toolName) || toolName === "Skill")) {
    return buildAllowedToolPermissionResponse(input);
  }

  // Layer 1.8: Plugin-MCP per-tool approval overlay (T10).
  //
  // TDR-037 PARK — this layer is OFF by default because MCP elicitation
  // (SEP-1036) is the strategy-sanctioned runtime consent primitive per
  // strategy Amendment II. Keeping it active duplicated the elicitation
  // surface and was scope creep for the self-extension-first posture.
  // Opt in via `AINATIVE_PER_TOOL_APPROVAL=1` only when exercising the
  // third-party plugin path (runtime consent UI not yet shipped).
  //
  // Plugin tool names follow the canonical MCP form `mcp__<serverName>__<toolName>`.
  // Only plugin-shipped MCP tools hit this layer; all other tools pass through.
  //
  // - `never`   → auto-allow (user has pre-trusted this tool)
  // - `prompt`  → fall through to Layer 2+ (existing notification path)
  // - `approve` → fall through to Layer 2+ (existing blocking modal path)
  // - `null`    → plugin not accepted / non-plugin MCP tool → fall through
  //
  // Dynamic import — see CLAUDE.md "Smoke-test budget" rule: never import
  // `@/lib/plugins/*` statically from runtime-registry-adjacent modules.
  if (
    !isQuestion &&
    toolName.startsWith("mcp__") &&
    isPerToolApprovalEnabled()
  ) {
    const { resolvePluginToolApproval } = await import("@/lib/plugins/capability-check");
    const decision = await resolvePluginToolApproval(toolName);
    if (decision === "never") {
      return buildAllowedToolPermissionResponse(input);
    }
    // "prompt" / "approve" / null → continue through the pipeline.
  }

  // Layer 2: Saved user permissions — skip notification for pre-approved tools
  if (!isQuestion) {
    const { isToolAllowed } = await import("@/lib/settings/permissions");
    if (await isToolAllowed(toolName, input)) {
      return buildAllowedToolPermissionResponse(input);
    }
  }

  // Layer 3 + 4: Deduplication cache + DB notification
  if (!isQuestion) {
    const cacheKey = buildPermissionCacheKey(taskId, toolName, input);
    const settledResponse = settledPermissionRequests.get(cacheKey);
    if (settledResponse) {
      return normalizeToolPermissionResponse(settledResponse, input);
    }

    const pendingRequest = inFlightPermissionRequests.get(cacheKey);
    if (pendingRequest) return pendingRequest;

    const requestPromise = (async () => {
      const notificationId = crypto.randomUUID();

      await db.insert(notifications).values({
        id: notificationId,
        taskId,
        type: "permission_required",
        title: `Permission required: ${toolName}`,
        body: JSON.stringify(input).slice(0, 1000),
        toolName,
        toolInput: JSON.stringify(input),
        createdAt: new Date(),
      });

      const response = normalizeToolPermissionResponse(
        await waitForToolPermissionResponse(notificationId),
        input,
      );
      settledPermissionRequests.set(cacheKey, response);
      return response;
    })();

    inFlightPermissionRequests.set(cacheKey, requestPromise);

    try {
      return await requestPromise;
    } finally {
      inFlightPermissionRequests.delete(cacheKey);
    }
  }

  // AskUserQuestion fallback — always creates notification
  const notificationId = crypto.randomUUID();

  await db.insert(notifications).values({
    id: notificationId,
    taskId,
    type: isQuestion ? "agent_message" : "permission_required",
    title: isQuestion ? "Agent has a question" : `Permission required: ${toolName}`,
    body: JSON.stringify(input).slice(0, 1000),
    toolName,
    toolInput: JSON.stringify(input),
    createdAt: new Date(),
  });

  return waitForToolPermissionResponse(notificationId);
}
