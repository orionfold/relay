import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAppRoot } from "@/lib/utils/app-root";

declare const __RELAY_CORE_VERSION__: string | undefined;

/** Minimal version lookup safe for snapshots, recovery, Next, and the CLI bundle. */
export function relayProductVersion(): string {
  if (typeof __RELAY_CORE_VERSION__ === "string" && /^\d+\.\d+\.\d+/.test(__RELAY_CORE_VERSION__)) {
    return __RELAY_CORE_VERSION__;
  }
  try {
    const root = getAppRoot(import.meta.dirname, 3);
    const parsed = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version?: unknown };
    if (typeof parsed.version === "string" && /^\d+\.\d+\.\d+/.test(parsed.version)) return parsed.version;
  } catch {
    // Callers expose this conservative value in compatibility diagnostics.
  }
  return "0.0.0";
}
