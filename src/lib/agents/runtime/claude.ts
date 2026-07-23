import { query } from "@anthropic-ai/claude-agent-sdk";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { updateAuthStatus, getAuthEnv, getAuthSettings } from "@/lib/settings/auth";
import { getExecution, removeExecution } from "@/lib/agents/execution-manager";
import { getProfile, listProfiles } from "@/lib/agents/profiles/registry";
import { resolveProfileRuntimePayload } from "@/lib/agents/profiles/compatibility";
import { executeClaudeTask, resumeClaudeTask } from "@/lib/agents/claude-agent";
import { getRuntimeCapabilities, getRuntimeCatalogEntry } from "./catalog";
import { resolvePreferredModel } from "./model-preference";
import { buildClaudeSdkEnv } from "./claude-sdk";
import { getLaunchCwd } from "@/lib/environment/workspace-context";
import { getSetting } from "@/lib/settings/helpers";
import { SETTINGS_KEYS } from "@/lib/constants/settings";
import type {
  AgentRuntimeAdapter,
  RuntimeConnectionResult,
  TaskAssistInput,
} from "./types";
import type { ProfileTestResult, ProfileTestReport } from "@/lib/agents/profiles/test-types";
import type { TaskAssistResponse } from "./task-assist-types";
import {
  extractUsageSnapshot,
  mergeUsageSnapshot,
  recordUsageLedgerEntry,
  type UsageSnapshot,
} from "@/lib/usage/ledger";
import { readClaudeConnectionProbe } from "./claude-connection-probe";

/**
 * The model alias to pass to the Claude Agent SDK's `query()`.
 *
 * Returns a generic family alias (e.g. "opus") from the catalog rather than a
 * dated snapshot, so the runtime tracks whatever the SDK considers the latest
 * model in that family instead of pinning to a string that silently ages out.
 * Without this, `query()` omits `model` entirely and the SDK falls back to its
 * own default — which is not necessarily the family the chat picker selected.
 *
 * Honors the user's onboarding model preference ("Balanced" means Sonnet
 * everywhere, not just chat); falls back to the quality tier when no
 * preference is recorded.
 */
async function claudeCodeModelAlias(): Promise<string> {
  return (await resolvePreferredModel("claude-code")).modelId;
}

function buildTaskAssistSystemPrompt(profileIds: string[]): string {
  const profileList = profileIds.length > 0
    ? `Available agent profiles: ${profileIds.join(", ")}\nUse "auto" if unsure which profile fits a step.`
    : `No explicit profiles available. Use "auto" for suggestedProfile.`;

  return `You are an AI task definition assistant. Analyze the given task and return ONLY a JSON object (no markdown, no code fences) with:
- "improvedDescription": A clearer version of the task for an AI agent to execute
- "breakdown": Array of step objects if complex (empty array if simple). Each step: {title, description, suggestedProfile?, requiresApproval?, dependsOn?}
  - "suggestedProfile": one of the available profile IDs or "auto"
  - "requiresApproval": true if the step involves irreversible actions needing human review
  - "dependsOn": array of step indices (0-based) this step depends on (for parallel/swarm patterns)
- "recommendedPattern": one of "single", "sequence", "planner-executor", "checkpoint", "parallel", "loop", "swarm"
  - "sequence": steps run one after another in order
  - "planner-executor": first step plans, remaining steps execute the plan
  - "checkpoint": like sequence but certain steps pause for human approval
  - "parallel": independent steps run concurrently, a final synthesis step merges results (use dependsOn to mark the synthesis step)
  - "loop": a single step repeats iteratively until a goal is met (include suggestedLoopConfig)
  - "swarm": first step is the mayor (coordinator), middle steps are workers (run in parallel), last step is the refinery (merges results)
- "complexity": "simple", "moderate", or "complex"
- "needsCheckpoint": true if irreversible actions or needs human review
- "reasoning": Brief explanation of why you chose this pattern
- "suggestedLoopConfig": {maxIterations, timeBudgetMs?} — only for loop pattern
- "suggestedSwarmConfig": {workerConcurrencyLimit?} — only for swarm pattern

${profileList}

Pattern selection guide:
- Use "single" for simple, atomic tasks
- Use "sequence" for ordered multi-step work where each step builds on the previous
- Use "planner-executor" when the task needs analysis before action
- Use "checkpoint" when steps involve deployments, deletions, or other irreversible actions
- Use "parallel" when sub-tasks are independent and can run concurrently (research, analysis)
- Use "loop" for iterative refinement (code review cycles, optimization passes)
- Use "swarm" for complex tasks needing multiple specialized agents coordinated by a lead`;
}

