/**
 * mcp-loader.ts — Plugin-MCP loader skeleton (TDR-035 §2)
 *
 * Scans <AINATIVE_DATA_DIR>/plugins/ for kind: chat-tools entries, parses
 * each plugin's .mcp.json, resolves env templates, verifies binary/entry
 * existence, gates on capability-check (T2), and returns a normalized
 * Record<serverName, NormalizedMcpConfig> ready for adapter consumption.
 *
 * Scope: discovery + capability gate + env-template resolution + file-existence
 * checks + logging. Transport spawning is deferred to T4.
 *
 * Public API:
 *   loadPluginMcpServers(opts?)  — thin projection to accepted Record<name, config>
 *   listPluginMcpRegistrations(opts?)  — full list including disabled entries
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";

import { isSafeMode } from "@/lib/config/env";
import { PluginManifestSchema } from "@/lib/plugins/sdk/types";
import {
  deriveManifestHash,
  isCapabilityAccepted,
} from "@/lib/plugins/capability-check";
import { parseMcpConfigFile } from "@/lib/environment/parsers/mcp-config";
import { getRuntimeFeatures } from "@/lib/agents/runtime/catalog";
import type { AgentRuntimeId } from "@/lib/agents/runtime/catalog";
import {
  getAinativePluginsDir,
  getAinativeDataDir,
  getAinativeLogsDir,
} from "@/lib/utils/ainative-paths";
import {
  validateStdioMcp,
  validateInProcessSdk,
} from "@/lib/plugins/transport-dispatch";
import {
  wrapStdioSpawn,
  dockerBootSweep,
  type ConfinementMode,
  type WrapInput,
} from "@/lib/plugins/confinement/wrap";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Normalized MCP server config ready for adapter consumption. */
export interface NormalizedMcpConfig {
  // stdio transport fields
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // in-process SDK transport fields
  transport?: "ainative-sdk";
  entry?: string; // resolved absolute path
}

/** Full registration record including disabled entries. */
export interface PluginMcpRegistration {
  pluginId: string;
  serverName: string;
  transport: "stdio" | "ainative-sdk";
  config: NormalizedMcpConfig;
  status: "accepted" | "disabled" | "pending_capability_accept" | "pending_capability_reaccept";
  disabledReason?:
    | "mcp_parse_error"
    | "server_not_found"
    | "sdk_entry_not_found"
    | "capability_not_accepted"
    | "capability_accept_stale"
    | "capability_accept_expired"
    | "invalid_mcp_transport"
    | "ambiguous_mcp_transport"
    | "safe_mode"
    | "stdio_init_timeout"
    | "stdio_init_malformed"
    | "sdk_invalid_export"
    | "confinement_unsupported_on_platform";
  manifestHash?: string;
  /** Populated for disabledReason=confinement_unsupported_on_platform so the UI/logs can show WHY. */
  disabledDetail?: string;
}

// ---------------------------------------------------------------------------
// Module-level dedup trackers
// ---------------------------------------------------------------------------

/** Once-per-session dedup set for Ollama runtime skip logs: "<pluginId>@<runtime>" */
const ollamaSkipLogged = new Set<string>();

/**
 * Gate the Docker boot sweep to once per process. listPluginMcpRegistrations
 * is called per-request by the Claude SDK adapter; re-sweeping on every
 * request would spam docker ps. The sweep is a best-effort cleanup for
 * containers left from the previous process — running it once at first
 * invocation is sufficient.
 */
let dockerBootSweepDone = false;

/**
 * Test-only hook: reset the once-per-process boot-sweep flag. Exported so
 * test suites can assert the sweep runs on each fresh configuration.
 * Production callers must not use this.
 */
export function __resetDockerBootSweepForTests(): void {
  dockerBootSweepDone = false;
}

// ---------------------------------------------------------------------------
// Logging — third use of this pattern; extracted inline per DRY rule (extract
// on 3rd use). When a fourth module needs it, promote to plugin-logger.ts.
// ---------------------------------------------------------------------------

