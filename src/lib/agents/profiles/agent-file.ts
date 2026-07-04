import fs from "node:fs";
import path from "node:path";

/**
 * The on-disk manifest filename for an agent (formerly "profile.yaml").
 *
 * The Profiles primitive was renamed to Agents. New agents are written as
 * `agent.yaml`; existing installs may still hold `profile.yaml` files. A
 * one-time boot migration (migrate-to-ainative.ts) renames them, and until it
 * runs, `resolveAgentFile` reads either name so nothing disappears.
 *
 * Kept as an import-free leaf so both the registry and the boot migration can
 * depend on it without a cycle.
 */
export const AGENT_FILENAME = "agent.yaml";

/** Legacy filename kept for backward-compatible reads + the boot rename. */
export const LEGACY_PROFILE_FILENAME = "profile.yaml";

/**
 * Return the path to an agent's manifest inside `dir`, preferring the new
 * `agent.yaml` and falling back to a legacy `profile.yaml`. Returns `null` when
 * neither exists (caller should skip the directory).
 */
export function resolveAgentFile(dir: string): string | null {
  const agentPath = path.join(dir, AGENT_FILENAME);
  if (fs.existsSync(agentPath)) return agentPath;
  const legacyPath = path.join(dir, LEGACY_PROFILE_FILENAME);
  if (fs.existsSync(legacyPath)) return legacyPath;
  return null;
}

/** True when `dir` contains either an `agent.yaml` or a legacy `profile.yaml`. */
export function hasAgentFile(dir: string): boolean {
  return resolveAgentFile(dir) !== null;
}
