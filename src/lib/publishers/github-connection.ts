import { execFile } from "node:child_process";
import { SETTINGS_KEYS } from "@/lib/constants/settings";
import { deleteSetting, getSetting, setSetting } from "@/lib/settings/helpers";
import { decrypt, encrypt } from "@/lib/utils/crypto";

const GITHUB_API = "https://api.github.com";

export type GitHubConnectionSource = "settings" | "environment" | "github-cli";
export type GitHubRepositoryVisibility = "public" | "private";

export interface GitHubCliStatus {
  installed: boolean;
}

export interface GitHubConnectionStatus {
  connected: boolean;
  login: string | null;
  source: GitHubConnectionSource | null;
  tokenHint: string | null;
  verifiedAt: string | null;
  error: string | null;
}

export interface GitHubRepositoryOption {
  owner: string;
  repo: string;
  fullName: string;
  visibility: GitHubRepositoryVisibility;
  defaultBranch: string;
}

export interface GitHubRepositoryDetails extends GitHubRepositoryOption {
  canPush: boolean;
}

type GitHubUserResponse = { login?: unknown };
type GitHubRepoResponse = {
  name?: unknown;
  full_name?: unknown;
  private?: unknown;
  default_branch?: unknown;
  owner?: { login?: unknown };
  permissions?: { admin?: unknown; maintain?: unknown; push?: unknown };
};

export class GitHubConnectionError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "GitHubConnectionError";
    this.statusCode = statusCode;
  }
}

export class GitHubCliConnectionError extends GitHubConnectionError {
  readonly unavailable: boolean;

  constructor(message: string, statusCode: number, unavailable = false) {
    super(message, statusCode);
    this.name = "GitHubCliConnectionError";
    this.unavailable = unavailable;
  }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hint(token: string): string {
  return `••••${token.slice(-4)}`;
}

const GITHUB_CLI_EXECUTABLES = process.platform === "win32"
  ? ["gh.exe"]
  : [
      "gh",
      "/opt/homebrew/bin/gh",
      "/usr/local/bin/gh",
      "/opt/local/bin/gh",
      "/home/linuxbrew/.linuxbrew/bin/gh",
    ];

function runGitHubCliExecutable(executable: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      args,
      { encoding: "utf8", timeout: 5_000, maxBuffer: 16_384 },
      (error, stdout) => {
        if (error) {
          const unavailable = (error as NodeJS.ErrnoException).code === "ENOENT";
          reject(
            new GitHubCliConnectionError(
              unavailable
                ? "GitHub CLI is not installed or is not available to Relay."
                : "GitHub CLI is not authenticated for github.com. Run gh auth login, then try again.",
              unavailable ? 409 : 401,
              unavailable
            )
          );
          return;
        }
        resolve(stdout);
      }
    );
  });
}

async function runGitHubCli(args: string[]): Promise<string> {
  for (const executable of GITHUB_CLI_EXECUTABLES) {
    try {
      return await runGitHubCliExecutable(executable, args);
    } catch (error) {
      if (!(error instanceof GitHubCliConnectionError) || !error.unavailable) throw error;
    }
  }
  throw new GitHubCliConnectionError(
    "GitHub CLI is not installed or is not available to Relay.",
    409,
    true
  );
}

async function githubCliToken(user?: string): Promise<string> {
  const args = ["auth", "token", "--hostname", "github.com"];
  if (user) args.push("--user", user);
  const token = (await runGitHubCli(args)).trim();
  if (!token) {
    throw new GitHubCliConnectionError(
      "GitHub CLI returned no credential. Run gh auth login, then try again.",
      401
    );
  }
  return token;
}

export async function getGitHubCliStatus(): Promise<GitHubCliStatus> {
  try {
    await runGitHubCli(["--version"]);
    return { installed: true };
  } catch (error) {
    return {
      installed: !(error instanceof GitHubCliConnectionError && error.unavailable),
    };
  }
}

export function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "orionfold-relay",
    "X-GitHub-Api-Version": "2026-03-10",
  };
}

async function githubFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, { headers: githubHeaders(token) });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new GitHubConnectionError(
      `GitHub request failed: ${response.status}${detail ? ` — ${detail.slice(0, 240)}` : ""}`,
      response.status === 401 || response.status === 403 ? 401 : 502
    );
  }
  return (await response.json()) as T;
}

async function storedToken(): Promise<string | null> {
  const encrypted = await getSetting(SETTINGS_KEYS.GITHUB_TOKEN);
  if (!encrypted) return null;
  try {
    const token = decrypt(encrypted);
    return nonEmpty(token) ? token : null;
  } catch {
    throw new GitHubConnectionError(
      "The saved GitHub connection could not be decrypted. Reconnect GitHub in Settings.",
      500
    );
  }
}

