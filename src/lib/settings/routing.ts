/**
 * Routing preference setting — controls how suggestRuntime() picks runtimes.
 */

import { SETTINGS_KEYS, type RoutingPreference } from "@/lib/constants/settings";
import { applySettingsPatch, getSetting } from "./helpers";
import {
  readRoutingPolicy,
  serializeRoutingPolicy,
  type RoutingPolicyReadResult,
  type RoutingPolicyV1,
} from "./routing-policy";

const VALID_PREFERENCES: RoutingPreference[] = ["cost", "latency", "quality", "manual"];
const DEFAULT_PREFERENCE: RoutingPreference = "latency";

export async function getRoutingPreference(): Promise<RoutingPreference> {
  const raw = await getSetting(SETTINGS_KEYS.ROUTING_PREFERENCE);
  if (raw && VALID_PREFERENCES.includes(raw as RoutingPreference)) {
    return raw as RoutingPreference;
  }
  return DEFAULT_PREFERENCE;
}

export interface RoutingSettingsSnapshot extends RoutingPolicyReadResult {
  preference: RoutingPreference;
}

export async function getRoutingSettings(): Promise<RoutingSettingsSnapshot> {
  const [preference, rawPolicy] = await Promise.all([
    getRoutingPreference(),
    getSetting(SETTINGS_KEYS.ROUTING_POLICY),
  ]);
  return { preference, ...readRoutingPolicy(rawPolicy) };
}

export async function setRoutingSettings(input: {
  preference: RoutingPreference;
  policy: RoutingPolicyV1;
}): Promise<void> {
  if (!VALID_PREFERENCES.includes(input.preference)) {
    throw new Error(`Invalid routing preference: ${input.preference}`);
  }
  await applySettingsPatch({
    [SETTINGS_KEYS.ROUTING_PREFERENCE]: input.preference,
    [SETTINGS_KEYS.ROUTING_POLICY]: serializeRoutingPolicy(input.policy),
  });
}

export async function setRoutingPreference(value: RoutingPreference): Promise<void> {
  if (!VALID_PREFERENCES.includes(value)) {
    throw new Error(`Invalid routing preference: ${value}`);
  }
  const current = await getRoutingSettings();
  await setRoutingSettings({ preference: value, policy: current.policy });
}
