import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { dirname } from "path";
import { getLaunchCwd } from "@/lib/environment/workspace-context";
import {
  getOpenAIApiKey,
  getOpenAIAuthSettings,
  updateOpenAIAuthStatus,
  clearOpenAIOAuthStatus,
  updateOpenAIOAuthStatus,
  type OpenAIAccountInfo,
  type OpenAIAuthMode,
  type OpenAIRateLimitInfo,
  type OpenAIRateLimitWindow,
} from "@/lib/settings/openai-auth";
import {
  getAinativeCodexAuthPath,
  getAinativeCodexConfigPath,
  getAinativeCodexDir,
} from "@/lib/utils/ainative-paths";
import { CodexAppServerClient } from "./codex-app-server-client";

const AINATIVE_CODEX_CONFIG = `cli_auth_credentials_store = "file"
`;

interface AccountReadResult {
  account?: {
    type?: string;
    email?: string | null;
    planType?: string | null;
  } | null;
  requiresOpenaiAuth?: boolean;
}

interface RateLimitsReadResult {
  rateLimits?: {
    limitId?: string | null;
    limitName?: string | null;
    primary?: RateLimitWindowLike | null;
    secondary?: RateLimitWindowLike | null;
  } | null;
}

interface RateLimitWindowLike {
  usedPercent?: unknown;
  windowDurationMins?: unknown;
  resetsAt?: unknown;
}

function parseRateLimitWindow(
  value: RateLimitWindowLike | null | undefined
): OpenAIRateLimitWindow | null {
  if (!value || typeof value !== "object") return null;
  return {
    usedPercent:
      typeof value.usedPercent === "number" ? value.usedPercent : null,
    windowDurationMins:
      typeof value.windowDurationMins === "number" ? value.windowDurationMins : null,
    resetsAt: typeof value.resetsAt === "number" ? value.resetsAt : null,
  };
}

function parseAccountInfo(
  value: AccountReadResult["account"]
): OpenAIAccountInfo | null {
  if (!value?.type) return null;
  if (
    value.type !== "apiKey" &&
    value.type !== "chatgpt" &&
    value.type !== "chatgptAuthTokens"
  ) {
    return null;
  }

  return {
    type: value.type,
    email: value.email ?? null,
    planType:
      value.planType && value.planType.toLowerCase() !== "unknown"
        ? value.planType
        : null,
  };
}

function extractPlanTypeFromError(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/"plan_type"\s*:\s*"([^"]+)"/);
  return match?.[1] ?? null;
}

function decodeBase64Url(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return null;
  }
}

export function extractPlanTypeFromIdToken(idToken: string): string | null {
  const [, payload] = idToken.split(".");
  if (!payload) return null;

  const decoded = decodeBase64Url(payload);
  if (!decoded) return null;

  try {
    const parsed = JSON.parse(decoded) as {
      "https://api.openai.com/auth"?: {
        chatgpt_plan_type?: string | null;
      };
    };
    return parsed["https://api.openai.com/auth"]?.chatgpt_plan_type ?? null;
  } catch {
    return null;
  }
}

async function readCodexPlanTypeFromAuthFile(): Promise<string | null> {
  try {
    const raw = await readFile(getAinativeCodexAuthPath(), "utf8");
    const parsed = JSON.parse(raw) as {
      tokens?: {
        id_token?: string | null;
      } | null;
    };
    const idToken = parsed.tokens?.id_token;
    return idToken ? extractPlanTypeFromIdToken(idToken) : null;
  } catch {
    return null;
  }
}

async function ensureCodexHomeConfig() {
  const codexDir = getAinativeCodexDir();
  const configPath = getAinativeCodexConfigPath();

  await mkdir(codexDir, { recursive: true });
  await mkdir(dirname(configPath), { recursive: true });

  let current = "";
  try {
    current = await readFile(configPath, "utf8");
  } catch {
    // File will be created below.
  }

  if (current.includes('cli_auth_credentials_store = "file"')) {
    return;
  }

  const next = current.trim().length > 0
    ? `${current.trimEnd()}\n\n${AINATIVE_CODEX_CONFIG}`
    : AINATIVE_CODEX_CONFIG;
  await writeFile(configPath, next, "utf8");
}

export async function buildCodexAuthEnv(
  env?: Record<string, string | undefined>
): Promise<Record<string, string | undefined>> {
  await ensureCodexHomeConfig();

  return {
    ...env,
    CODEX_HOME: getAinativeCodexDir(),
    OPENAI_API_KEY: env?.OPENAI_API_KEY,
  };
}

export async function connectCodexClient(options: {
  cwd?: string;
  env?: Record<string, string | undefined>;
} = {}) {
  const env = await buildCodexAuthEnv(options.env);
  return CodexAppServerClient.connect({
    cwd: options.cwd ?? getLaunchCwd(),
    env,
  });
}

export async function initializeCodexClient(client: CodexAppServerClient) {
  await client.request("initialize", {
    clientInfo: {
      name: "relay",
      version: "0.1.1",
    },
    capabilities: null,
  });
}

