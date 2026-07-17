import { NextResponse } from "next/server";
import {
  getInstanceConfig,
  getGuardrails,
  getUpgradeState,
} from "@/lib/instance/settings";
import { hasGitDir, isDevMode } from "@/lib/instance/detect";
import { getRelayCellBoundary } from "@/lib/instance/cell-boundary";

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
 * - no .git directory (typical `npx orionfold-relay` install): returns
 *   `{ skippedReason: "no_git" }`. The upgrade feature requires a git
 *   repo (fetch + merge + pre-push hook) and doesn't apply to npx users,
 *   who upgrade via `npx orionfold-relay@latest`. The UI uses this flag
 *   to render an accurate notice instead of a false "setup incomplete"
 *   warning.
 *
 * - otherwise: returns the normal config/guardrails/upgrade payload.
 */
export async function GET() {
  try {
    const boundary = getRelayCellBoundary();
    if (isDevMode()) {
      return NextResponse.json({
        devMode: true,
        boundary,
        config: null,
        guardrails: null,
        upgrade: null,
      });
    }
    if (!hasGitDir()) {
      return NextResponse.json({
        devMode: false,
        skippedReason: "no_git",
        boundary,
        config: null,
        guardrails: null,
        upgrade: null,
      });
    }
    return NextResponse.json({
      devMode: false,
      boundary,
      config: getInstanceConfig(),
      guardrails: getGuardrails(),
      upgrade: getUpgradeState(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