async function collectResultText(
  response: AsyncIterable<Record<string, unknown>>
): Promise<{ resultText: string; usage: UsageSnapshot }> {
  let resultText = "";
  let usage: UsageSnapshot = {};

  for await (const raw of response) {
    usage = mergeUsageSnapshot(usage, extractUsageSnapshot(raw));

    if (raw.type === "content_block_delta") {
      const delta = raw.delta as Record<string, unknown> | undefined;
      if (delta?.type === "text_delta" && typeof delta.text === "string") {
        resultText += delta.text;
      }
    } else if (raw.type === "result" && "result" in raw) {
      if (raw.is_error) {
        throw new Error(typeof raw.result === "string" ? raw.result : "Agent SDK returned an error");
      }
      const result = raw.result;
      if (typeof result === "string" && result.length > 0) {
        resultText = result;
      }
      break;
    }
  }

  return { resultText, usage };
}

/** Read the user-configurable SDK timeout (in ms). Falls back to 60s. */
async function getSdkTimeout(): Promise<number> {
  const raw = await getSetting(SETTINGS_KEYS.SDK_TIMEOUT_SECONDS);
  const seconds = raw ? parseInt(raw, 10) : 60;
  return (isNaN(seconds) || seconds < 10 ? 60 : seconds) * 1000;
}

/** Check if an error is an abort/timeout error from the SDK. */
function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.message.includes("aborted"))
  );
}

export async function runSingleProfileTest(
  profileId: string,
  test: { task: string; expectedKeywords: string[] }
): Promise<ProfileTestResult> {
  const profile = getProfile(profileId);
  if (!profile) {
    throw new Error(`Profile "${profileId}" not found`);
  }

  const payload = resolveProfileRuntimePayload(profile, "claude-code");
  if (!payload.supported) {
    throw new Error(payload.reason ?? `Profile "${profile.name}" is not supported on Claude Code`);
  }

  const prompt = `${payload.instructions}\n\n---\n\nTask: ${test.task}\n\nProvide a brief analysis (2-3 paragraphs max). Include specific terminology relevant to your domain.`;
  const authEnv = await getAuthEnv();
  const abortController = new AbortController();
  const sdkTimeoutMs = await getSdkTimeout();
  const timeout = setTimeout(() => abortController.abort(), sdkTimeoutMs);
  const startedAt = new Date();
  let usage: UsageSnapshot = {};
  let ledgerRecorded = false;

  try {
    const response = query({
      prompt,
      options: {
        abortController,
        model: await claudeCodeModelAlias(),
        includePartialMessages: true,
        env: buildClaudeSdkEnv(authEnv),
        allowedTools: [],
      },
    });

    let responseText = "";
    for await (const event of response as AsyncIterable<Record<string, unknown>>) {
      usage = mergeUsageSnapshot(usage, extractUsageSnapshot(event));
      if (event.type === "content_block_delta") {
        const delta = event.delta as Record<string, unknown> | undefined;
        if (delta?.type === "text_delta" && typeof delta.text === "string") {
          responseText += delta.text;
        }
      } else if (event.type === "result") {
        const resultText = event.result;
        if (typeof resultText === "string") {
          responseText = resultText;
        }
      }
    }

    const lowerResponse = responseText.toLowerCase();
    const foundKeywords = test.expectedKeywords.filter((kw) =>
      lowerResponse.includes(kw.toLowerCase())
    );
    const missingKeywords = test.expectedKeywords.filter(
      (kw) => !lowerResponse.includes(kw.toLowerCase())
    );

    await recordUsageLedgerEntry({
      activityType: "profile_test",
      runtimeId: "claude-code",
      providerId: "anthropic",
      modelId: usage.modelId ?? null,
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      totalTokens: usage.totalTokens ?? null,
      status: "completed",
      startedAt,
      finishedAt: new Date(),
    });
    ledgerRecorded = true;

    return {
      task: test.task,
      expectedKeywords: test.expectedKeywords,
      foundKeywords,
      missingKeywords,
      passed: missingKeywords.length === 0,
    };
  } catch {
    await recordUsageLedgerEntry({
      activityType: "profile_test",
      runtimeId: "claude-code",
      providerId: "anthropic",
      modelId: usage.modelId ?? null,
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      totalTokens: usage.totalTokens ?? null,
      status: "failed",
      startedAt,
      finishedAt: new Date(),
    });
    ledgerRecorded = true;
    return {
      task: test.task,
      expectedKeywords: test.expectedKeywords,
      foundKeywords: [],
      missingKeywords: test.expectedKeywords,
      passed: false,
    };
  } finally {
    if (!ledgerRecorded && (abortController.signal.aborted || usage.modelId || usage.totalTokens != null)) {
      await recordUsageLedgerEntry({
        activityType: "profile_test",
        runtimeId: "claude-code",
        providerId: "anthropic",
        modelId: usage.modelId ?? null,
        inputTokens: usage.inputTokens ?? null,
        outputTokens: usage.outputTokens ?? null,
        totalTokens: usage.totalTokens ?? null,
        status: "failed",
        startedAt,
        finishedAt: new Date(),
      }).catch(() => {});
    }
    clearTimeout(timeout);
  }
}

