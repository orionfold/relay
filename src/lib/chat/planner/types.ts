import type { CreatePluginSpecInput } from "@/lib/chat/tools/plugin-spec-tools";

export interface ComposePlan {
  kind: "primitive_matched" | "generic";
  profileId?: string;
  blueprintId?: string;
  tables?: Array<{
    name: string;
    columns: Array<{
      name: string;
      type: "text" | "number" | "boolean" | "date";
    }>;
  }>;
  schedule?: { cron: string; description: string };
  rationale: string;
  integrationNoun?: string;
  packIntent?: boolean;
  repositoryPublishIntent?: boolean;
}

export interface ScaffoldPlan {
  plugin: CreatePluginSpecInput;
  rationale: string;
  composeAltPrompt: string;
  explanation: string;
}

export type ClassifierVerdict =
  | { kind: "compose"; plan: ComposePlan }
  | { kind: "scaffold"; plan: ScaffoldPlan }
  | { kind: "conversation" };

export interface PlannerContext {
  projectId: string | null;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}
