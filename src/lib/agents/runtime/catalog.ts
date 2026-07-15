export const SUPPORTED_AGENT_RUNTIMES = [
  "claude-code",
  "openai-codex-app-server",
  "anthropic-direct",
  "openai-direct",
  "ollama",
  "litellm",
  "lmstudio",
] as const;

export type AgentRuntimeId = (typeof SUPPORTED_AGENT_RUNTIMES)[number];

export const DEFAULT_AGENT_RUNTIME: AgentRuntimeId = "claude-code";

export interface RuntimeCapabilities {
  resume: boolean;
  cancel: boolean;
  approvals: boolean;
  mcpServers: boolean;
  profileTests: boolean;
  taskAssist: boolean;
  profileAssist: boolean;
  authHealthCheck: boolean;
}

/**
 * LLM-surface features that affect what the model sees and which tools/skills
 * ainative exposes to it. Distinct from RuntimeCapabilities above, which is
 * adapter-plumbing concerns (can the adapter resume/cancel/etc.).
 *
 * Values reflect post-Phase-1 capability (what the runtime SDK *can* do),
 * not current engagement (what `engine.ts` currently activates). Downstream
 * features read this bag to decide rendering, filtering, and dispatch.
 */
export interface RuntimeFeatures {
  /** SDK provides a native skill-invocation tool (e.g. Claude SDK `Skill` tool). */
  hasNativeSkills: boolean;
  /** SDK loads skill metadata first, full SKILL.md on demand. */
  hasProgressiveDisclosure: boolean;
  /** Read/Grep/Glob/Edit/Write available as LLM tools. */
  hasFilesystemTools: boolean;
  /** Bash tool available (ainative gates via permission bridge). */
  hasBash: boolean;
  /** TodoWrite tool available. */
  hasTodoWrite: boolean;
  /** Runtime supports delegating to sub-agents (e.g. Task tool). */
  hasSubagentDelegation: boolean;
  /** Runtime loads filesystem hooks (pre/post tool-use shell scripts). */
  hasHooks: boolean;
  /** Which project-level instructions file the runtime auto-loads, if any. */
  autoLoadsInstructions: "CLAUDE.md" | "AGENTS.md" | null;
  /**
   * Runtime has no native skill support — ainative must inject SKILL.md content
   * into the system prompt to expose skills to the LLM.
   */
  ainativeInjectsSkills: boolean;
  /**
   * Runtime supports composing multiple active skills in one conversation.
   * When false, only one skill may be active at a time (Ollama: context
   * budget too tight). When true, `activate_skill mode:"add"` is allowed
   * up to `maxActiveSkills`.
   */
  supportsSkillComposition: boolean;
  /**
   * Maximum number of skills that may be simultaneously active. Enforced
   * by the activate_skill tool. Ignored when supportsSkillComposition=false.
   */
  maxActiveSkills: number;
  /**
   * Runtime accepts plugin-shipped MCP servers injected via the plugin-MCP
   * loader (TDR-035). When false (Ollama), the loader returns {} immediately
   * rather than spawning subprocesses or importing SDK modules.
   *
   * Values per runtime:
   *   claude-code                : true  (Claude SDK mcpServers param)
   *   openai-codex-app-server    : true  (config.toml mcp_servers sync)
   *   anthropic-direct           : true  (Messages API mcp_servers)
   *   openai-direct              : true  (Responses API tools[type=mcp])
   *   ollama                     : false (no MCP surface)
   */
  supportsPluginMcpServers: boolean;
}

export interface RuntimeModelConfig {
  /** Default model ID for this runtime */
  default: string;
  /** All supported model IDs for this runtime */
  supported: string[];
  /**
   * Tier aliases — purpose-labelled picks within this runtime's supported set.
   * Routing recommendations resolve via these so rotating a model ID in the
   * catalog automatically flows into every consumer (task runtime model,
   * chat default model, banner display).
   */
  tiers?: {
    fast?: string;
    balanced?: string;
    quality?: string;
  };
}

export interface RuntimeCatalogEntry {
  id: AgentRuntimeId;
  label: string;
  description: string;
  providerId: "anthropic" | "openai" | "ollama" | "litellm" | "lmstudio";
  capabilities: RuntimeCapabilities;
  features: RuntimeFeatures;
  /** Model catalog — default and supported model IDs for this runtime */
  models: RuntimeModelConfig;
}

