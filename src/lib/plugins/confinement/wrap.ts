/**
 * wrap.ts — Plugin-MCP spawn wrapper for OS-level confinement (T14)
 *
 * Given a plugin's raw spawn config (command + args + env) plus its manifest
 * metadata (confinementMode, capabilities, dockerImage), returns a
 * `WrapDecision` that is either:
 *
 *   - `ok: true` with a wrapped `{ command, args, env }` the caller uses for
 *     `spawn(...)` — unchanged for mode `"none"`, prefixed with
 *     `sandbox-exec` / `aa-exec` / `docker run` for the other modes.
 *   - `ok: false` with a reason (`confinement_unsupported_on_platform`) +
 *     detail message suitable for the disabled registration surface.
 *
 * Per-capability profile files live in `./profiles/`. For M3, these profiles
 * are minimal stubs; the real policy corpus is M3.5 follow-up.
 *
 * Docker boot sweep (`dockerBootSweep()`) force-kills any containers labeled
 * `ainative-plugin=...` left from a previous crashed run. Called once per
 * process by the mcp-loader.
 *
 * Security note: all subprocess invocations use `execFileSync` (argv, no
 * shell) so untrusted plugin id / container id / image name strings cannot
 * inject shell metacharacters.
 *
 * Spec anchor: features/chat-tools-plugin-kind-1.md → "Confinement modes".
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import type { Capability } from "@/lib/plugins/sdk/types";
import { getAinativeLogsDir, getAinativePluginsDir } from "@/lib/utils/ainative-paths";
import { isPluginConfinementOptOut } from "@/lib/config/env";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConfinementMode = "none" | "seatbelt" | "apparmor" | "docker";

export interface WrappedSpawn {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface WrapResult {
  ok: true;
  wrapped: WrappedSpawn;
  /** Human-readable summary for dry-run output. */
  describe: string;
}

export interface WrapUnsupported {
  ok: false;
  reason: "confinement_unsupported_on_platform";
  detail: string;
}

export type WrapDecision = WrapResult | WrapUnsupported;

export interface WrapInput {
  /** Base command + args + env (as computed by mcp-loader from .mcp.json). */
  command: string;
  args: string[];
  env?: Record<string, string>;
  /** Manifest metadata. */
  pluginId: string;
  pluginDir: string;
  confinementMode: ConfinementMode;
  capabilities: Capability[];
  dockerImage?: string;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function logToFile(line: string): void {
  try {
    const logsDir = getAinativeLogsDir();
    fs.mkdirSync(logsDir, { recursive: true });
    fs.appendFileSync(
      path.join(logsDir, "plugins.log"),
      `${new Date().toISOString()} ${line}\n`,
    );
  } catch {
    /* swallow log errors — never let logging break wrap */
  }
}

// ---------------------------------------------------------------------------
// Profile directory resolution + inline fallback
// ---------------------------------------------------------------------------

/**
 * Resolve the absolute path to a bundled profile file. Uses import.meta.url
 * so this works under ts-node, vitest, built dist/, and hoisted npx installs.
 *
 * When the file cannot be read (e.g. built dist/ without profile assets
 * copied), we fall back to the inline stubs below. The `profiles/*.sb` /
 * `profiles/*.profile` files on disk remain the canonical artifacts shipped
 * in the source tree — they are referenced by AppArmor install instructions
 * and by future M3.5 policy corpus work — but for the wrap helper's runtime
 * purpose, the inline fallback guarantees non-empty policy composition even
 * when filesystem access to the bundled profiles fails.
 */
function profilePath(relative: string): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(moduleDir, "profiles", relative);
}

/**
 * Inline fallback for seatbelt per-capability snippets (no header — the
 * wrap layer adds version + deny default). Mirrors the content of
 * `./profiles/seatbelt-<cap>.sb`; keep in sync when profiles change.
 */
const SEATBELT_INLINE_FALLBACK: Record<string, string> = {
  net: "(allow network*)\n(allow mach-lookup)\n(allow sysctl-read)\n",
  fs: '(allow file-read*)\n(allow file-write* (subpath "/tmp"))\n(allow file-write* (subpath "/private/tmp"))\n(allow file-write* (subpath "/var/folders"))\n',
  child_process:
    "(allow process-fork)\n(allow process-exec)\n(allow signal (target self))\n",
  env: "(allow sysctl-read)\n(allow mach-lookup)\n",
};

/**
 * Read a seatbelt profile snippet for the given capability. Tries the on-disk
 * bundled file first; falls back to the inline string if the file can't be
 * read. Logs a one-time warning per-cap on fallback so ops know their bundle
 * lacks profile assets.
 */
