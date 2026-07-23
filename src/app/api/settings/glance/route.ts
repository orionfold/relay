import { NextResponse } from "next/server";
import { count } from "drizzle-orm";
import { getLicensedIdentity } from "@/lib/licensing/store";
import {
  getRuntimeRoutingStatuses,
  pickReadyRuntime,
} from "@/lib/settings/runtime-routing-status";
import {
  summarizeRuntimeReadiness,
  type RuntimeReadinessSummary,
} from "@/lib/settings/runtime-readiness-summary";
import { getBudgetGuardrailSnapshot } from "@/lib/settings/budget-guardrails";
import { getRoutingSettings } from "@/lib/settings/routing";
import { getActivePresets } from "@/lib/settings/permission-presets";
import { getAllowedPermissions } from "@/lib/settings/permissions";
import { getSetting } from "@/lib/settings/helpers";
import { SETTINGS_KEYS, type RoutingPreference } from "@/lib/constants/settings";
import { db } from "@/lib/db";
import { channelConfigs } from "@/lib/db/schema";
import type { LicenseTag } from "@/app/api/instance/identity/route";

/**
 * GET /api/settings/glance
 *
 * The consolidated settings read for the FEAT-14 settings-at-a-glance rail.
 * One poll, one loading state, four grouped clusters (Runtime · Budget ·
 * Permissions · Integrations) summarized as compact read-only fields. Aggregates
 * the ~8 settings lib sources SERVER-SIDE (direct lib calls in one Promise.all,
 * never an HTTP fan-out), mirroring /api/instance/identity's discipline.
 *
 * Shadow-path rules (Engineering Principle #3 — data flows have shadow paths):
 * EVERY field is independently nullable, and each source is resolved in its own
 * `.catch(() => null)` so one failing read (e.g. no runtime configured) NULLS
 * only its own field — the rail still renders the chips that resolved. A total
 * route failure returns 500 and the client hook collapses the rail to nothing
 * (no crash, no half-rendered skeleton). Absent > wrong, everywhere.
 *
 * Live read of mutable server state (license files, runtime auth, budget policy,
 * permission allow-list, channel rows) — never cached.
 */
export const dynamic = "force-dynamic";

export type { LicenseTag };

export interface SettingsGlanceResponse {
  // Runtime cluster
  activeRuntimeLabel: string | null;
  activeModel: string | null;
  routingPreference: RoutingPreference | null;
  configuredRuntimeCount: number | null;
  readyRuntimeCount: number | null;
  runtimeReadiness: RuntimeReadinessSummary | null;
  sdkTimeoutSeconds: number | null;
  maxTurns: number | null;
  // Budget cluster
  licenseTag: LicenseTag;
  budgetMonthlyCapUsd: number | null;
  // Permissions cluster
  activePreset: string | null; // most-permissive active preset id, or null
  allowedPermissionCount: number | null;
  // Integrations cluster
  webSearchEnabled: boolean | null;
  channelCount: number | null;
  autoPromoteSkills: boolean | null;
}

// The active preset id, choosing the MOST permissive when several are fully
// satisfied by the current allow-list (full-auto ⊃ git-safe ⊃ read-only), so
// the glance reports the effective posture rather than a subset preset.
function pickPreset(activePresets: string[]): string | null {
  for (const id of ["full-auto", "git-safe", "read-only"]) {
    if (activePresets.includes(id)) return id;
  }
  return activePresets[0] ?? null;
}

async function resolveRuntime(): Promise<{
  label: string | null;
  model: string | null;
  configuredCount: number | null;
  readyCount: number | null;
  readiness: RuntimeReadinessSummary | null;
  routingPreference: RoutingPreference | null;
}> {
  const [statuses, routing] = await Promise.all([
    getRuntimeRoutingStatuses(),
    getRoutingSettings(),
  ]);
  const eligibleStatuses = statuses.filter((status) =>
    routing.policy.eligibleRuntimeIds.includes(status.runtimeId),
  );
  const active = pickReadyRuntime(eligibleStatuses);
  const configuredCount = eligibleStatuses.filter((status) => status.configured).length;
  return {
    label: active?.label ?? null,
    model: active?.modelId ?? null,
    configuredCount,
    readyCount: eligibleStatuses.filter((status) => status.ready).length,
    readiness: summarizeRuntimeReadiness(
      statuses,
      routing.policy.eligibleRuntimeIds,
    ),
    routingPreference: routing.preference,
  };
}

// Parse a numeric setting stored as a string; null/NaN → null (shadow path).
function numSetting(raw: string | null): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function countChannels(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(channelConfigs);
  return row?.value ?? 0;
}

export async function GET() {
  try {
    // Each source resolves independently; a single failing read nulls only its
    // own field(s) — the rail renders whatever resolved.
    const [
      runtime,
      label,
      budget,
      presets,
      allowed,
      exa,
      channels,
      sdkTimeout,
      maxTurns,
      autoPromote,
    ] = await Promise.all([
      resolveRuntime().catch(() => ({
        label: null,
        model: null,
        configuredCount: null,
        readyCount: null,
        readiness: null,
        routingPreference: null,
      })),
      Promise.resolve(getLicensedIdentity()).catch(() => null),
      getBudgetGuardrailSnapshot().catch(() => null),
      getActivePresets().catch(() => null),
      getAllowedPermissions().catch(() => null),
      getSetting(SETTINGS_KEYS.EXA_SEARCH_MCP_ENABLED).catch(() => null),
      countChannels().catch(() => null),
      getSetting(SETTINGS_KEYS.SDK_TIMEOUT_SECONDS).catch(() => null),
      getSetting(SETTINGS_KEYS.MAX_TURNS).catch(() => null),
      getSetting(SETTINGS_KEYS.AUTO_PROMOTE_SKILLS).catch(() => null),
    ]);

    const licenseTag: LicenseTag = label
      ? { kind: "licensed", label }
      : { kind: "community" };

    const body: SettingsGlanceResponse = {
      activeRuntimeLabel: runtime.label,
      activeModel: runtime.model,
      routingPreference: runtime.routingPreference,
      configuredRuntimeCount: runtime.configuredCount,
      readyRuntimeCount: runtime.readyCount,
      runtimeReadiness: runtime.readiness,
      sdkTimeoutSeconds: numSetting(sdkTimeout),
      maxTurns: numSetting(maxTurns),
      licenseTag,
      budgetMonthlyCapUsd: budget?.policy.overall.monthlySpendCapUsd ?? null,
      activePreset: presets ? pickPreset(presets) : null,
      allowedPermissionCount: allowed?.length ?? null,
      // exa is stored as the string "true"/"false"; null (unread) → null, not false.
      webSearchEnabled: exa == null ? null : exa === "true",
      channelCount: channels,
      autoPromoteSkills: autoPromote == null ? null : autoPromote === "true",
    };
    return NextResponse.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Zero silent failures — surface to server logs, let the hook fall into
    // status:"error" (the whole rail collapses to nothing).
    console.error("[settings/glance] read failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