export async function getGitHubToken(): Promise<{
  token: string;
  source: GitHubConnectionSource;
} | null> {
  const method = await getSetting(SETTINGS_KEYS.GITHUB_CONNECTION_METHOD);
  if (method === "github-cli") {
    const login = await getSetting(SETTINGS_KEYS.GITHUB_LOGIN);
    if (!nonEmpty(login)) {
      throw new GitHubCliConnectionError(
        "The selected GitHub CLI account is missing. Reconnect GitHub CLI in Settings.",
        409
      );
    }
    return { token: await githubCliToken(login), source: "github-cli" };
  }
  if (method === "disconnected") {
    if (nonEmpty(process.env.GITHUB_TOKEN)) {
      return { token: process.env.GITHUB_TOKEN, source: "environment" };
    }
    return null;
  }
  const saved = await storedToken();
  if (saved) return { token: saved, source: "settings" };
  if (nonEmpty(process.env.GITHUB_TOKEN)) {
    return { token: process.env.GITHUB_TOKEN, source: "environment" };
  }
  return null;
}

export async function getGitHubConnectionStatus(): Promise<GitHubConnectionStatus> {
  const method = await getSetting(SETTINGS_KEYS.GITHUB_CONNECTION_METHOD);
  let credential: Awaited<ReturnType<typeof getGitHubToken>>;
  try {
    credential = await getGitHubToken();
  } catch (error) {
    if (method === "github-cli" && error instanceof GitHubCliConnectionError) {
      return {
        connected: false,
        login: (await getSetting(SETTINGS_KEYS.GITHUB_LOGIN)) || null,
        source: "github-cli",
        tokenHint: null,
        verifiedAt: null,
        error: error.message,
      };
    }
    throw error;
  }
  if (!credential) {
    return {
      connected: false,
      login: null,
      source: null,
      tokenHint: null,
      verifiedAt: null,
      error: null,
    };
  }
  const [savedLogin, verifiedAt] = await Promise.all([
    getSetting(SETTINGS_KEYS.GITHUB_LOGIN),
    getSetting(SETTINGS_KEYS.GITHUB_VERIFIED_AT),
  ]);
  return {
    connected: true,
    login: savedLogin || null,
    source: credential.source,
    tokenHint: credential.source === "github-cli" ? null : hint(credential.token),
    verifiedAt: verifiedAt || null,
    error: null,
  };
}

export async function connectGitHub(tokenInput: string): Promise<GitHubConnectionStatus> {
  const token = tokenInput.trim();
  if (!token) throw new GitHubConnectionError("Enter a GitHub token.");
  const user = await githubFetch<GitHubUserResponse>("/user", token);
  if (!nonEmpty(user.login)) {
    throw new GitHubConnectionError("GitHub returned no account login for this token.", 502);
  }
  await setSetting(SETTINGS_KEYS.GITHUB_TOKEN, encrypt(token));
  await setSetting(SETTINGS_KEYS.GITHUB_CONNECTION_METHOD, "settings");
  await setSetting(SETTINGS_KEYS.GITHUB_LOGIN, user.login);
  const verifiedAt = new Date().toISOString();
  await setSetting(SETTINGS_KEYS.GITHUB_VERIFIED_AT, verifiedAt);
  await setSetting(SETTINGS_KEYS.GITHUB_CONNECTION_INITIALIZED, "true");
  return {
    connected: true,
    login: user.login,
    source: "settings",
    tokenHint: hint(token),
    verifiedAt,
    error: null,
  };
}

export async function connectGitHubCli(): Promise<GitHubConnectionStatus> {
  const token = await githubCliToken();
  const user = await githubFetch<GitHubUserResponse>("/user", token);
  if (!nonEmpty(user.login)) {
    throw new GitHubCliConnectionError(
      "GitHub returned no account login for the GitHub CLI credential.",
      502
    );
  }
  await setSetting(SETTINGS_KEYS.GITHUB_CONNECTION_METHOD, "github-cli");
  await deleteSetting(SETTINGS_KEYS.GITHUB_TOKEN);
  await setSetting(SETTINGS_KEYS.GITHUB_LOGIN, user.login);
  const verifiedAt = new Date().toISOString();
  await setSetting(SETTINGS_KEYS.GITHUB_VERIFIED_AT, verifiedAt);
  await setSetting(SETTINGS_KEYS.GITHUB_CONNECTION_INITIALIZED, "true");
  return {
    connected: true,
    login: user.login,
    source: "github-cli",
    tokenHint: null,
    verifiedAt,
    error: null,
  };
}

