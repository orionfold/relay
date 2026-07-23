import { homedir } from "os";
import { join } from "path";
import { getAppRoot } from "@/lib/utils/app-root";
import { dataDir, dbPath } from "@/lib/config/env";

// The Claude Agent SDK / `claude login` stores its cached OAuth credentials
// under the Claude config home, NOT Relay's data dir. Honor CLAUDE_CONFIG_DIR
// the same way the SDK resolves it, defaulting to ~/.claude.
export function getClaudeConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

export function getClaudeOAuthCredentialsPath(): string {
  return join(getClaudeConfigDir(), ".credentials.json");
}

// Canonical data-dir + db-path resolution now lives in @/lib/config/env (the
// single RELAY_* accessor). These helpers delegate so the resolver exists in
// exactly one place. The getAinative* names are kept (internal symbols, not a
// platform API surface) to avoid churning ~36 import sites.
export function getAinativeDataDir(): string {
  return dataDir();
}

export function getAinativeDbPath(): string {
  return dbPath();
}

export function getAinativeUploadsDir(): string {
  return join(getAinativeDataDir(), "uploads");
}

export function getAinativeBlueprintsDir(): string {
  return join(getAinativeDataDir(), "blueprints");
}

export function getAinativeScreenshotsDir(): string {
  return join(getAinativeDataDir(), "screenshots");
}

export function getAinativeSnapshotsDir(): string {
  return join(getAinativeDataDir(), "snapshots");
}

export function getAinativeOutputsDir(): string {
  return join(getAinativeDataDir(), "outputs");
}

export function getAinativeSessionsDir(): string {
  return join(getAinativeDataDir(), "sessions");
}

export function getAinativeLogsDir(): string {
  return join(getAinativeDataDir(), "logs");
}

export function getAinativeDocumentsDir(): string {
  return join(getAinativeDataDir(), "documents");
}

export function getAinativeCodexDir(): string {
  return join(getAinativeDataDir(), "codex");
}

export function getAinativeCodexConfigPath(): string {
  return join(getAinativeCodexDir(), "config.toml");
}

export function getAinativeCodexAuthPath(): string {
  return join(getAinativeCodexDir(), "auth.json");
}

/** The normal Codex CLI credential cache, never owned or mutated by Relay. */
export function getGlobalCodexAuthPath(): string {
  return join(homedir(), ".codex", "auth.json");
}

export function getAinativeProfilesDir(): string {
  return join(getAinativeDataDir(), "profiles");
}

export function getAinativePluginsDir(): string {
  return join(getAinativeDataDir(), "plugins");
}

/**
 * Composition-bundle directory — where ainative-emitted apps (profile +
 * blueprint + table + schedule compositions) live, as distinct from
 * Kind 1 MCP plugins under plugins/. Consumed by classifyPluginTrust()
 * as a self-extension signal and by the future /apps registry.
 */
export function getAinativeAppsDir(): string {
  return join(getAinativeDataDir(), "apps");
}

/** Path to the plugins.lock file — sibling of the plugins/ directory. */
export function getAinativePluginsLockPath(): string {
  return join(getAinativeDataDir(), "plugins.lock");
}

export function getAinativeSchedulesDir(): string {
  return join(getAinativeDataDir(), "schedules");
}

/** Bundled example plugins shipped with the app (source tree, not data dir). */
export function getAinativePluginExamplesDir(): string {
  return join(
    getAppRoot(import.meta.dirname, 3),
    "src", "lib", "plugins", "examples"
  );
}
