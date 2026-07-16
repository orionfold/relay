import { z } from "zod";
import { SETTINGS_KEYS } from "@/lib/constants/settings";
import {
  DASHBOARD_MODULE_IDS,
  DEFAULT_DASHBOARD_PREFERENCES,
  type DashboardPreferences,
} from "@/lib/dashboard/modules";
import { deleteSetting, getSetting, setSetting } from "@/lib/settings/helpers";

const visibleShape = Object.fromEntries(
  DASHBOARD_MODULE_IDS.map((id) => [id, z.boolean().optional()])
) as Record<(typeof DASHBOARD_MODULE_IDS)[number], z.ZodOptional<z.ZodBoolean>>;

export const DashboardPreferencesSchema = z
  .object({
    version: z.literal(1),
    smartOrdering: z.boolean(),
    visible: z.object(visibleShape).strict(),
  })
  .strict();

export async function getDashboardPreferences(): Promise<DashboardPreferences> {
  const raw = await getSetting(SETTINGS_KEYS.DASHBOARD_PREFERENCES);
  if (!raw) return DEFAULT_DASHBOARD_PREFERENCES;
  try {
    return DashboardPreferencesSchema.parse(JSON.parse(raw));
  } catch (error) {
    console.error("[dashboard-settings] invalid stored preferences:", error);
    return DEFAULT_DASHBOARD_PREFERENCES;
  }
}

export async function setDashboardPreferences(
  value: DashboardPreferences
): Promise<DashboardPreferences> {
  const parsed = DashboardPreferencesSchema.parse(value);
  await setSetting(SETTINGS_KEYS.DASHBOARD_PREFERENCES, JSON.stringify(parsed));
  return parsed;
}

export async function resetDashboardPreferences(): Promise<DashboardPreferences> {
  await deleteSetting(SETTINGS_KEYS.DASHBOARD_PREFERENCES);
  return DEFAULT_DASHBOARD_PREFERENCES;
}