async function runClaudeProfileTests(profileId: string): Promise<ProfileTestReport> {
  const profile = getProfile(profileId);
  if (!profile) {
    throw new Error(`Profile "${profileId}" not found`);
  }

  const payload = resolveProfileRuntimePayload(profile, "claude-code");
  if (!payload.supported) {
    return {
      profileId,
      profileName: profile.name,
      runtimeId: "claude-code",
      results: [],
      totalPassed: 0,
      totalFailed: 0,
      unsupported: true,
      unsupportedReason: payload.reason,
    };
  }

  if (!payload.tests || payload.tests.length === 0) {
    return {
      profileId,
      profileName: profile.name,
      runtimeId: "claude-code",
      results: [],
      totalPassed: 0,
      totalFailed: 0,
    };
  }

  const results: ProfileTestResult[] = [];
  for (const test of payload.tests) {
    results.push(await runSingleProfileTest(profileId, test));
  }

  return {
    profileId,
    profileName: profile.name,
    runtimeId: "claude-code",
    results,
    totalPassed: results.filter((result) => result.passed).length,
    totalFailed: results.filter((result) => !result.passed).length,
  };
}

// ---------------------------------------------------------------------------
// Lightweight meta-completion (pattern extraction, context summarization, etc.)
// ---------------------------------------------------------------------------

