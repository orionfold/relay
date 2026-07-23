import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const PROBE_TIMEOUT_MS = 4_000;
const MAX_OUTPUT_BYTES = 256 * 1024;
const AUTH_PROBE_CACHE_MS = 1_500;
const EXECUTABLE_CACHE_MS = 30_000;

export type CliProbeStatus = "connected" | "signed-out" | "unavailable";

export interface ClaudeCliAuthProbe {
  status: CliProbeStatus;
  authMethod: string | null;
  apiProvider: string | null;
  subscriptionType: string | null;
}

export interface CodexGlobalAuthProbe {
  status: CliProbeStatus;
}

export interface CliCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type CliCommandRunner = (
  executable: string,
  args: string[],
) => Promise<CliCommandResult>;

interface CommandFailure extends Error {
  code?: string | number;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
}

interface AsyncCache<T> {
  expiresAt: number;
  promise: Promise<T>;
}

let claudeExecutableCache: AsyncCache<string | null> | null = null;
let codexExecutableCache: AsyncCache<string | null> | null = null;
let claudeAuthCache: AsyncCache<ClaudeCliAuthProbe> | null = null;
let codexAuthCache: AsyncCache<CodexGlobalAuthProbe> | null = null;

function cached<T>(
  current: AsyncCache<T> | null,
  ttlMs: number,
  load: () => Promise<T>,
): AsyncCache<T> {
  if (current && current.expiresAt > Date.now()) return current;
  return {
    expiresAt: Date.now() + ttlMs,
    promise: load(),
  };
}

function outputText(value: string | Buffer | undefined): string {
  if (typeof value === "string") return value;
  return value ? value.toString("utf8") : "";
}

async function runCommand(
  executable: string,
  args: string[],
): Promise<CliCommandResult> {
  try {
    const result = await execFileAsync(executable, args, {
      timeout: PROBE_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
      env: process.env,
    });
    return {
      exitCode: 0,
      stdout: outputText(result.stdout),
      stderr: outputText(result.stderr),
    };
  } catch (error) {
    const failure = error as CommandFailure;
    if (typeof failure.code !== "number") throw error;
    return {
      exitCode: failure.code,
      stdout: outputText(failure.stdout),
      stderr: outputText(failure.stderr),
    };
  }
}

function executableNames(command: string): string[] {
  return process.platform === "win32"
    ? [`${command}.exe`, `${command}.cmd`, command]
    : [command];
}

function pathCandidates(command: string): string[] {
  const directories = (process.env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean);
  return directories.flatMap((directory) =>
    executableNames(command).map((name) => join(directory, name)),
  );
}

function bundledClaudeCandidates(): string[] {
  try {
    const sdkEntrypoint = require.resolve("@anthropic-ai/claude-agent-sdk");
    const anthropicScopeDir = dirname(dirname(sdkEntrypoint));
    const executable = process.platform === "win32" ? "claude.exe" : "claude";
    const baseName = `claude-agent-sdk-${process.platform}-${process.arch}`;
    return [
      join(anthropicScopeDir, baseName, executable),
      join(anthropicScopeDir, `${baseName}-musl`, executable),
    ];
  } catch {
    return [];
  }
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

async function existingExecutableCandidates(
  candidates: Array<string | undefined>,
): Promise<string[]> {
  const results = await Promise.all(
    unique(candidates).map(async (candidate) => {
      try {
        await access(candidate, fsConstants.X_OK);
        return candidate;
      } catch {
        return null;
      }
    }),
  );
  return results.filter((candidate): candidate is string => candidate !== null);
}

export async function selectHealthyCliCandidate(
  candidates: string[],
  runner: CliCommandRunner,
): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      const result = await runner(candidate, ["--version"]);
      if (result.exitCode === 0) return candidate;
    } catch {
      // A broken shim or missing platform package is not authoritative. Try the
      // next installed candidate before reporting the CLI unavailable.
    }
  }
  return null;
}