export async function readCodexAuthStateFromClient(
  client: CodexAppServerClient,
  options: { refreshToken?: boolean } = {}
) {
  const accountResult = (await client.request("account/read", {
    refreshToken: options.refreshToken ?? false,
  })) as AccountReadResult;

  const account = parseAccountInfo(accountResult.account ?? null);
  if (account?.type === "chatgpt" && !account.planType) {
    account.planType = await readCodexPlanTypeFromAuthFile();
  }
  let rateLimits: OpenAIRateLimitInfo | null = null;
  if (account?.type === "chatgpt") {
    try {
      const rateLimitResult = (await client.request(
        "account/rateLimits/read"
      )) as RateLimitsReadResult;
      const payload = rateLimitResult.rateLimits ?? null;
      if (payload) {
        rateLimits = {
          limitId: payload.limitId ?? null,
          limitName: payload.limitName ?? null,
          primary: parseRateLimitWindow(payload.primary),
          secondary: parseRateLimitWindow(payload.secondary),
        };
      }
    } catch (error) {
      if (!account.planType) {
        account.planType = extractPlanTypeFromError(error);
      }
      rateLimits = null;
    }
  }

  const authMode: OpenAIAuthMode =
    account?.type === "apiKey"
      ? "apikey"
      : account?.type === "chatgpt"
        ? "chatgpt"
        : account?.type === "chatgptAuthTokens"
          ? "chatgptAuthTokens"
          : null;

  return {
    connected: account?.type === "chatgpt",
    account,
    rateLimits,
    requiresOpenaiAuth: Boolean(accountResult.requiresOpenaiAuth),
    authMode,
  };
}

export type ResolvedOpenAICodexAuthContext =
  | {
      method: "api_key";
      apiKeySource: "db" | "env" | "unknown";
      connect: (cwd?: string) => Promise<CodexAppServerClient>;
    }
  | {
      method: "oauth";
      apiKeySource: "oauth";
      connect: (cwd?: string) => Promise<CodexAppServerClient>;
    };

export async function resolveOpenAICodexAuthContext(): Promise<ResolvedOpenAICodexAuthContext> {
  const settings = await getOpenAIAuthSettings();

  if (settings.method === "oauth") {
    if (!settings.oauthConnected) {
      try {
        const state = await readCodexAuthState({ refreshToken: false });
        if (!state.connected) {
          throw new Error("OpenAI ChatGPT sign-in is not configured.");
        }
      } catch {
        throw new Error(
          "OpenAI ChatGPT sign-in is not configured. Sign in from Settings > Providers & Runtimes."
        );
      }
    }

    return {
      method: "oauth",
      apiKeySource: "oauth",
      connect: (cwd?: string) =>
        connectCodexClient({
          cwd,
          env: { OPENAI_API_KEY: undefined },
        }),
    };
  }

  const { apiKey, source } = await getOpenAIApiKey();
  if (!apiKey) {
    throw new Error("OpenAI API key is not configured");
  }

  return {
    method: "api_key",
    apiKeySource: source,
    connect: (cwd?: string) =>
      connectCodexClient({
        cwd,
        env: { OPENAI_API_KEY: apiKey },
      }),
  };
}

export async function ensureOpenAICodexClientAuthenticated(
  client: CodexAppServerClient,
  auth: ResolvedOpenAICodexAuthContext
) {
  await initializeCodexClient(client);

  if (auth.method === "api_key") {
    const { apiKey } = await getOpenAIApiKey();
    if (!apiKey) {
      throw new Error("OpenAI API key is not configured");
    }
    await client.request("account/login/start", {
      type: "apiKey",
      apiKey,
    });
    await updateOpenAIAuthStatus(auth.apiKeySource);
    return;
  }

  const state = await readCodexAuthStateFromClient(client, {
    refreshToken: true,
  });
  if (!state.connected || state.account?.type !== "chatgpt") {
    throw new Error(
      "OpenAI ChatGPT sign-in is not configured. Sign in from Settings > Providers & Runtimes."
    );
  }
  await updateOpenAIOAuthStatus({
    connected: true,
    account: state.account,
    authMode: state.authMode,
    rateLimits: state.rateLimits,
  });
}

export async function readCodexAuthState(options: {
  refreshToken?: boolean;
  cwd?: string;
} = {}) {
  let client: CodexAppServerClient | null = null;

  try {
    client = await connectCodexClient({ cwd: options.cwd });
    await initializeCodexClient(client);

    const state = await readCodexAuthStateFromClient(client, {
      refreshToken: options.refreshToken,
    });

    await updateOpenAIOAuthStatus({
      connected: state.connected,
      account: state.account,
      authMode: state.authMode,
      rateLimits: state.rateLimits,
    });

    return state;
  } catch (error) {
    await clearOpenAIOAuthStatus();
    throw error;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

export async function logoutCodexAuth() {
  let client: CodexAppServerClient | null = null;

  try {
    client = await connectCodexClient();
    await initializeCodexClient(client);
    await client.request("account/logout");
  } catch {
    // Even if app-server logout fails, clear the isolated credential cache below.
  } finally {
    if (client) {
      await client.close();
    }
  }

  try {
    await rm(getAinativeCodexAuthPath(), { force: true });
  } catch {
    // Ignore cleanup failures.
  }

  await clearOpenAIOAuthStatus();
}
