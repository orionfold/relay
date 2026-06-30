import { NextResponse } from "next/server";
import {
  getInstanceConfig,
  getGuardrails,
  getUpgradeState,
} from "@/lib/instance/settings";
import { hasGitDir, isDevMode } from "@/lib/instance/detect";

/**
 * GET /api/instance/config
 *
 * Returns the full instance state: config, guardrails, and upgrade state
 * in a single response. Used by the Settings → Instance section and by
 * the upgrade pre-flight modal.
 *
 * Mirrors ensureInstance()'s decision tree (src/lib/instance/bootstrap.ts):
 *
 * - devMode (RELAY_DEV_MODE=true or .git/relay-dev-mode sentinel):
 *   returns `{ devMode: true }`. Prevents stale instance rows from prior
 *   testing from surfacing as if the dev repo were a real instance.
 *
 * - no .git directory (typical `npx ainative-business` install): returns
 *   `{ skippedReason: "no_git" }`. The upgrade feature requires a git
 *   repo (fetch + merge + pre-push hook) and doesn't apply to npx users,
 *   who upgrade via `npx ainative-business@latest`. The UI uses this flag
 *   to render an accurate notice instead of a false "setup incomplete"
 *   warning.
 *
 * - otherwise: returns the normal config/guardrails/upgrade payload.
 */
export async function GET() {
  try {
    if (isDevMode()) {
      return NextResponse.json({
        devMode: true,
        config: null,
        guardrails: null,
        upgrade: null,
      });
    }
    if (!hasGitDir()) {
      return NextResponse.json({
        devMode: false,
        skippedReason: "no_git",
        config: null,
        guardrails: null,
        upgrade: null,
      });
    }
    return NextResponse.json({
      devMode: false,
      config: getInstanceConfig(),
      guardrails: getGuardrails(),
      upgrade: getUpgradeState(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
