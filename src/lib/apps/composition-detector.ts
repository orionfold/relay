import type { ToolResultCapture } from "@/lib/chat/entity-detector";

export interface ComposedAppSummary {
  appId: string;
  displayName: string;
  hasProfile: boolean;
  hasBlueprint: boolean;
  tableCount: number;
  scheduleCount: number;
  primitives: string[];
}

const COMPOSITION_TOOLS = new Set([
  "create_profile",
  "create_blueprint",
  "create_table",
  "create_schedule",
]);

export function extractAppIdFromArtifactId(
  id: string | undefined | null
): string | null {
  if (!id) return null;
  const idx = id.indexOf("--");
  if (idx <= 0) return null;
  return id.slice(0, idx);
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

interface Group {
  profileName: string | null;
  blueprintName: string | null;
  tables: number;
  schedules: number;
}

function emptyGroup(): Group {
  return { profileName: null, blueprintName: null, tables: 0, schedules: 0 };
}

function appIdFromResult(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const rec = result as Record<string, unknown>;
  // create_table and create_schedule use UUID primary keys for row identity,
  // so they echo back the appId argument as a separate field. Profile and
  // blueprint use the `<app-id>--<artifact-id>` slug convention, so their
  // appId can be parsed from `id`. Try the explicit field first, then fall
  // back to slug parsing.
  const explicit = typeof rec.appId === "string" ? rec.appId : null;
  if (explicit) return explicit;
  const id = typeof rec.id === "string" ? rec.id : null;
  return extractAppIdFromArtifactId(id);
}

function nameFromResult(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const rec = result as Record<string, unknown>;
  return typeof rec.name === "string" ? rec.name : null;
}

export function detectComposedApp(
  toolResults: ToolResultCapture[]
): ComposedAppSummary | null {
  const groups = new Map<string, Group>();

  for (const { toolName, result } of toolResults) {
    if (!COMPOSITION_TOOLS.has(toolName)) continue;
    const appId = appIdFromResult(result);
    if (!appId) continue;

    let g = groups.get(appId);
    if (!g) {
      g = emptyGroup();
      groups.set(appId, g);
    }

    if (toolName === "create_profile") g.profileName = nameFromResult(result);
    else if (toolName === "create_blueprint") g.blueprintName = nameFromResult(result);
    else if (toolName === "create_table") g.tables += 1;
    else if (toolName === "create_schedule") g.schedules += 1;
  }

  let winner: { appId: string; group: Group } | null = null;
  for (const [appId, g] of groups) {
    const hasComposition =
      g.profileName !== null &&
      g.blueprintName !== null &&
      (g.tables > 0 || g.schedules > 0);
    if (!hasComposition) continue;
    if (!winner) winner = { appId, group: g };
  }

  if (!winner) return null;

  const { appId, group } = winner;
  const displayName =
    // Prefer a derived name from the blueprint/profile when available,
    // but fall back to app-id title-case which is what the Phase 2 copy needs.
    titleCase(appId);

  const primitives: string[] = [];
  if (group.profileName) primitives.push("Agent");
  if (group.blueprintName) primitives.push("Blueprint");
  if (group.tables > 0) primitives.push(group.tables === 1 ? "1 table" : `${group.tables} tables`);
  if (group.schedules > 0) primitives.push(group.schedules === 1 ? "Schedule" : `${group.schedules} schedules`);

  return {
    appId,
    displayName,
    hasProfile: group.profileName !== null,
    hasBlueprint: group.blueprintName !== null,
    tableCount: group.tables,
    scheduleCount: group.schedules,
    primitives,
  };
}
