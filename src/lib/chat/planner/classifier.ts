import type {
  ClassifierVerdict,
  ComposePlan,
  PlannerContext,
  ScaffoldPlan,
} from "./types";
import type { CreatePluginSpecInput } from "@/lib/chat/tools/plugin-spec-tools";
import { COMPOSE_TRIGGERS, SCAFFOLD_TRIGGERS } from "./trigger-phrases";
import { PRIMITIVE_MAP } from "./primitive-map";

const INTEGRATION_NOUNS = [
  "github",
  "gitlab",
  "bitbucket",
  "jira",
  "linear",
  "asana",
  "slack",
  "discord",
  "gmail",
  "notion",
  "airtable",
  "stripe",
  "zapier",
  "figma",
  "youtube",
  "twitter",
  "reddit",
  "hackernews",
] as const;

const APP_INTENT_WORDS = [
  "app",
  "tracker",
  "dashboard",
  "workflow",
] as const;

const VERB_TO_TOOL: Record<string, string> = {
  pull: "fetch_items",
  fetch: "fetch_items",
  get: "get_items",
  list: "list_items",
  search: "search_items",
  sync: "sync_items",
  post: "create_item",
  create: "create_item",
  send: "send_item",
};

function findTriggerMatch(
  normalized: string,
  triggers: readonly string[]
): string | null {
  for (const phrase of triggers) {
    if (normalized.includes(phrase)) return phrase;
  }
  return null;
}

function findPrimitiveKey(normalized: string): string | null {
  const keys = Object.keys(PRIMITIVE_MAP).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (normalized.includes(key)) return key;
  }
  return null;
}

function findIntegrationNoun(normalized: string): string | null {
  for (const noun of INTEGRATION_NOUNS) {
    if (normalized.includes(noun)) return noun;
  }
  return null;
}

function inferToolsFromMessage(
  message: string
): Array<{ name: string; description: string }> {
  const lower = message.toLowerCase();
  const tools: Array<{ name: string; description: string }> = [];
  const seen = new Set<string>();
  for (const [verb, toolName] of Object.entries(VERB_TO_TOOL)) {
    if (lower.includes(verb) && !seen.has(toolName)) {
      tools.push({
        name: toolName,
        description: `Plugin tool (inferred from '${verb}' verb in user request). Fill in logic.`,
      });
      seen.add(toolName);
    }
  }
  if (tools.length === 0) {
    tools.push({
      name: "run",
      description:
        "Default plugin entry point. Fill in server.py handler logic.",
    });
  }
  return tools;
}

function inferScaffoldPlan(
  message: string,
  normalized: string
): ScaffoldPlan | null {
  const noun = findIntegrationNoun(normalized);
  if (!noun) return null;

  const id = `${noun}-mine`;
  const tools = inferToolsFromMessage(message);
  const plugin: CreatePluginSpecInput = {
    id,
    name: `${noun.charAt(0).toUpperCase()}${noun.slice(1)} (personal)`,
    description: `Personal ${noun} integration scaffolded from chat request.`,
    capabilities: [],
    transport: "stdio",
    language: "python",
    tools,
  };

  return {
    plugin,
    rationale: `Matched integration noun '${noun}' — composition alone can't call external APIs, so scaffolding a plugin.`,
    composeAltPrompt: `Compose a pack without a plugin for: ${message}`,
    explanation: `${noun} access requires an external API call — composition primitives (profile + blueprint + table + schedule) can't make network requests on their own.`,
  };
}

function inferComposePlan(normalized: string): ComposePlan | null {
  const key = findPrimitiveKey(normalized);
  if (!key) return null;
  return { kind: "primitive_matched", ...PRIMITIVE_MAP[key] };
}

function hasAppIntent(normalized: string): boolean {
  for (const word of APP_INTENT_WORDS) {
    if (normalized.includes(word)) return true;
  }
  return false;
}

function genericComposePlan(
  triggerPhrase: string,
  integrationNoun: string | null
): ComposePlan {
  return {
    kind: "generic",
    rationale: `Matched compose trigger '${triggerPhrase}' with no known primitive — generic composition`,
    ...(integrationNoun ? { integrationNoun } : {}),
  };
}

export function classifyMessage(
  message: string,
  _ctx: PlannerContext
): ClassifierVerdict {
  const normalized = message.toLowerCase().trim();
  if (!normalized) return { kind: "conversation" };

  const scaffoldTrigger = findTriggerMatch(normalized, SCAFFOLD_TRIGGERS);
  if (scaffoldTrigger) {
    const plan = inferScaffoldPlan(message, normalized);
    if (plan) return { kind: "scaffold", plan };
  }

  const noun = findIntegrationNoun(normalized);
  const appIntent = hasAppIntent(normalized);

  // Noun + compose-trigger short-circuits to scaffold ONLY when the user
  // hasn't named an app-y artifact. "build me a github habit tracker" reads
  // as a compose request that mentions an integration; the LLM gets the
  // noun warning via the generic hint and tells the user to scaffold a
  // plugin separately for github access. "build me a tool that pulls my
  // github issues" still routes here (no app-intent word) and scaffolds.
  if (noun && !appIntent) {
    const composeTrigger = findTriggerMatch(normalized, COMPOSE_TRIGGERS);
    if (composeTrigger) {
      const plan = inferScaffoldPlan(message, normalized);
      if (plan) return { kind: "scaffold", plan };
    }
  }

  const composeTrigger = findTriggerMatch(normalized, COMPOSE_TRIGGERS);
  if (composeTrigger) {
    const plan = inferComposePlan(normalized);
    if (plan) {
      return {
        kind: "compose",
        plan: noun ? { ...plan, integrationNoun: noun } : plan,
      };
    }
    return { kind: "compose", plan: genericComposePlan(composeTrigger, noun) };
  }

  return { kind: "conversation" };
}
