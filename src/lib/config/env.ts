import { homedir } from "os";
import { join, resolve } from "path";

/**
 * Centralized environment + data-dir accessor.
 *
 * Single source of truth for every `RELAY_*` environment variable the app
 * reads, plus the canonical data-dir / db-path resolution. Routing all reads
 * through here means a future rename (or a new key) is a one-file change
 * instead of a scattered sweep across ~49 call sites.
 *
 * Naming history: the data dir + keys were `AINATIVE_*` / `~/.ainative` prior
 * to the Orionfold Relay rename. Strategy "accept the break" (single-user,
 * pre-release): we read `RELAY_*` only — there is no `AINATIVE_*` fallback and
 * no migration shim. Existing installs are moved by hand
 * (`mv ~/.ainative ~/.relay` + rename keys in `.env.local`).
 *
 * Boolean keys preserve each call site's original comparison exactly:
 * - devMode / instanceMode / safeMode / chatBranching → `=== "true"`
 * - perToolApproval → `=== "1"`
 * - pluginConfinement → `!== "1"` (confinement ON unless explicitly "1"... see note)
 */

const DEFAULT_DATA_DIR_NAME = ".relay";
const DB_FILENAME = "relay.db";

export const RELAY_CELL_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;

export class InvalidRelayCellIdError extends Error {
  readonly code = "CELL_ID_INVALID" as const;

  constructor() {
    super("RELAY_CELL_ID must be a lowercase DNS label of at most 63 characters.");
    this.name = "InvalidRelayCellIdError";
  }
}

/**
 * Returns the Host-supplied managed Cell identity when configured.
 *
 * The environment/Host manifest is authoritative for a managed Cell. Invalid
 * values fail closed instead of falling through to a git-bootstrap identity.
 */
export function relayCellIdOverride(): string | undefined {
  const cellId = process.env.RELAY_CELL_ID;
  if (cellId === undefined) return undefined;
  if (!RELAY_CELL_ID_PATTERN.test(cellId)) {
    throw new InvalidRelayCellIdError();
  }
  return cellId;
}

/**
 * Canonical data directory. `RELAY_DATA_DIR` override (used by isolated
 * private instances + tests) wins; otherwise `~/.relay`.
 */
export function dataDir(): string {
  return process.env.RELAY_DATA_DIR || join(homedir(), DEFAULT_DATA_DIR_NAME);
}

/** Canonical SQLite database path: `<dataDir>/relay.db`. */
export function dbPath(): string {
  return join(dataDir(), DB_FILENAME);
}

/** Raw `RELAY_DATA_DIR` override (unresolved); undefined when not set. */
export function dataDirOverride(): string | undefined {
  return process.env.RELAY_DATA_DIR;
}

/**
 * True when `RELAY_DATA_DIR` points somewhere other than the default
 * `~/.relay` — i.e. this clone runs as an isolated private instance.
 */
export function isPrivateDataDir(): boolean {
  const override = process.env.RELAY_DATA_DIR;
  if (!override) return false;
  return resolve(override) !== resolve(join(homedir(), DEFAULT_DATA_DIR_NAME));
}

/**
 * The directory the user launched Relay from (falls back to process.cwd()).
 * Set by the CLI when spawning the Next child so server code can resolve the
 * user's workspace rather than the app install dir.
 */
export function launchCwd(): string {
  return process.env.RELAY_LAUNCH_CWD || process.cwd();
}

/** Primary per-developer dev-mode gate (skips instance bootstrap). */
export function isDevModeEnv(): boolean {
  return process.env.RELAY_DEV_MODE === "true";
}

/** Override that forces instance bootstrap to run even in dev mode. */
export function isInstanceModeEnv(): boolean {
  return process.env.RELAY_INSTANCE_MODE === "true";
}

/** Safe mode — disables MCP plugin loading. */
export function isSafeMode(): boolean {
  return process.env.RELAY_SAFE_MODE === "true";
}

/** chat-conversation-branches v1 feature flag (default-off). */
export function isChatBranchingEnabled(): boolean {
  return process.env.RELAY_CHAT_BRANCHING === "true";
}

/** Per-tool approval prompts (opt-in via `RELAY_PER_TOOL_APPROVAL=1`). */
export function isPerToolApprovalEnabled(): boolean {
  return process.env.RELAY_PER_TOOL_APPROVAL === "1";
}

/**
 * Plugin confinement gate. Preserves the original inverted semantics: the
 * confinement code path is skipped only when `RELAY_PLUGIN_CONFINEMENT === "1"`.
 * Callers use `isPluginConfinementOptOut()` where they previously wrote
 * `process.env.AINATIVE_PLUGIN_CONFINEMENT !== "1"`.
 */
export function isPluginConfinementOptOut(): boolean {
  return process.env.RELAY_PLUGIN_CONFINEMENT !== "1";
}