const seatbeltFallbackLogged = new Set<string>();
function readSeatbeltProfile(cap: string, pluginId: string): string {
  const p = profilePath(`seatbelt-${cap}.sb`);
  try {
    return fs.readFileSync(p, "utf-8");
  } catch (err) {
    if (!seatbeltFallbackLogged.has(cap)) {
      seatbeltFallbackLogged.add(cap);
      logToFile(
        `[confinement] plugin ${pluginId}: seatbelt profile file not found at ${p} — using inline fallback for "${cap}" (${err instanceof Error ? err.message : String(err)})`,
      );
    }
    return SEATBELT_INLINE_FALLBACK[cap] ?? "";
  }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function wrapStdioSpawn(
  input: WrapInput,
  platform?: NodeJS.Platform,
): WrapDecision {
  // TDR-037 PARK — confinement modes are OFF by default. The seatbelt /
  // apparmor / docker wrap paths are retained as a §11 Risk D off-ramp
  // for the third-party plugin distribution lane that strategy §10
  // refused; they don't activate until the first external plugin with
  // child_process or fs capabilities demands isolation. Opt in via
  // AINATIVE_PLUGIN_CONFINEMENT=1 to exercise the wrap path. When OFF,
  // all confinementMode values fall through to unconfined spawn — the
  // self-extension posture expected by users habituated to Claude Code /
  // Codex CLI freedom.
  if (isPluginConfinementOptOut()) {
    return {
      ok: true,
      wrapped: {
        command: input.command,
        args: input.args,
        ...(input.env !== undefined ? { env: input.env } : {}),
      },
      describe: `confinement parked (RELAY_PLUGIN_CONFINEMENT not set) — direct spawn ${input.command} ${input.args.join(" ")}`,
    };
  }

  const effectivePlatform = platform ?? process.platform;
  switch (input.confinementMode) {
    case "none":
      return {
        ok: true,
        wrapped: {
          command: input.command,
          args: input.args,
          ...(input.env !== undefined ? { env: input.env } : {}),
        },
        describe: `confinementMode: none — direct spawn ${input.command} ${input.args.join(" ")}`,
      };
    case "seatbelt":
      return wrapSeatbelt(input, effectivePlatform);
    case "apparmor":
      return wrapAppArmor(input, effectivePlatform);
    case "docker":
      return wrapDocker(input);
    default: {
      // Exhaustiveness check — unreachable because Zod validates the enum.
      const _exhaustive: never = input.confinementMode;
      void _exhaustive;
      return {
        ok: false,
        reason: "confinement_unsupported_on_platform",
        detail: `unknown confinementMode: ${String(input.confinementMode)}`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Seatbelt (macOS)
// ---------------------------------------------------------------------------

function wrapSeatbelt(
  input: WrapInput,
  platform: NodeJS.Platform,
): WrapDecision {
  if (platform !== "darwin") {
    return {
      ok: false,
      reason: "confinement_unsupported_on_platform",
      detail: `seatbelt confinement requires macOS (darwin); current platform: ${platform}`,
    };
  }

  // Compose policy: header + (deny default) + per-capability snippets.
  const header = `(version 1)\n(deny default)\n(allow process-fork)\n(allow signal (target self))\n`;

  const parts: string[] = [header];
  for (const cap of input.capabilities) {
    const snippet = readSeatbeltProfile(cap, input.pluginId);
    if (snippet.length > 0) parts.push(snippet);
  }

  const policy = parts.join("\n");

  // sandbox-exec reads the policy from -p <inline-string>. macOS accepts the
  // full policy in-argv (bounded at ARG_MAX, typically 256KB — well above our
  // ~1KB stubs).
  const args = ["-p", policy, input.command, ...input.args];

  return {
    ok: true,
    wrapped: {
      command: "sandbox-exec",
      args,
      ...(input.env !== undefined ? { env: input.env } : {}),
    },
    describe:
      `confinementMode: seatbelt (darwin) — sandbox-exec -p <policy, ` +
      `${input.capabilities.length} capability profile(s): ` +
      `${input.capabilities.join(",") || "none"}> ${input.command} ${input.args.join(" ")}`,
  };
}

// ---------------------------------------------------------------------------
// AppArmor (Linux)
// ---------------------------------------------------------------------------

/**
 * Tracks whether the "multi-cap simplification" note has been logged per
 * plugin+cap combo. Prevents log spam on repeated wrap calls.
 */
const apparmorNoteLogged = new Set<string>();

function wrapAppArmor(
  input: WrapInput,
  platform: NodeJS.Platform,
): WrapDecision {
  if (platform !== "linux") {
    return {
      ok: false,
      reason: "confinement_unsupported_on_platform",
      detail: `apparmor confinement requires Linux; current platform: ${platform}`,
    };
  }

  if (input.capabilities.length === 0) {
    return {
      ok: false,
      reason: "confinement_unsupported_on_platform",
      detail: "apparmor confinement requires at least one declared capability",
    };
  }

  // M3 simplification: if the plugin declares multiple capabilities, pick the
  // first one and log a note. Real multi-cap profile composition is M3.5.
  const primaryCap = input.capabilities[0];
  if (input.capabilities.length > 1) {
    const key = `${input.pluginId}@${input.capabilities.join(",")}`;
    if (!apparmorNoteLogged.has(key)) {
      apparmorNoteLogged.add(key);
      logToFile(
        `[confinement] plugin ${input.pluginId}: multi-capability apparmor simplification — using first capability ${primaryCap} only (M3.5 will compose)`,
      );
    }
  }

  const profileName = `ainative-plugin-${primaryCap}`;
  const profileInstallPath = `/etc/apparmor.d/${profileName}`;

  if (!fs.existsSync(profileInstallPath)) {
    return {
      ok: false,
      reason: "confinement_unsupported_on_platform",
      detail:
        `AppArmor profile not installed: ${profileInstallPath}. ` +
        `Install with: sudo apparmor_parser -r <path to ainative profile>`,
    };
  }

  // aa-exec -p <profile> -- <cmd> <args...>
  const args = ["-p", profileName, "--", input.command, ...input.args];

  return {
    ok: true,
    wrapped: {
      command: "aa-exec",
      args,
      ...(input.env !== undefined ? { env: input.env } : {}),
    },
    describe:
      `confinementMode: apparmor (linux) — aa-exec -p ${profileName} -- ` +
      `${input.command} ${input.args.join(" ")}`,
  };
}

// ---------------------------------------------------------------------------
// Docker
// ---------------------------------------------------------------------------

function wrapDocker(input: WrapInput): WrapDecision {
  if (!input.dockerImage) {
    return {
      ok: false,
      reason: "confinement_unsupported_on_platform",
      detail: "dockerImage field required in plugin.yaml when confinementMode is docker",
    };
  }

  // Probe for docker in PATH — argv form, no shell.
  try {
    execFileSync("docker", ["--version"], { stdio: "ignore" });
  } catch {
    return {
      ok: false,
      reason: "confinement_unsupported_on_platform",
      detail: "docker not found in PATH (docker --version failed)",
    };
  }

  // Network scope: bridge if [net] declared, none otherwise.
  const networkScope = input.capabilities.includes("net") ? "bridge" : "none";

  // Volume mounts: mount pluginDir/state read-write if [fs] declared.
  const mountArgs: string[] = [];
  if (input.capabilities.includes("fs")) {
    const stateDir = path.join(input.pluginDir, "state");
    try {
      fs.mkdirSync(stateDir, { recursive: true });
    } catch (err) {
      logToFile(
        `[confinement] plugin ${input.pluginId}: failed to create docker state mount dir ${stateDir} — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    mountArgs.push("-v", `${stateDir}:/state`);
  }

  // Propagate env via -e KEY=VALUE. Explicit values only — don't inherit shell.
  const envArgs: string[] = [];
  if (input.env) {
    for (const [k, v] of Object.entries(input.env)) {
      envArgs.push("-e", `${k}=${v}`);
    }
  }

  const args = [
    "run",
    "--rm",
    "-i",
    "--network",
    networkScope,
    "--label",
    `ainative-plugin=${input.pluginId}`,
    "--label",
    `ainative-pid=${process.pid}`,
    ...mountArgs,
    ...envArgs,
    input.dockerImage,
    input.command,
    ...input.args,
  ];

  return {
    ok: true,
    wrapped: {
      command: "docker",
      args,
      // Don't pass env through again — already translated to -e flags.
    },
    describe:
      `confinementMode: docker — docker run --rm -i --network ${networkScope} ` +
      `--label ainative-plugin=${input.pluginId} --label ainative-pid=${process.pid}` +
      (mountArgs.length > 0 ? ` ${mountArgs.join(" ")}` : "") +
      ` ${input.dockerImage} ${input.command} ${input.args.join(" ")}`,
  };
}

// ---------------------------------------------------------------------------
// Docker boot sweep
// ---------------------------------------------------------------------------

/**
 * Boot-time cleanup: kill any Docker containers labeled `ainative-plugin=*`
 * left over from a previous ainative run (force-kill, crash, etc.). Graceful —
 * never throws, logs failures. Callers should gate invocation with a
 * module-level "already swept" boolean to avoid re-sweeping per request.
 *
 * Uses `execFileSync` (argv, no shell) to prevent injection via container
 * ids returned by docker ps.
 */
export function dockerBootSweep(): void {
  // TDR-037 PARK — see wrapStdioSpawn header. Don't probe `docker ps`
  // when confinement is off; nothing could have created labeled
  // containers in the first place.
  if (isPluginConfinementOptOut()) {
    return;
  }

  let output: string;
  try {
    const buf = execFileSync(
      "docker",
      ["ps", "--filter", "label=ainative-plugin", "--format", "{{.ID}}"],
      { stdio: ["ignore", "pipe", "ignore"], encoding: "utf-8" },
    );
    output = buf.toString();
  } catch {
    // Docker not installed / daemon not running — nothing to sweep.
    return;
  }

  const ids = output
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    // Defense-in-depth: only accept hex ids (docker ps --format '{{.ID}}'
    // always returns short hex, but be paranoid in case format is overridden).
    .filter((s) => /^[a-f0-9]+$/i.test(s));

  if (ids.length === 0) return;

  logToFile(`[confinement] docker boot sweep: killing ${ids.length} leftover container(s)`);

  for (const id of ids) {
    try {
      execFileSync("docker", ["kill", id], { stdio: "ignore" });
      logToFile(`[confinement] docker boot sweep: killed container ${id}`);
    } catch (err) {
      logToFile(
        `[confinement] docker boot sweep: failed to kill ${id} — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// CLI dry-run helper (used by `ainative plugin dry-run <id>`)
// ---------------------------------------------------------------------------

/**
 * For a plugin by id, read its manifest + .mcp.json, compute the wrap decision
 * for each stdio server, and return a human-readable summary string.
 *
 * Placeholder implementation for M3 — prints the confinement policy that
 * WOULD be applied. Full mock-tool-invocation corpus is M3.5 follow-up.
 */
export async function dryRunConfinement(pluginId: string): Promise<string> {
  const yaml = await import("js-yaml");
  const { PluginManifestSchema } = await import("@/lib/plugins/sdk/types");
  const { parseMcpConfigFile } = await import("@/lib/environment/parsers/mcp-config");

  const pluginsDir = getAinativePluginsDir();
  const pluginDir = path.join(pluginsDir, pluginId);
  const pluginYamlPath = path.join(pluginDir, "plugin.yaml");

  if (!fs.existsSync(pluginYamlPath)) {
    return `plugin "${pluginId}" not found at ${pluginDir}`;
  }

  const yamlContent = fs.readFileSync(pluginYamlPath, "utf-8");
  let rawManifest: unknown;
  try {
    rawManifest = yaml.load(yamlContent);
  } catch (err) {
    return `plugin "${pluginId}": plugin.yaml is not valid YAML — ${err instanceof Error ? err.message : String(err)}`;
  }

  const parsed = PluginManifestSchema.safeParse(rawManifest);
  if (!parsed.success) {
    return `plugin "${pluginId}": plugin.yaml failed schema validation — ${parsed.error.message}`;
  }

  const manifest = parsed.data;
  if (manifest.kind !== "chat-tools") {
    return `plugin "${pluginId}" is kind:${manifest.kind} — confinement does not apply`;
  }

  const confinementMode = manifest.confinementMode ?? "none";
  const capabilities = manifest.capabilities ?? [];
  const dockerImage = manifest.dockerImage;

  const mcpJsonPath = path.join(pluginDir, ".mcp.json");
  const mcpServers = parseMcpConfigFile(mcpJsonPath);
  if (mcpServers === null) {
    return `plugin "${pluginId}": .mcp.json missing or invalid`;
  }

  const lines: string[] = [];
  lines.push(`Plugin: ${pluginId}`);
  lines.push(`  confinementMode: ${confinementMode}`);
  lines.push(`  capabilities:    [${capabilities.join(", ")}]`);
  if (dockerImage) lines.push(`  dockerImage:     ${dockerImage}`);
  lines.push(`  platform:        ${process.platform}`);
  lines.push("");

  for (const [serverName, rawEntry] of Object.entries(mcpServers)) {
    const hasCommand = typeof rawEntry.command === "string" && rawEntry.command.length > 0;
    if (!hasCommand) {
      lines.push(`  server "${serverName}": not a stdio transport — confinement N/A`);
      continue;
    }

    const input: WrapInput = {
      command: rawEntry.command!,
      args: rawEntry.args ?? [],
      env: rawEntry.env,
      pluginId,
      pluginDir,
      confinementMode,
      capabilities,
      ...(dockerImage !== undefined ? { dockerImage } : {}),
    };
    const decision = wrapStdioSpawn(input);

    lines.push(`  server "${serverName}":`);
    if (decision.ok) {
      lines.push(`    status:  OK`);
      lines.push(`    summary: ${decision.describe}`);
      lines.push(`    command: ${decision.wrapped.command}`);
      // Truncate inline policy content in args for readability.
      const displayArgs = decision.wrapped.args.map((a) =>
        a.length > 120 ? `${a.slice(0, 80)}...<${a.length} chars total>` : a,
      );
      lines.push(`    args:    ${JSON.stringify(displayArgs)}`);
    } else {
      lines.push(`    status:  DISABLED`);
      lines.push(`    reason:  ${decision.reason}`);
      lines.push(`    detail:  ${decision.detail}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