export async function disconnectGitHub(): Promise<void> {
  // Fail closed first: if Relay stops between these idempotent writes, neither
  // a saved token nor a selected CLI provider can silently remain active.
  await setSetting(SETTINGS_KEYS.GITHUB_CONNECTION_METHOD, "disconnected");
  await deleteSetting(SETTINGS_KEYS.GITHUB_TOKEN);
  await deleteSetting(SETTINGS_KEYS.GITHUB_LOGIN);
  await deleteSetting(SETTINGS_KEYS.GITHUB_VERIFIED_AT);
  // Keep this marker so an explicit disconnect cannot silently fall back to
  // credentials embedded in pre-shared-connection target rows.
  await setSetting(SETTINGS_KEYS.GITHUB_CONNECTION_INITIALIZED, "true");
}

export async function verifyGitHubConnection(): Promise<GitHubConnectionStatus> {
  const credential = await getGitHubToken();
  if (!credential) throw new GitHubConnectionError("Connect GitHub in Settings first.", 409);
  let user: GitHubUserResponse;
  try {
    user = await githubFetch<GitHubUserResponse>("/user", credential.token);
  } catch (error) {
    if (credential.source !== "environment") {
      await setSetting(SETTINGS_KEYS.GITHUB_VERIFIED_AT, "");
    }
    throw error;
  }
  if (!nonEmpty(user.login)) throw new GitHubConnectionError("GitHub returned no account login.", 502);
  const verifiedAt = new Date().toISOString();
  if (credential.source !== "environment") {
    await setSetting(SETTINGS_KEYS.GITHUB_LOGIN, user.login);
    await setSetting(SETTINGS_KEYS.GITHUB_VERIFIED_AT, verifiedAt);
  }
  return {
    connected: true,
    login: user.login,
    source: credential.source,
    tokenHint: credential.source === "github-cli" ? null : hint(credential.token),
    verifiedAt,
    error: null,
  };
}

function repoOption(repo: GitHubRepoResponse): GitHubRepositoryOption | null {
  const owner = repo.owner?.login;
  const name = repo.name;
  const fullName = repo.full_name;
  if (
    !nonEmpty(owner) ||
    !nonEmpty(name) ||
    !nonEmpty(fullName) ||
    typeof repo.private !== "boolean"
  ) return null;
  return {
    owner,
    repo: name,
    fullName,
    visibility: repo.private ? "private" : "public",
    defaultBranch: nonEmpty(repo.default_branch) ? repo.default_branch : "main",
  };
}

function canPush(repo: GitHubRepoResponse): boolean {
  return Boolean(repo.permissions?.admin || repo.permissions?.maintain || repo.permissions?.push);
}

export async function listGitHubRepositories(): Promise<GitHubRepositoryOption[]> {
  const credential = await getGitHubToken();
  if (!credential) throw new GitHubConnectionError("Connect GitHub in Settings first.", 409);
  const repos = await githubFetch<GitHubRepoResponse[]>(
    "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
    credential.token
  );
  return repos
    .filter(canPush)
    .map(repoOption)
    .filter((repo): repo is GitHubRepositoryOption => repo !== null);
}

export async function resolveGitHubToken(
  config: Record<string, unknown>
): Promise<Record<string, unknown> & { githubToken: string }> {
  const shared = await getGitHubToken();
  if (shared) return { ...config, githubToken: shared.token };
  if ((await getSetting(SETTINGS_KEYS.GITHUB_CONNECTION_INITIALIZED)) === "true") {
    throw new GitHubConnectionError("Connect GitHub in Settings before publishing.", 409);
  }
  if (nonEmpty(config.githubToken)) return { ...config, githubToken: config.githubToken };
  throw new GitHubConnectionError("Connect GitHub in Settings before publishing.", 409);
}

export async function inspectGitHubRepository(
  config: Record<string, unknown>
): Promise<GitHubRepositoryDetails> {
  const owner = config.owner;
  const repo = config.repo;
  if (!nonEmpty(owner) || !nonEmpty(repo)) {
    throw new GitHubConnectionError("Repository owner and name are required.");
  }
  const resolved = await resolveGitHubToken(config);
  const body = await githubFetch<GitHubRepoResponse>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    resolved.githubToken
  );
  const option = repoOption(body);
  if (!option) throw new GitHubConnectionError("GitHub returned invalid repository metadata.", 502);
  return { ...option, canPush: canPush(body) };
}