function logToFile(line: string): void {
  try {
    const logsDir = getAinativeLogsDir();
    fs.mkdirSync(logsDir, { recursive: true });
    fs.appendFileSync(
      path.join(logsDir, "plugins.log"),
      `${new Date().toISOString()} ${line}\n`
    );
  } catch {
    /* swallow log errors — never let logging break the loader */
  }
}

// ---------------------------------------------------------------------------
// Env template resolution
// ---------------------------------------------------------------------------

/**
 * Resolve ${HOME}, ${RELAY_DATA_DIR}, and ${PLUGIN_DIR} in a string.
 * No shell expansion, no nested templates — simple string replace only.
 *
 * ${AINATIVE_DATA_DIR} is accepted as a deprecated alias so plugins authored
 * before the Relay rename keep resolving; new plugins should use
 * ${RELAY_DATA_DIR}.
 */
function resolveTemplate(value: string, context: { rootDir: string }): string {
  return value
    .replace(/\$\{HOME\}/g, os.homedir())
    .replace(/\$\{RELAY_DATA_DIR\}/g, getAinativeDataDir())
    .replace(/\$\{AINATIVE_DATA_DIR\}/g, getAinativeDataDir())
    .replace(/\$\{PLUGIN_DIR\}/g, context.rootDir);
}

/** Apply resolveTemplate to all values in an env object. */
function resolveEnvTemplates(
  env: Record<string, string> | undefined,
  context: { rootDir: string }
): Record<string, string> | undefined {
  if (!env) return undefined;
  return Object.fromEntries(
    Object.entries(env).map(([k, v]) => [k, resolveTemplate(v, context)])
  );
}

/** Apply resolveTemplate to all elements of an args array. */
function resolveArgsTemplates(
  args: string[] | undefined,
  context: { rootDir: string }
): string[] | undefined {
  if (!args) return undefined;
  return args.map((a) => resolveTemplate(a, context));
}

// ---------------------------------------------------------------------------
// Command existence check
// ---------------------------------------------------------------------------

/**
 * Determine if a stdio `command` string refers to a relative path (starts
 * with `./` or `../`) that must be resolved and existence-checked.
 * PATH-only commands like "python" or "node" are assumed present.
 */
function isRelativeCommand(command: string): boolean {
  return command.startsWith("./") || command.startsWith("../");
}

// ---------------------------------------------------------------------------
// Per-plugin scan (isolated — exceptions caught at scan loop level)
// ---------------------------------------------------------------------------

interface ScanResult {
  registrations: PluginMcpRegistration[];
}