export async function runMetaCompletion(input: {
  prompt: string;
  activityType: string;
}): Promise<{ text: string; usage: UsageSnapshot }> {
  const authEnv = await getAuthEnv();
  const startedAt = new Date();
  let usage: UsageSnapshot = {};
  const abortController = new AbortController();
  const sdkTimeoutMs = await getSdkTimeout();
  const timeout = setTimeout(() => abortController.abort(), sdkTimeoutMs);

  try {
    const response = query({
      prompt: input.prompt,
      options: {
        abortController,
        model: await claudeCodeModelAlias(),
        includePartialMessages: true,
        cwd: getLaunchCwd(),
        env: buildClaudeSdkEnv(authEnv),
        allowedTools: [],
        maxTurns: 1,
      },
    });

    const collected = await collectResultText(
      response as AsyncIterable<Record<string, unknown>>
    );
    usage = collected.usage;

    await recordUsageLedgerEntry({
      activityType: input.activityType as import("@/lib/usage/ledger").UsageActivityType,
      runtimeId: "claude-code",
      providerId: "anthropic",
      modelId: usage.modelId ?? null,
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      totalTokens: usage.totalTokens ?? null,
      status: "completed",
      startedAt,
      finishedAt: new Date(),
    });

    return { text: collected.resultText, usage };
  } catch (error) {
    await recordUsageLedgerEntry({
      activityType: input.activityType as import("@/lib/usage/ledger").UsageActivityType,
      runtimeId: "claude-code",
      providerId: "anthropic",
      modelId: usage.modelId ?? null,
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      totalTokens: usage.totalTokens ?? null,
      status: "failed",
      startedAt,
      finishedAt: new Date(),
    });
    if (isAbortError(error)) {
      throw new Error("Request timed out. You can increase the timeout in Settings → Runtime.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Profile AI Assist
// ---------------------------------------------------------------------------

function buildProfileAssistSystemPrompt(existingProfileIds: string[]): string {
  const profileList = existingProfileIds.length > 0
    ? `Existing profiles (avoid duplicating): ${existingProfileIds.join(", ")}`
    : "No existing profiles.";

  return `You are a ainative profile generation assistant. Given a user's goal description, generate a complete agent profile configuration.

Return ONLY a JSON object (no markdown, no code fences) with this exact schema:
{
  "name": "Display Name",
  "description": "One-line description",
  "domain": "work" or "personal",
  "tags": ["tag1", "tag2"],
  "skillMd": "Full SKILL.md content (see best practices below)",
  "allowedTools": ["Read", "Grep"] or [] for unrestricted,
  "canUseToolPolicy": { "autoApprove": ["Read"], "autoDeny": [] },
  "maxTurns": 30,
  "outputFormat": "markdown" or other format hint,
  "supportedRuntimes": ["claude-code"],
  "tests": [{"task": "...", "expectedKeywords": ["kw1", "kw2"]}],
  "reasoning": "Why these choices were made"
}

## SKILL.md Best Practices

The skillMd field must follow Claude Code / Codex skill conventions:

1. Start with YAML frontmatter:
   ---
   name: profile-id
   description: One-line description
   ---

2. Open with a clear role statement: "You are a [role]. Your job is to [primary capability]."

3. Include a "## Guidelines" section with numbered priorities.

4. Include a "## Output Format" section defining structured output expectations.

5. Keep instructions concrete and actionable. Avoid vague directives.

6. Use markdown formatting: headers, numbered lists, bold for emphasis.

7. Target 15-40 lines for most profiles. Complex profiles may be longer.

## Available Tools (for allowedTools field)

Core: Read, Write, Edit, Bash, Grep, Glob
Extended: WebSearch, WebFetch
Notebook: NotebookEdit, NotebookRead
Task: TodoRead, TodoWrite

Tool selection guidelines:
- Read-only agents: [Read, Grep, Glob]
- Read-write agents: [Read, Write, Edit, Bash, Grep, Glob]
- Research agents: [Read, WebSearch, WebFetch, Grep]
- Leave empty array [] to allow all tools

## canUseToolPolicy Guidelines

- autoApprove: Tools safe to run without confirmation (typically Read, Grep, Glob)
- autoDeny: Tools that should never run (e.g., deny Write for read-only agents)
- Personal domain agents should autoDeny [Bash, Write, Edit] by default

## maxTurns Guidelines

- Simple Q&A: 5-10
- Analysis/review: 15-25
- Multi-step execution: 25-40
- Complex research/sweep: 40-60

## Test Generation

Generate 1-3 smoke tests:
- Realistic task description the agent would receive
- 3-5 expectedKeywords that a good response would contain
- Cover the primary use case

${profileList}`;
}

function buildRefineSkillMdPrompt(): string {
  return `You are a SKILL.md improvement assistant. Given an existing SKILL.md and the user's goal, return an improved version.

Return ONLY a JSON object with:
{
  "skillMd": "The improved SKILL.md content",
  "reasoning": "What was changed and why"
}

Follow the same SKILL.md best practices: YAML frontmatter, role statement, guidelines section, output format section.`;
}

function buildSuggestTestsPrompt(): string {
  return `You are a test generation assistant. Given an existing SKILL.md, generate smoke tests to verify the profile works correctly.

Return ONLY a JSON object with:
{
  "tests": [{"task": "...", "expectedKeywords": ["kw1", "kw2", "kw3"]}],
  "reasoning": "Why these tests cover the profile's key behaviors"
}

Generate 2-4 tests covering different aspects of the profile's capabilities. Each test should have a realistic task and 3-5 keywords.`;
}

async function runClaudeProfileAssist(
  input: import("./profile-assist-types").ProfileAssistRequest
): Promise<import("./profile-assist-types").ProfileAssistResponse> {
  const authEnv = await getAuthEnv();
  const startedAt = new Date();
  let usage: UsageSnapshot = {};

  let systemPrompt: string;
  let userMessage: string;

  if (input.mode === "refine-skillmd") {
    systemPrompt = buildRefineSkillMdPrompt();
    userMessage = `Goal: ${input.goal}\n\nExisting SKILL.md:\n${input.existingSkillMd ?? "(empty)"}`;
  } else if (input.mode === "suggest-tests") {
    systemPrompt = buildSuggestTestsPrompt();
    userMessage = `SKILL.md:\n${input.existingSkillMd ?? "(empty)"}\n\nTags: ${input.existingTags?.join(", ") ?? "none"}`;
  } else {
    const profileIds = listProfiles().map((p) => p.id);
    systemPrompt = buildProfileAssistSystemPrompt(profileIds);
    userMessage = `Goal: ${input.goal}${input.domain ? `\nPreferred domain: ${input.domain}` : ""}`;
  }

  const prompt = `${systemPrompt}\n\n${userMessage}`;
  const abortController = new AbortController();
  const sdkTimeoutMs = await getSdkTimeout();
  const timeout = setTimeout(() => abortController.abort(), sdkTimeoutMs);

  try {
    const response = query({
      prompt,
      options: {
        abortController,
        model: await claudeCodeModelAlias(),
        includePartialMessages: true,
        cwd: getLaunchCwd(),
        env: buildClaudeSdkEnv(authEnv),
        allowedTools: [],
        maxTurns: 1,
      },
    });

    const collected = await collectResultText(
      response as AsyncIterable<Record<string, unknown>>
    );
    usage = collected.usage;

    if (!collected.resultText) {
      throw new Error("No result from AI");
    }

    const jsonMatch = collected.resultText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse AI response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    await recordUsageLedgerEntry({
      activityType: "profile_assist",
      runtimeId: "claude-code",
      providerId: "anthropic",
      modelId: usage.modelId ?? null,
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      totalTokens: usage.totalTokens ?? null,
      status: "completed",
      startedAt,
      finishedAt: new Date(),
    });

    return parsed;
  } catch (error) {
    await recordUsageLedgerEntry({
      activityType: "profile_assist",
      runtimeId: "claude-code",
      providerId: "anthropic",
      modelId: usage.modelId ?? null,
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      totalTokens: usage.totalTokens ?? null,
      status: "failed",
      startedAt,
      finishedAt: new Date(),
    });
    if (isAbortError(error)) {
      throw new Error("Request timed out. You can increase the timeout in Settings → Runtime.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function runClaudeTaskAssist(
  input: TaskAssistInput
): Promise<TaskAssistResponse> {
  const userMessage = [
    input.title ? `Task title: ${input.title}` : "",
    input.description ? `Description: ${input.description}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const authEnv = await getAuthEnv();
  const profileIds = listProfiles().map((p) => p.id);
  const systemPrompt = buildTaskAssistSystemPrompt(profileIds);
  const prompt = `${systemPrompt}\n\n${userMessage}`;
  const startedAt = new Date();
  let usage: UsageSnapshot = {};

  const abortController = new AbortController();
  const sdkTimeoutMs = await getSdkTimeout();
  const timeout = setTimeout(() => abortController.abort(), sdkTimeoutMs);

  try {
    const response = query({
      prompt,
      options: {
        abortController,
        model: await claudeCodeModelAlias(),
        includePartialMessages: true,
        cwd: getLaunchCwd(),
        env: buildClaudeSdkEnv(authEnv),
        allowedTools: [],   // No tool use — pure text completion
        maxTurns: 1,        // Single turn only — no agentic loop
      },
    });

    const collected = await collectResultText(
      response as AsyncIterable<Record<string, unknown>>
    );
    usage = collected.usage;

    if (!collected.resultText) {
      throw new Error("No result from AI");
    }

    const jsonMatch = collected.resultText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse AI response");
    }

    const parsed = JSON.parse(jsonMatch[0]) as TaskAssistResponse;

    await recordUsageLedgerEntry({
      activityType: "task_assist",
      runtimeId: "claude-code",
      providerId: "anthropic",
      modelId: usage.modelId ?? null,
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      totalTokens: usage.totalTokens ?? null,
      status: "completed",
      startedAt,
      finishedAt: new Date(),
    });

    return parsed;
  } catch (error) {
    await recordUsageLedgerEntry({
      activityType: "task_assist",
      runtimeId: "claude-code",
      providerId: "anthropic",
      modelId: usage.modelId ?? null,
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      totalTokens: usage.totalTokens ?? null,
      status: "failed",
      startedAt,
      finishedAt: new Date(),
    });
    if (isAbortError(error)) {
      throw new Error("Request timed out. You can increase the timeout in Settings → Runtime.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function testClaudeConnection(): Promise<RuntimeConnectionResult> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 10_000);

  try {
    const [authEnv, authSettings] = await Promise.all([
      getAuthEnv(),
      getAuthSettings(),
    ]);
    const response = query({
      prompt: "Reply with exactly: OK",
      options: {
        abortController,
        model: await claudeCodeModelAlias(),
        maxTurns: 1,
        includePartialMessages: false,
        cwd: getLaunchCwd(),
        env: buildClaudeSdkEnv(authEnv),
      },
    });

    const result = await readClaudeConnectionProbe(
      response as AsyncIterable<Record<string, unknown>>,
      authSettings.method === "api_key"
        ? authSettings.apiKeySource
        : "unknown",
    );
    await updateAuthStatus(result.connected ? (result.apiKeySource ?? "unknown") : "unknown");
    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await updateAuthStatus("unknown");
    return {
      connected: false,
      error: abortController.signal.aborted
        ? "Claude connection test timed out before authentication was verified."
        : message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function cancelClaudeTask(taskId: string): Promise<void> {
  const execution = getExecution(taskId);
  if (execution) {
    execution.abortController.abort();
    removeExecution(taskId);
  }

  await db
    .update(tasks)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
}

export const claudeRuntimeAdapter: AgentRuntimeAdapter = {
  metadata: {
    ...getRuntimeCatalogEntry("claude-code"),
    capabilities: getRuntimeCapabilities("claude-code"),
  },
  executeTask(taskId: string) {
    return executeClaudeTask(taskId);
  },
  resumeTask(taskId: string) {
    return resumeClaudeTask(taskId);
  },
  cancelTask(taskId: string) {
    return cancelClaudeTask(taskId);
  },
  runTaskAssist(input: TaskAssistInput) {
    return runClaudeTaskAssist(input);
  },
  runProfileAssist(input: import("./profile-assist-types").ProfileAssistRequest) {
    return runClaudeProfileAssist(input);
  },
  runProfileTests(profileId: string) {
    return runClaudeProfileTests(profileId);
  },
  testConnection() {
    return testClaudeConnection();
  },
};
