import {
  DEFAULT_AGENT_RUNTIME,
  getRuntimeCapabilities,
  getRuntimeCatalogEntry,
  getRuntimeFeatures,
  listRuntimeCatalog,
  resolveAgentRuntime,
  type AgentRuntimeId,
} from "./catalog";
import { claudeRuntimeAdapter } from "./claude";
import { openAICodexRuntimeAdapter } from "./openai-codex";
import { anthropicDirectRuntimeAdapter } from "./anthropic-direct";
import { openAIDirectRuntimeAdapter } from "./openai-direct";
import { ollamaRuntimeAdapter } from "./ollama-adapter";
import {
  liteLLMRuntimeAdapter,
  lmStudioRuntimeAdapter,
} from "./openai-compatible-adapter";
import { getProfile } from "@/lib/agents/profiles/registry";
import { resolveProfileRuntimePayload } from "@/lib/agents/profiles/compatibility";
import type {
  AgentRuntimeAdapter,
  RuntimeConnectionResult,
  RuntimeSummary,
  TaskAssistInput,
} from "./types";
import type { ProfileTestReport } from "@/lib/agents/profiles/test-types";
import type { TaskAssistResponse } from "./task-assist-types";
import type { ProfileAssistRequest, ProfileAssistResponse } from "./profile-assist-types";
import {
  enforceBudgetGuardrails,
  enforceTaskBudgetGuardrails,
} from "@/lib/settings/budget-guardrails";

const runtimeRegistry: Record<AgentRuntimeId, AgentRuntimeAdapter> = {
  "claude-code": claudeRuntimeAdapter,
  "openai-codex-app-server": openAICodexRuntimeAdapter,
  "anthropic-direct": anthropicDirectRuntimeAdapter,
  "openai-direct": openAIDirectRuntimeAdapter,
  ollama: ollamaRuntimeAdapter,
  litellm: liteLLMRuntimeAdapter,
  lmstudio: lmStudioRuntimeAdapter,
};

function getRuntimeAdapter(runtimeId?: string | null): AgentRuntimeAdapter {
  return runtimeRegistry[resolveAgentRuntime(runtimeId)];
}

function assertCapability(
  runtimeId: string | null | undefined,
  capability: keyof AgentRuntimeAdapter["metadata"]["capabilities"]
): AgentRuntimeAdapter {
  const resolvedRuntime = resolveAgentRuntime(runtimeId);
  const adapter = runtimeRegistry[resolvedRuntime];

  if (!adapter.metadata.capabilities[capability]) {
    throw new Error(
      `Runtime "${resolvedRuntime}" does not support ${capability}`
    );
  }

  return adapter;
}

export function getRuntimeSummary(
  runtimeId: string | null | undefined = DEFAULT_AGENT_RUNTIME
): RuntimeSummary {
  const resolvedRuntime = resolveAgentRuntime(runtimeId);
  return {
    runtime: runtimeRegistry[resolvedRuntime].metadata,
    capabilities: getRuntimeCapabilities(resolvedRuntime),
  };
}

export function listRuntimeSummaries(): RuntimeSummary[] {
  return listRuntimeCatalog().map((runtime) => ({
    runtime,
    capabilities: runtime.capabilities,
  }));
}

export async function executeTaskWithRuntime(
  taskId: string,
  runtimeId?: string | null
): Promise<void> {
  await enforceTaskBudgetGuardrails(taskId, { failTaskOnBlock: true });
  return getRuntimeAdapter(runtimeId).executeTask(taskId);
}

export async function resumeTaskWithRuntime(
  taskId: string,
  runtimeId?: string | null
): Promise<void> {
  await enforceTaskBudgetGuardrails(taskId, {
    isResume: true,
    failTaskOnBlock: true,
  });
  const adapter = assertCapability(runtimeId, "resume");
  return adapter.resumeTask(taskId);
}

export async function cancelTaskWithRuntime(
  taskId: string,
  runtimeId?: string | null
): Promise<void> {
  const adapter = assertCapability(runtimeId, "cancel");
  return adapter.cancelTask(taskId);
}

export async function runTaskAssistWithRuntime(
  input: TaskAssistInput,
  runtimeId?: string | null
): Promise<TaskAssistResponse> {
  await enforceBudgetGuardrails({
    runtimeId: resolveAgentRuntime(runtimeId),
    activityType: "task_assist",
  });
  const adapter = assertCapability(runtimeId, "taskAssist");
  if (!adapter.runTaskAssist) {
    throw new Error(`Runtime "${adapter.metadata.id}" does not implement task assist`);
  }
  return adapter.runTaskAssist(input);
}

export async function runProfileAssistWithRuntime(
  input: ProfileAssistRequest,
  runtimeId?: string | null
): Promise<ProfileAssistResponse> {
  await enforceBudgetGuardrails({
    runtimeId: resolveAgentRuntime(runtimeId),
    activityType: "profile_assist",
  });
  const adapter = assertCapability(runtimeId, "profileAssist");
  if (!adapter.runProfileAssist) {
    throw new Error(`Runtime "${adapter.metadata.id}" does not implement profile assist`);
  }
  return adapter.runProfileAssist(input);
}

export async function runProfileTestsWithRuntime(
  profileId: string,
  runtimeId?: string | null
): Promise<ProfileTestReport> {
  const resolvedRuntime = resolveAgentRuntime(runtimeId);
  const profile = getProfile(profileId);
  if (!profile) {
    throw new Error(`Profile "${profileId}" not found`);
  }

  const payload = resolveProfileRuntimePayload(profile, resolvedRuntime);
  if (!payload.supported) {
    return {
      profileId,
      profileName: profile.name,
      runtimeId: resolvedRuntime,
      results: [],
      totalPassed: 0,
      totalFailed: 0,
      unsupported: true,
      unsupportedReason:
        payload.reason ??
        `${profile.name} does not support ${getRuntimeCatalogEntry(resolvedRuntime).label}`,
    };
  }

  const adapter = getRuntimeAdapter(resolvedRuntime);
  if (!adapter.metadata.capabilities.profileTests || !adapter.runProfileTests) {
    return {
      profileId,
      profileName: profile.name,
      runtimeId: resolvedRuntime,
      results: [],
      totalPassed: 0,
      totalFailed: 0,
      unsupported: true,
      unsupportedReason: `${adapter.metadata.label} does not support profile smoke tests yet`,
    };
  }

  await enforceBudgetGuardrails({
    runtimeId: resolvedRuntime,
    activityType: "profile_test",
  });

  return adapter.runProfileTests(profileId);
}

export async function testRuntimeConnection(
  runtimeId?: string | null
): Promise<RuntimeConnectionResult> {
  const adapter = assertCapability(runtimeId, "authHealthCheck");
  if (!adapter.testConnection) {
    throw new Error(`Runtime "${adapter.metadata.id}" does not implement health checks`);
  }
  return adapter.testConnection();
}

export { getRuntimeFeatures };
export type { RuntimeFeatures } from "./catalog";
