import { defineTool } from "../tool-registry";
import { z } from "zod";
import { ok, err, type ToolContext } from "./helpers";
import { normalizeProviderBaseUrl } from "@/lib/agents/runtime/provider-endpoint";

/* ── Writable settings allowlist ─────────────────────────────────── */

interface WritableSetting {
  validate: (value: string) => string | null; // error message or null
  description: string;
}

const WRITABLE_SETTINGS: Record<string, WritableSetting> = {
  "runtime.sdkTimeoutSeconds": {
    description: "SDK timeout in seconds (10–300)",
    validate: (v) => {
      const n = parseInt(v, 10);
      return isNaN(n) || n < 10 || n > 300 ? "Must be integer 10–300" : null;
    },
  },
  "runtime.maxTurns": {
    description: "Max agent turns per task (1–50)",
    validate: (v) => {
      const n = parseInt(v, 10);
      return isNaN(n) || n < 1 || n > 50 ? "Must be integer 1–50" : null;
    },
  },
  "routing.preference": {
    description: "Routing preference: cost | latency | quality | manual",
    validate: (v) =>
      ["cost", "latency", "quality", "manual"].includes(v)
        ? null
        : "Must be one of: cost, latency, quality, manual",
  },
  "browser.chromeDevtoolsEnabled": {
    description: "Enable Chrome DevTools MCP: true | false",
    validate: (v) =>
      ["true", "false"].includes(v) ? null : "Must be 'true' or 'false'",
  },
  "browser.playwrightEnabled": {
    description: "Enable Playwright MCP: true | false",
    validate: (v) =>
      ["true", "false"].includes(v) ? null : "Must be 'true' or 'false'",
  },
  "web.exaSearchEnabled": {
    description: "Enable Exa web search: true | false",
    validate: (v) =>
      ["true", "false"].includes(v) ? null : "Must be 'true' or 'false'",
  },
  "learning.contextCharLimit": {
    description: "Learning context char limit (2000–32000, step 1000)",
    validate: (v) => {
      const n = parseInt(v, 10);
      return isNaN(n) || n < 2000 || n > 32000 || n % 1000 !== 0
        ? "Must be integer 2000–32000, step 1000"
        : null;
    },
  },
  "ollama.baseUrl": {
    description: "Ollama server base URL (HTTPS or loopback HTTP)",
    validate: (v) => {
      try {
        normalizeProviderBaseUrl(v, {
          label: "Ollama",
          allowInsecureRemote: false,
          defaultPath: "",
        });
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : "Must be a valid URL";
      }
    },
  },
  "ollama.defaultModel": {
    description: "Default Ollama model name",
    validate: (v) =>
      v.trim().length === 0 ? "Must be non-empty string" : null,
  },
  "budget_max_cost_per_task": {
    description: "Max cost per task in USD (0.5–50)",
    validate: (v) => {
      const n = parseFloat(v);
      return isNaN(n) || n < 0.5 || n > 50 ? "Must be number 0.5–50" : null;
    },
  },
  "budget_max_tokens_per_task": {
    description: "Max tokens per task (1000–500000)",
    validate: (v) => {
      const n = parseInt(v, 10);
      return isNaN(n) || n < 1000 || n > 500000
        ? "Must be integer 1000–500000"
        : null;
    },
  },
  "budget_max_daily_cost": {
    description: "Max daily spend in USD (1–500)",
    validate: (v) => {
      const n = parseFloat(v);
      return isNaN(n) || n < 1 || n > 500 ? "Must be number 1–500" : null;
    },
  },
};

const WRITABLE_KEYS_DOC = Object.entries(WRITABLE_SETTINGS)
  .map(([k, v]) => `- "${k}": ${v.description}`)
  .join("\n");

/* ── Tool definitions ────────────────────────────────────────────── */

export function settingsTools(_ctx: ToolContext) {
  return [
    defineTool(
      "get_settings",
      "Get current ainative settings including auth method, budget limits, active runtime, and workspace context. Read-only.",
      {
        key: z
          .string()
          .optional()
          .describe(
            'Specific setting key (e.g. "auth_method", "budget_max_tokens", "default_runtime", "workspace_cwd", "workspace_is_worktree"). Omit to get all settings.'
          ),
      },
      async (args) => {
        try {
          const { getSetting } = await import("@/lib/settings/helpers");
          const { getWorkspaceContext } = await import(
            "@/lib/environment/workspace-context"
          );

          // Handle workspace_* keys from workspace context
          if (args.key?.startsWith("workspace_")) {
            const ws = getWorkspaceContext();
            const wsEntries: Record<string, string | null> = {
              workspace_cwd: ws.cwd,
              workspace_git_branch: ws.gitBranch,
              workspace_is_worktree: ws.isWorktree ? "true" : "false",
              workspace_folder_name: ws.folderName,
            };
            return ok({
              key: args.key,
              value: wsEntries[args.key] ?? null,
            });
          }

          if (args.key) {
            const value = await getSetting(args.key);
            return ok({
              key: args.key,
              value,
              writable: args.key in WRITABLE_SETTINGS,
            });
          }

          // Return common settings + workspace context with writability tags
          const keys = [
            "auth_method",
            "default_runtime",
            "runtime.sdkTimeoutSeconds",
            "budget_max_tokens_per_task",
            "budget_max_cost_per_task",
            "budget_max_daily_cost",
          ];
          const entries: Record<string, { value: string | null; writable: boolean }> = {};
          for (const key of keys) {
            entries[key] = {
              value: await getSetting(key),
              writable: key in WRITABLE_SETTINGS,
            };
          }

          // Append workspace context (read-only)
          const ws = getWorkspaceContext();
          entries.workspace_cwd = { value: ws.cwd, writable: false };
          entries.workspace_git_branch = { value: ws.gitBranch, writable: false };
          entries.workspace_is_worktree = { value: ws.isWorktree ? "true" : "false", writable: false };
          entries.workspace_folder_name = { value: ws.folderName, writable: false };

          return ok(entries);
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to get settings");
        }
      }
    ),

    defineTool(
      "set_settings",
      `Update a ainative setting. Requires user approval.\n\nWritable keys:\n${WRITABLE_KEYS_DOC}`,
      {
        key: z.string().describe("Setting key to update"),
        value: z.string().describe("New value (always a string)"),
      },
      async (args) => {
        const spec = WRITABLE_SETTINGS[args.key];
        if (!spec) {
          return err(
            `Key "${args.key}" is not writable via set_settings. Use get_settings to see which keys are writable (writable: true). Writable keys: ${Object.keys(WRITABLE_SETTINGS).join(", ")}`
          );
        }
        const validationError = spec.validate(args.value);
        if (validationError) {
          return err(
            `Invalid value for "${args.key}": ${validationError}`
          );
        }
        try {
          const { getSetting, setSetting } = await import(
            "@/lib/settings/helpers"
          );
          const oldValue = await getSetting(args.key);
          await setSetting(args.key, args.value);
          if (args.key === "ollama.baseUrl" || args.key === "ollama.defaultModel") {
            const { invalidateModelDiscoveryCache } = await import(
              "@/lib/chat/model-discovery"
            );
            invalidateModelDiscoveryCache();
          }
          return ok({
            key: args.key,
            oldValue: oldValue ?? "(unset)",
            newValue: args.value,
          });
        } catch (e) {
          return err(
            e instanceof Error ? e.message : "Failed to update setting"
          );
        }
      }
    ),
  ];
}