async function scanPlugin(pluginDir: string, pluginId: string): Promise<ScanResult> {
  const registrations: PluginMcpRegistration[] = [];

  // --- Read plugin.yaml ---
  const pluginYamlPath = path.join(pluginDir, "plugin.yaml");
  let pluginYamlContent: string;
  try {
    pluginYamlContent = fs.readFileSync(pluginYamlPath, "utf-8");
  } catch {
    // Missing plugin.yaml — not a valid plugin directory, skip silently.
    return { registrations };
  }

  // --- Parse manifest ---
  let rawManifest: unknown;
  try {
    rawManifest = yaml.load(pluginYamlContent);
  } catch {
    logToFile(`[mcp-loader] plugin ${pluginId}: plugin.yaml is not valid YAML — skipped`);
    return { registrations };
  }

  const parsed = PluginManifestSchema.safeParse(rawManifest);
  if (!parsed.success) {
    logToFile(
      `[mcp-loader] plugin ${pluginId}: plugin.yaml failed schema validation — skipped`
    );
    return { registrations };
  }

  const manifest = parsed.data;

  // --- Only process kind: chat-tools ---
  if (manifest.kind !== "chat-tools") {
    return { registrations }; // Kind 5 (primitives-bundle) etc. — not our concern
  }

  // --- Parse .mcp.json ---
  const mcpJsonPath = path.join(pluginDir, ".mcp.json");
  const mcpServers = parseMcpConfigFile(mcpJsonPath);
  if (mcpServers === null) {
    logToFile(
      `[mcp-loader] plugin ${pluginId}: .mcp.json missing or invalid JSON (mcp_parse_error)`
    );
    registrations.push({
      pluginId,
      serverName: "",
      transport: "stdio",
      config: {},
      status: "disabled",
      disabledReason: "mcp_parse_error",
    });
    return { registrations };
  }

  // --- Capability check ---
  // TDR-037: pass manifest + rootDir so the classifier can early-return for
  // self-extension bundles (author: ainative, origin: ainative-internal,
  // empty capabilities, or under apps/). Self-extension bundles skip lockfile
  // entirely and load at zero ceremony — same posture as Claude Code / Codex.
  // The Settings `plugin-trust-model` (auto | strict | off) overrides classifier
  // behavior when the user opts into training wheels or full freedom.
  const manifestHash = deriveManifestHash(pluginYamlContent);
  let trustModelSetting: "auto" | "strict" | "off" = "auto";
  try {
    const { getPluginTrustModelSync } = await import("@/lib/settings/helpers");
    trustModelSetting = getPluginTrustModelSync();
  } catch {
    // Settings DB unavailable (fresh install, test env) — fall back to auto.
  }
  const capCheck = isCapabilityAccepted(pluginId, manifestHash, {
    manifest,
    rootDir: pluginDir,
    trustModelSetting,
  });

  if (!capCheck.accepted) {
    const reason = capCheck.reason;
    // Both "hash_drift" and "expired" surface the same re-accept UX
    // (pending_capability_reaccept); they differ only in disabledReason so
    // logs/API can tell the user *why* re-acceptance is required.
    const status =
      reason === "hash_drift" || reason === "expired"
        ? "pending_capability_reaccept"
        : "pending_capability_accept";
    const disabledReason: PluginMcpRegistration["disabledReason"] =
      reason === "hash_drift"
        ? "capability_accept_stale"
        : reason === "expired"
          ? "capability_accept_expired"
          : "capability_not_accepted";

    logToFile(
      `[mcp-loader] plugin ${pluginId}: capability check failed (${disabledReason})`
    );

    // Emit one registration per server, all in pending state.
    const serverNames = Object.keys(mcpServers);
    if (serverNames.length === 0) {
      registrations.push({
        pluginId,
        serverName: "",
        transport: "stdio",
        config: {},
        status,
        disabledReason,
        manifestHash,
      });
    } else {
      for (const serverName of serverNames) {
        registrations.push({
          pluginId,
          serverName,
          transport: "stdio",
          config: {},
          status,
          disabledReason,
          manifestHash,
        });
      }
    }
    return { registrations };
  }

  // --- Process each server entry ---
  const context = { rootDir: pluginDir };

  // Only chat-tools manifests have these fields; the discriminated union
  // narrows `manifest` here via the kind:"chat-tools" check above.
  const confinementMode: ConfinementMode = manifest.confinementMode ?? "none";
  const capabilities = manifest.capabilities ?? [];
  const dockerImage = manifest.dockerImage;

  for (const [serverName, rawEntry] of Object.entries(mcpServers)) {
    const hasCommand = typeof rawEntry.command === "string" && rawEntry.command.length > 0;
    const isAinativeSdk = rawEntry.transport === "ainative-sdk";

    // Ambiguous: both command and ainative-sdk transport declared
    if (hasCommand && isAinativeSdk) {
      logToFile(
        `[mcp-loader] plugin ${pluginId} server "${serverName}": both command and transport:ainative-sdk declared (ambiguous_mcp_transport)`
      );
      registrations.push({
        pluginId,
        serverName,
        transport: "stdio",
        config: {},
        status: "disabled",
        disabledReason: "ambiguous_mcp_transport",
        manifestHash,
      });
      continue;
    }

    // Invalid: neither command nor ainative-sdk transport
    if (!hasCommand && !isAinativeSdk) {
      logToFile(
        `[mcp-loader] plugin ${pluginId} server "${serverName}": no command or transport:ainative-sdk (invalid_mcp_transport)`
      );
      registrations.push({
        pluginId,
        serverName,
        transport: "stdio",
        config: {},
        status: "disabled",
        disabledReason: "invalid_mcp_transport",
        manifestHash,
      });
      continue;
    }

    // --- Stdio transport ---
    if (hasCommand) {
      const rawCommand = rawEntry.command!;
      const resolvedArgs = resolveArgsTemplates(rawEntry.args, context);
      const resolvedEnv = resolveEnvTemplates(rawEntry.env, context);

      // Resolve relative commands to absolute paths + existence-check.
      let resolvedCommand: string;
      if (isRelativeCommand(rawCommand)) {
        const absCommand = path.resolve(pluginDir, rawCommand);
        if (!fs.existsSync(absCommand)) {
          logToFile(
            `[mcp-loader] plugin ${pluginId} server "${serverName}": command "${rawCommand}" not found at ${absCommand} (server_not_found)`
          );
          registrations.push({
            pluginId,
            serverName,
            transport: "stdio",
            config: {},
            status: "disabled",
            disabledReason: "server_not_found",
            manifestHash,
          });
          continue;
        }
        resolvedCommand = absCommand;
      } else {
        // PATH-only or absolute command — assume present.
        resolvedCommand = rawCommand;
      }

      // T14: apply confinement wrap (confinementMode "none" → no-op pass-through).
      const wrapInput: WrapInput = {
        command: resolvedCommand,
        args: resolvedArgs ?? [],
        env: resolvedEnv,
        pluginId,
        pluginDir,
        confinementMode,
        capabilities,
        ...(dockerImage !== undefined ? { dockerImage } : {}),
      };
      const wrap = wrapStdioSpawn(wrapInput);
      if (!wrap.ok) {
        logToFile(
          `[mcp-loader] plugin ${pluginId} server "${serverName}": confinement unsupported — ${wrap.detail}`
        );
        registrations.push({
          pluginId,
          serverName,
          transport: "stdio",
          config: {},
          status: "disabled",
          disabledReason: "confinement_unsupported_on_platform",
          disabledDetail: wrap.detail,
          manifestHash,
        });
        continue;
      }

      // Normalized config uses the WRAPPED command/args so downstream spawns
      // launch the sandbox-exec / aa-exec / docker run wrapper, not the bare binary.
      const config: NormalizedMcpConfig = {
        command: wrap.wrapped.command,
        args: wrap.wrapped.args,
        ...(wrap.wrapped.env !== undefined && { env: wrap.wrapped.env }),
      };

      // T4: validate before accepting — pre-flight MCP handshake (Option A).
      // Validation runs through the wrapped command so a broken seatbelt
      // profile / missing docker image surfaces during scan, not first request.
      const stdioValidation = await validateStdioMcp(config, pluginId, serverName);
      if (!stdioValidation.ok) {
        logToFile(
          `[mcp-loader] plugin ${pluginId} server "${serverName}": stdio validation failed (${stdioValidation.reason})${stdioValidation.detail ? ": " + stdioValidation.detail : ""}`
        );
        registrations.push({
          pluginId,
          serverName,
          transport: "stdio",
          config: {},
          status: "disabled",
          disabledReason: stdioValidation.reason,
          manifestHash,
        });
        continue;
      }
      registrations.push({
        pluginId,
        serverName,
        transport: "stdio",
        config,
        status: "accepted",
        manifestHash,
      });
      continue;
    }

    // --- Ainative-SDK transport ---
    if (isAinativeSdk) {
      const entryField = typeof rawEntry.entry === "string" ? rawEntry.entry : "";
      if (!entryField) {
        logToFile(
          `[mcp-loader] plugin ${pluginId} server "${serverName}": transport:ainative-sdk missing entry field (sdk_entry_not_found)`
        );
        registrations.push({
          pluginId,
          serverName,
          transport: "ainative-sdk",
          config: {},
          status: "disabled",
          disabledReason: "sdk_entry_not_found",
          manifestHash,
        });
        continue;
      }

      const absEntry = path.resolve(pluginDir, entryField);
      if (!fs.existsSync(absEntry)) {
        logToFile(
          `[mcp-loader] plugin ${pluginId} server "${serverName}": entry "${entryField}" not found at ${absEntry} (sdk_entry_not_found)`
        );
        registrations.push({
          pluginId,
          serverName,
          transport: "ainative-sdk",
          config: {},
          status: "disabled",
          disabledReason: "sdk_entry_not_found",
          manifestHash,
        });
        continue;
      }

      const resolvedEnv = resolveEnvTemplates(rawEntry.env, context);
      const config: NormalizedMcpConfig = {
        transport: "ainative-sdk",
        entry: absEntry,
        ...(resolvedEnv !== undefined && { env: resolvedEnv }),
      };
      // T4: validate in-process SDK before accepting (Option A pre-flight)
      const sdkValidation = await validateInProcessSdk(config, pluginId, serverName);
      if (!sdkValidation.ok) {
        logToFile(
          `[mcp-loader] plugin ${pluginId} server "${serverName}": SDK validation failed (${sdkValidation.reason})${sdkValidation.detail ? ": " + sdkValidation.detail : ""}`
        );
        registrations.push({
          pluginId,
          serverName,
          transport: "ainative-sdk",
          config: {},
          status: "disabled",
          disabledReason: sdkValidation.reason,
          manifestHash,
        });
        continue;
      }
      registrations.push({
        pluginId,
        serverName,
        transport: "ainative-sdk",
        config,
        status: "accepted",
        manifestHash,
      });
    }
  }

  return { registrations };
}