const RUNTIME_CATALOG: Record<AgentRuntimeId, RuntimeCatalogEntry> = {
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    description: "Anthropic Claude Agent SDK runtime with approvals, resume, and MCP passthrough.",
    providerId: "anthropic",
    capabilities: {
      resume: true,
      cancel: true,
      approvals: true,
      mcpServers: true,
      profileTests: true,
      taskAssist: true,
      profileAssist: true,
      authHealthCheck: true,
    },
    features: {
      hasNativeSkills: true,
      hasProgressiveDisclosure: true,
      hasFilesystemTools: true,
      hasBash: true,
      hasTodoWrite: true,
      hasSubagentDelegation: false, // ainative task primitives replace SDK Task tool
      hasHooks: false, // excluded per Q2
      autoLoadsInstructions: "CLAUDE.md",
      ainativeInjectsSkills: false,
      supportsSkillComposition: true,
      maxActiveSkills: 3,
      supportsPluginMcpServers: true,
    },
    models: {
      default: "sonnet",
      supported: ["haiku", "sonnet", "opus"],
      tiers: { fast: "haiku", balanced: "sonnet", quality: "opus" },
    },
  },
  "openai-codex-app-server": {
    id: "openai-codex-app-server",
    label: "OpenAI Codex App Server",
    description: "OpenAI Codex runtime over the app server protocol with resumable threads and inbox approvals.",
    providerId: "openai",
    capabilities: {
      resume: true,
      cancel: true,
      approvals: true,
      mcpServers: false,
      profileTests: false,
      taskAssist: true,
      profileAssist: false,
      authHealthCheck: true,
    },
    features: {
      hasNativeSkills: true,
      hasProgressiveDisclosure: true,
      hasFilesystemTools: true,
      hasBash: true,
      hasTodoWrite: true,
      hasSubagentDelegation: false,
      hasHooks: false,
      autoLoadsInstructions: "AGENTS.md",
      ainativeInjectsSkills: false,
      supportsSkillComposition: true,
      maxActiveSkills: 3,
      supportsPluginMcpServers: true,
    },
    models: {
      default: "gpt-5.4",
      supported: ["gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex"],
      tiers: { fast: "gpt-5.4-mini", balanced: "gpt-5.3-codex", quality: "gpt-5.4" },
    },
  },
  "anthropic-direct": {
    id: "anthropic-direct",
    label: "Anthropic Direct API",
    description: "Direct Anthropic Messages API — fast, cost-optimized, no CLI required.",
    providerId: "anthropic",
    capabilities: {
      resume: true,
      cancel: true,
      approvals: true,
      mcpServers: true,
      profileTests: false,
      taskAssist: true,
      profileAssist: true,
      authHealthCheck: true,
    },
    features: {
      // Direct Messages API — no SDK-native skill machinery.
      // Revisit when chat-claude-sdk-skills designs direct-API skill injection.
      hasNativeSkills: false,
      hasProgressiveDisclosure: false,
      hasFilesystemTools: false,
      hasBash: false,
      hasTodoWrite: false,
      hasSubagentDelegation: false,
      hasHooks: false,
      autoLoadsInstructions: null,
      ainativeInjectsSkills: false,
      supportsSkillComposition: true,
      maxActiveSkills: 3,
      supportsPluginMcpServers: true,
    },
    models: {
      // Bare latest aliases — NOT dated snapshots — so the catalog tracks the
      // newest model in each family instead of pinning to a stale snapshot that
      // silently ages out (e.g. claude-opus-4-20250514 was Opus 4, not 4.8).
      default: "claude-opus-4-8",
      supported: ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-8"],
      tiers: {
        fast: "claude-haiku-4-5",
        balanced: "claude-sonnet-4-6",
        quality: "claude-opus-4-8",
      },
    },
  },
  "openai-direct": {
    id: "openai-direct",
    label: "OpenAI Direct API",
    description: "Direct OpenAI Responses API — server-side tools, web search, code interpreter.",
    providerId: "openai",
    capabilities: {
      resume: true,
      cancel: true,
      approvals: true,
      mcpServers: false,
      profileTests: false,
      taskAssist: true,
      profileAssist: false,
      authHealthCheck: true,
    },
    features: {
      // Direct Responses API — no SDK-native skill machinery.
      // Revisit when chat-claude-sdk-skills designs direct-API skill injection.
      hasNativeSkills: false,
      hasProgressiveDisclosure: false,
      hasFilesystemTools: false,
      hasBash: false,
      hasTodoWrite: false,
      hasSubagentDelegation: false,
      hasHooks: false,
      autoLoadsInstructions: null,
      ainativeInjectsSkills: false,
      supportsSkillComposition: true,
      maxActiveSkills: 3,
      supportsPluginMcpServers: true,
    },
    models: {
      // Latest GPT-5 family — matches the openai-codex-app-server runtime and the
      // pricing-registry "gpt-5" prefix. (The prior gpt-4.1 family matched no
      // pricing prefix, so it billed at $0.)
      default: "gpt-5.4",
      supported: ["gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex"],
      tiers: { fast: "gpt-5.4-mini", balanced: "gpt-5.3-codex", quality: "gpt-5.4" },
    },
  },
  ollama: {
    id: "ollama",
    label: "Ollama",
    description: "Operator-configured Ollama server or cloud API; locality, cost, and authentication depend on the endpoint.",
    providerId: "ollama",
    capabilities: {
      resume: false,
      cancel: true,
      approvals: false,
      mcpServers: false,
      profileTests: false,
      taskAssist: true,
      profileAssist: false,
      authHealthCheck: true,
    },
    features: {
      hasNativeSkills: false,
      hasProgressiveDisclosure: false,
      hasFilesystemTools: false,
      hasBash: false,
      hasTodoWrite: false, // ainative MCP exposes todo tools separately
      hasSubagentDelegation: false,
      hasHooks: false,
      autoLoadsInstructions: null,
      ainativeInjectsSkills: true,
      supportsSkillComposition: false,
      maxActiveSkills: 1,
      supportsPluginMcpServers: false,
    },
    models: {
      default: "llama3",
      supported: [],  // Dynamic — populated from Ollama API at runtime
    },
  },
  litellm: {
    id: "litellm",
    label: "LiteLLM",
    description: "Operator-configured LiteLLM gateway using OpenAI-compatible Chat Completions.",
    providerId: "litellm",
    capabilities: {
      resume: false,
      cancel: true,
      approvals: false,
      mcpServers: false,
      profileTests: false,
      taskAssist: false,
      profileAssist: false,
      authHealthCheck: true,
    },
    features: {
      hasNativeSkills: false,
      hasProgressiveDisclosure: false,
      hasFilesystemTools: false,
      hasBash: false,
      hasTodoWrite: false,
      hasSubagentDelegation: false,
      hasHooks: false,
      autoLoadsInstructions: null,
      ainativeInjectsSkills: true,
      supportsSkillComposition: true,
      maxActiveSkills: 3,
      supportsPluginMcpServers: false,
    },
    models: { default: "", supported: [] },
  },
  lmstudio: {
    id: "lmstudio",
    label: "LM Studio",
    description: "Operator-configured LM Studio server using OpenAI-compatible Chat Completions.",
    providerId: "lmstudio",
    capabilities: {
      resume: false,
      cancel: true,
      approvals: false,
      mcpServers: false,
      profileTests: false,
      taskAssist: false,
      profileAssist: false,
      authHealthCheck: true,
    },
    features: {
      hasNativeSkills: false,
      hasProgressiveDisclosure: false,
      hasFilesystemTools: false,
      hasBash: false,
      hasTodoWrite: false,
      hasSubagentDelegation: false,
      hasHooks: false,
      autoLoadsInstructions: null,
      ainativeInjectsSkills: true,
      supportsSkillComposition: true,
      maxActiveSkills: 3,
      supportsPluginMcpServers: false,
    },
    models: { default: "", supported: [] },
  },
};