export async function resolveClaudeExecutable(): Promise<string | null> {
  claudeExecutableCache = cached(
    claudeExecutableCache,
    EXECUTABLE_CACHE_MS,
    async () => {
      const candidates = await existingExecutableCandidates([
        process.env.CLAUDE_CODE_EXECUTABLE,
        ...pathCandidates("claude"),
        join(homedir(), ".local", "bin", "claude"),
        "/opt/homebrew/bin/claude",
        "/usr/local/bin/claude",
        ...bundledClaudeCandidates(),
      ]);
      return selectHealthyCliCandidate(candidates, runCommand);
    },
  );
  return claudeExecutableCache.promise;
}

export async function resolveCodexExecutable(): Promise<string | null> {
  codexExecutableCache = cached(
    codexExecutableCache,
    EXECUTABLE_CACHE_MS,
    async () => {
      const candidates = await existingExecutableCandidates([
        process.env.RELAY_CODEX_EXECUTABLE,
        ...pathCandidates("codex"),
        "/Applications/Codex.app/Contents/Resources/codex",
        "/Applications/ChatGPT.app/Contents/Resources/codex",
        join(homedir(), "Applications", "Codex.app", "Contents", "Resources", "codex"),
        join(homedir(), "Applications", "ChatGPT.app", "Contents", "Resources", "codex"),
      ]);
      return selectHealthyCliCandidate(candidates, runCommand);
    },
  );
  return codexExecutableCache.promise;
}

export async function inspectClaudeCliAuth(
  executable: string,
  runner: CliCommandRunner = runCommand,
): Promise<ClaudeCliAuthProbe> {
  try {
    const result = await runner(executable, ["auth", "status", "--json"]);
    let payload: unknown;
    try {
      payload = JSON.parse(result.stdout);
    } catch {
      return {
        status: "unavailable",
        authMethod: null,
        apiProvider: null,
        subscriptionType: null,
      };
    }

    if (!payload || typeof payload !== "object") {
      return {
        status: "unavailable",
        authMethod: null,
        apiProvider: null,
        subscriptionType: null,
      };
    }

    const record = payload as Record<string, unknown>;
    const loggedIn = record.loggedIn;
    if (loggedIn !== true && loggedIn !== false) {
      return {
        status: "unavailable",
        authMethod: null,
        apiProvider: null,
        subscriptionType: null,
      };
    }

    const privacySafeString = (value: unknown) =>
      typeof value === "string" && value.trim() ? value : null;
    return {
      status: loggedIn ? "connected" : "signed-out",
      authMethod: privacySafeString(record.authMethod),
      apiProvider: privacySafeString(record.apiProvider),
      subscriptionType: privacySafeString(record.subscriptionType),
    };
  } catch {
    return {
      status: "unavailable",
      authMethod: null,
      apiProvider: null,
      subscriptionType: null,
    };
  }
}

export async function probeClaudeCliAuth(): Promise<ClaudeCliAuthProbe> {
  claudeAuthCache = cached(
    claudeAuthCache,
    AUTH_PROBE_CACHE_MS,
    async () => {
      const executable = await resolveClaudeExecutable();
      if (!executable) {
        return {
          status: "unavailable",
          authMethod: null,
          apiProvider: null,
          subscriptionType: null,
        };
      }
      return inspectClaudeCliAuth(executable);
    },
  );
  return claudeAuthCache.promise;
}

export async function inspectCodexGlobalAuth(
  executable: string,
  runner: CliCommandRunner = runCommand,
): Promise<CodexGlobalAuthProbe> {
  try {
    const result = await runner(executable, ["login", "status"]);
    return {
      status:
        result.exitCode === 0
          ? "connected"
          : result.exitCode === 1
            ? "signed-out"
            : "unavailable",
    };
  } catch {
    return { status: "unavailable" };
  }
}

export async function probeCodexGlobalAuth(): Promise<CodexGlobalAuthProbe> {
  codexAuthCache = cached(
    codexAuthCache,
    AUTH_PROBE_CACHE_MS,
    async () => {
      const executable = await resolveCodexExecutable();
      if (!executable) return { status: "unavailable" };
      return inspectCodexGlobalAuth(executable);
    },
  );
  return codexAuthCache.promise;
}