// ---------------------------------------------------------------------------
// Main loader
// ---------------------------------------------------------------------------

/**
 * Scan all plugins and return full registration list (including disabled entries).
 * This is the authoritative source; loadPluginMcpServers projects to accepted-only.
 */
export async function listPluginMcpRegistrations(opts?: {
  runtime?: AgentRuntimeId;
}): Promise<PluginMcpRegistration[]> {
  // Short-circuit: safe mode. Instead of returning [], enumerate kind:chat-tools
  // plugins and emit one disabled+safe_mode registration per plugin so the
  // /api/plugins surface can SHOW the user what is being blocked. Kind 5
  // (primitives-bundle) plugins are not part of this loader — their registry
  // lives in src/lib/plugins/registry.ts and is not affected by safe-mode.
  if (isSafeMode()) {
    return buildSafeModeRegistrations();
  }

  // T14: once-per-process Docker boot sweep. Only triggered when at least one
  // plugin manifest declares confinementMode: "docker" — avoids spinning up
  // docker ps probes on machines with no docker-confined plugins.
  if (!dockerBootSweepDone) {
    dockerBootSweepDone = true;
    if (hasAnyDockerConfinedPlugin()) {
      try {
        dockerBootSweep();
      } catch (err) {
        logToFile(
          `[mcp-loader] dockerBootSweep threw unexpectedly — ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  // Short-circuit: runtime that doesn't support plugin MCP servers.
  // Enumerate plugin dirs to emit the spec-required per-plugin log line
  // ("plugin <id> skipped on <runtime> runtime") before returning empty.
  if (opts?.runtime) {
    const features = getRuntimeFeatures(opts.runtime);
    if (!features.supportsPluginMcpServers) {
      const pluginsDir = getAinativePluginsDir();
      if (fs.existsSync(pluginsDir)) {
        try {
          // Dedup keys scoped with pluginsDir so tmpdir-based tests each
          // get a fresh keyspace (prevents cross-test log-suppression flakes).
          for (const entry of fs.readdirSync(pluginsDir).sort()) {
            const logKey = `${entry}@${opts.runtime}@${pluginsDir}`;
            if (!ollamaSkipLogged.has(logKey)) {
              ollamaSkipLogged.add(logKey);
              logToFile(
                `[mcp-loader] plugin ${entry} skipped on ${opts.runtime} runtime`
              );
            }
          }
        } catch {
          const logKey = `__summary@${opts.runtime}@${pluginsDir}`;
          if (!ollamaSkipLogged.has(logKey)) {
            ollamaSkipLogged.add(logKey);
            logToFile(
              `[mcp-loader] runtime "${opts.runtime}" has supportsPluginMcpServers=false — skipping all plugins`
            );
          }
        }
      }
      return [];
    }
  }

  const pluginsDir = getAinativePluginsDir();

  // If the plugins directory doesn't exist yet, return empty.
  if (!fs.existsSync(pluginsDir)) {
    return [];
  }

  let pluginDirEntries: string[];
  try {
    // Sort for deterministic enumeration order across macOS/Linux/Windows.
    pluginDirEntries = fs.readdirSync(pluginsDir).sort();
  } catch {
    logToFile(`[mcp-loader] could not read plugins directory: ${pluginsDir}`);
    return [];
  }

  const allRegistrations: PluginMcpRegistration[] = [];

  for (const entry of pluginDirEntries) {
    const pluginDir = path.join(pluginsDir, entry);

    // Only process directories
    let stat: fs.Stats;
    try {
      stat = fs.statSync(pluginDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const pluginId = entry;

    try {
      const result = await scanPlugin(pluginDir, pluginId);
      allRegistrations.push(...result.registrations);
    } catch (err) {
      // Per-plugin isolation: one broken plugin cannot crash the loader.
      logToFile(
        `[mcp-loader] plugin ${pluginId}: unexpected error during scan — ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return allRegistrations;
}

/**
 * Load plugin-shipped MCP servers for adapter consumption.
 *
 * Returns a Record<serverName, NormalizedMcpConfig> containing only accepted
 * registrations. Disabled / pending entries are omitted (but still logged).
 *
 * Short-circuits to {} when:
 *   - AINATIVE_SAFE_MODE=true (T13)
 *   - opts.runtime has supportsPluginMcpServers=false (e.g. Ollama)
 */
export async function loadPluginMcpServers(opts?: {
  runtime?: AgentRuntimeId;
}): Promise<Record<string, NormalizedMcpConfig>> {
  const regs = await listPluginMcpRegistrations(opts);
  return Object.fromEntries(
    regs
      .filter((r) => r.status === "accepted")
      .map((r) => [r.serverName, r.config])
  );
}

/**
 * Scan plugin manifests for any chat-tools plugin declaring
 * confinementMode: "docker". Used to gate the boot sweep so non-docker
 * installs don't pay the docker ps probe cost.
 *
 * Swallows all errors — a broken manifest must not prevent the sweep.
 */
function hasAnyDockerConfinedPlugin(): boolean {
  const pluginsDir = getAinativePluginsDir();
  if (!fs.existsSync(pluginsDir)) return false;

  let entries: string[];
  try {
    entries = fs.readdirSync(pluginsDir);
  } catch {
    return false;
  }

  for (const entry of entries) {
    const pluginYamlPath = path.join(pluginsDir, entry, "plugin.yaml");
    let content: string;
    try {
      content = fs.readFileSync(pluginYamlPath, "utf-8");
    } catch {
      continue;
    }

    let raw: unknown;
    try {
      raw = yaml.load(content);
    } catch {
      continue;
    }

    const parsed = PluginManifestSchema.safeParse(raw);
    if (!parsed.success) continue;
    if (parsed.data.kind !== "chat-tools") continue;
    if (parsed.data.confinementMode === "docker") return true;
  }

  return false;
}

/**
 * Safe-mode projection: enumerate kind:chat-tools plugins and emit one
 * disabled+safe_mode registration per plugin so /api/plugins surfaces what is
 * being blocked. Does not parse .mcp.json, does not spawn anything, does not
 * consult plugins.lock (safe-mode is a global kill-switch independent of
 * capability state). Kind 5 (primitives-bundle) plugins are skipped — they
 * are managed by src/lib/plugins/registry.ts and are not affected.
 */
function buildSafeModeRegistrations(): PluginMcpRegistration[] {
  const out: PluginMcpRegistration[] = [];
  const pluginsDir = getAinativePluginsDir();
  if (!fs.existsSync(pluginsDir)) return out;

  let entries: string[];
  try {
    entries = fs.readdirSync(pluginsDir).sort();
  } catch {
    return out;
  }

  for (const entry of entries) {
    const pluginDir = path.join(pluginsDir, entry);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(pluginDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const pluginYamlPath = path.join(pluginDir, "plugin.yaml");
    let content: string;
    try {
      content = fs.readFileSync(pluginYamlPath, "utf-8");
    } catch {
      continue; // no manifest — skip
    }

    let raw: unknown;
    try {
      raw = yaml.load(content);
    } catch {
      continue;
    }

    const parsed = PluginManifestSchema.safeParse(raw);
    if (!parsed.success) continue;
    if (parsed.data.kind !== "chat-tools") continue;

    out.push({
      pluginId: entry,
      serverName: "",
      transport: "stdio",
      config: {},
      status: "disabled",
      disabledReason: "safe_mode",
    });
  }

  return out;
}

/**
 * Return the absolute entry paths of all accepted in-process SDK registrations
 * for a given pluginId. Used by the T12 revoke flow to bust require.cache
 * entries so a stale in-process SDK module is dropped on revoke + re-accept.
 *
 * Returns an empty array when:
 *   - pluginId is unknown,
 *   - the plugin has no accepted registrations,
 *   - all of the plugin's registrations use stdio transport (no entry field).
 */
export async function listAcceptedInProcessEntriesForPlugin(
  pluginId: string,
): Promise<string[]> {
  const regs = await listPluginMcpRegistrations();
  const entries: string[] = [];
  for (const r of regs) {
    if (
      r.pluginId === pluginId &&
      r.status === "accepted" &&
      r.transport === "ainative-sdk" &&
      typeof r.config.entry === "string" &&
      r.config.entry.length > 0
    ) {
      entries.push(r.config.entry);
    }
  }
  return entries;
}

/**
 * T15 — Transport-aware reload for a single Kind-1 plugin.
 *
 * Effects:
 *  - For each accepted in-process SDK registration of this plugin, bust
 *    Node's require.cache so the next request re-imports fresh module
 *    code. The list of busted absolute entry paths is returned so callers
 *    (chat tool, UI) can see exactly what was invalidated.
 *  - Re-scans the plugin dir and returns fresh registrations filtered to
 *    pluginId. A newly-dropped plugin yields `registrations: []`; a plugin
 *    that moved from accepted → pending after a manifest edit shows up
 *    with its new status/disabledReason.
 *
 * TDR-035 §5 note: stdio children are NOT owned by the loader (Option A —
 * see transport-dispatch.ts:18-20). The spec's "SIGTERM + respawn" is
 * effectively handled by adapters spawning fresh children at next request
 * against refreshed `.mcp.json`; no per-plugin SIGTERM wiring is needed
 * here. If a future milestone introduces long-lived loader-owned children,
 * this is the hook to extend.
 *
 * Graceful: unknown pluginId yields `{ bustedInProcessEntries: [], registrations: [] }`.
 * Failures in cache-bust are logged but do not abort the reload (the fresh
 * registration list is still returned).
 *
 * All cross-module imports are dynamic per TDR-032 discipline.
 */
export async function reloadPluginMcpRegistrations(
  pluginId: string,
): Promise<{
  bustedInProcessEntries: string[];
  registrations: PluginMcpRegistration[];
}> {
  // Step 1 — Collect in-process entries to bust BEFORE re-scanning, so a
  // manifest edit that moves the plugin from accepted → pending doesn't
  // hide the stale cached entry that still needs clearing.
  let bustedInProcessEntries: string[] = [];
  try {
    bustedInProcessEntries = await listAcceptedInProcessEntriesForPlugin(pluginId);
  } catch (err) {
    logToFile(
      `[mcp-loader] WARN: failed to list in-process entries for ${pluginId} during reload: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (bustedInProcessEntries.length > 0) {
    try {
      const { bustInProcessServerCache } = await import(
        "@/lib/plugins/transport-dispatch"
      );
      for (const entryPath of bustedInProcessEntries) {
        bustInProcessServerCache(entryPath);
      }
    } catch (err) {
      logToFile(
        `[mcp-loader] WARN: failed to bust require.cache for ${pluginId} during reload: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Step 2 — Re-scan and return the fresh slice for this plugin.
  const allRegs = await listPluginMcpRegistrations();
  const registrations = allRegs.filter((r) => r.pluginId === pluginId);

  return { bustedInProcessEntries, registrations };
}