export function isAgentRuntimeId(value: string): value is AgentRuntimeId {
  return SUPPORTED_AGENT_RUNTIMES.includes(value as AgentRuntimeId);
}

export function getRuntimeCatalogEntry(
  runtimeId: AgentRuntimeId = DEFAULT_AGENT_RUNTIME
): RuntimeCatalogEntry {
  return RUNTIME_CATALOG[runtimeId];
}

export function getRuntimeCapabilities(
  runtimeId: AgentRuntimeId = DEFAULT_AGENT_RUNTIME
): RuntimeCapabilities {
  return getRuntimeCatalogEntry(runtimeId).capabilities;
}

export function getRuntimeFeatures(
  runtimeId: AgentRuntimeId = DEFAULT_AGENT_RUNTIME
): RuntimeFeatures {
  return getRuntimeCatalogEntry(runtimeId).features;
}

export function resolveAgentRuntime(runtimeId?: string | null): AgentRuntimeId {
  if (!runtimeId) return DEFAULT_AGENT_RUNTIME;
  if (isAgentRuntimeId(runtimeId)) return runtimeId;
  console.warn(`Unknown agent runtime "${runtimeId}", falling back to "${DEFAULT_AGENT_RUNTIME}"`);
  return DEFAULT_AGENT_RUNTIME;
}

export function listRuntimeCatalog(): RuntimeCatalogEntry[] {
  return SUPPORTED_AGENT_RUNTIMES.map((runtimeId) => RUNTIME_CATALOG[runtimeId]);
}
