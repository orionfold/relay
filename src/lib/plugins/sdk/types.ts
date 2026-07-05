import { z } from "zod";

// The plugin apiVersion CURRENT releases author against. Single source of
// truth: the registry's compatibility window is built from it, and the
// create_plugin_spec chat-tool scaffold stamps it into generated manifests
// (a hardcoded copy there once drifted to "0.14" — scaffolded plugins would
// have been disabled on load the moment the window tightened). Bump on every
// MINOR release; api-version-window.test.ts fails if this goes stale.
export const CURRENT_PLUGIN_API_VERSION = "0.31";

// Shared capability tuple — single source of truth used by Zod schema and
// capability-check.ts hash derivation. Exported so consumers don't need a
// parallel list.
export const CAPABILITY_VALUES = ["fs", "net", "child_process", "env"] as const;
export type Capability = typeof CAPABILITY_VALUES[number];

// Two-path plugin trust model (TDR-037). `origin` signals which trust path a
// bundle should follow at load time:
//   - "ainative-internal": written by ainative's own chat tools / ainative-app
//     skill / create_plugin_spec on the user's behalf. Routes to self-extension
//     path: zero ceremony, no capability-accept, no lockfile writes.
//   - "third-party": authored elsewhere, installed as foreign code. Routes to
//     the full M3 trust machinery (hash pin, click-accept, lockfile, drift
//     detection, optional confinement).
// Absent → the classifier in `src/lib/plugins/classify-trust.ts` infers from
// `author`, bundle path, and `capabilities` content. Both paths are supported
// for both kinds.
export const ORIGIN_VALUES = ["ainative-internal", "third-party"] as const;
export type PluginOrigin = typeof ORIGIN_VALUES[number];

const PrimitivesBundleManifestSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/, "id must be kebab-case starting with a letter"),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "version must be semver MAJOR.MINOR.PATCH"),
    apiVersion: z.string().regex(/^\d+\.\d+$/, "apiVersion must be MAJOR.MINOR"),
    kind: z.literal("primitives-bundle"),
    name: z.string().optional(),
    description: z.string().optional(),
    author: z.string().optional(),
    origin: z.enum(ORIGIN_VALUES).optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

const ChatToolsPluginManifestSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/, "id must be kebab-case starting with a letter"),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "version must be semver MAJOR.MINOR.PATCH"),
    apiVersion: z.string().regex(/^\d+\.\d+$/, "apiVersion must be MAJOR.MINOR"),
    kind: z.literal("chat-tools"),
    name: z.string().optional(),
    description: z.string().optional(),
    author: z.string().optional(),
    origin: z.enum(ORIGIN_VALUES).optional(),
    tags: z.array(z.string()).optional(),
    capabilities: z.array(z.enum(CAPABILITY_VALUES)).default([]),
    confinementMode: z.enum(["none", "seatbelt", "apparmor", "docker"]).optional(),
    dockerImage: z.string().optional(),
    defaultToolApproval: z.enum(["never", "prompt", "approve"]).optional(),
  })
  .strict();

export const PluginManifestSchema = z.discriminatedUnion("kind", [
  PrimitivesBundleManifestSchema,
  ChatToolsPluginManifestSchema,
]);

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

export interface LoadedPlugin {
  id: string;
  manifest: PluginManifest;
  rootDir: string;
  profiles: string[];      // namespaced profile ids: "<plugin-id>/<profile-id>"
  blueprints: string[];    // namespaced blueprint ids
  tables: string[];        // namespaced table template ids: "plugin:<plugin-id>:<table-id>"
  schedules: string[];     // composite DB ids: "plugin:<plugin-id>:<schedule-id>"
  status: "loaded" | "disabled";
  error?: string;
}

export interface PluginTableTemplate {
  id: string;              // local id within the bundle, e.g. "transactions"
  name: string;
  description: string;
  category: "business" | "personal" | "pm" | "finance" | "content";
  icon: string;
  columns: Array<{
    name: string;
    displayName: string;
    dataType: string;
    config?: Record<string, unknown>;
  }>;
  sampleRows?: Record<string, unknown>[];
}
