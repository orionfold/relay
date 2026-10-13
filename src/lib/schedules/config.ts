import { getSettingSync } from "@/lib/settings/helpers";
import { SETTINGS_KEYS } from "@/lib/constants/settings";

const DEFAULT_MAX_CONCURRENT = 2;
const DEFAULT_MAX_RUN_DURATION_SEC = 1200; // 20 minutes
const DEFAULT_CHAT_PRESSURE_DELAY_SEC = 30;

/**
 * Read a positive-integer config value: environment variable first, then the
 * settings table, then the default.
 *
 * Exported because the on-demand task cap in `@/lib/agents/task-slots` reads
 * its own cap the same way, and one parser is better than two that drift.
 */
export function readIntConfig(
  envVar: string,
  settingKey: string,
  defaultValue: number,
): number {
  const envRaw = process.env[envVar];
  if (envRaw !== undefined) {
    const parsed = parseInt(envRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    console.warn(
      `[config] ${envVar}="${envRaw}" is not a positive integer; using default ${defaultValue}`,
    );
  }

  const settingRaw = getSettingSync(settingKey);
  if (settingRaw !== null) {
    const parsed = parseInt(settingRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return defaultValue;
}

export function getScheduleMaxConcurrent(): number {
  return readIntConfig(
    "SCHEDULE_MAX_CONCURRENT",
    SETTINGS_KEYS.SCHEDULE_MAX_CONCURRENT,
    DEFAULT_MAX_CONCURRENT,
  );
}

export function getScheduleMaxRunDurationSec(): number {
  return readIntConfig(
    "SCHEDULE_MAX_RUN_DURATION_SEC",
    SETTINGS_KEYS.SCHEDULE_MAX_RUN_DURATION_SEC,
    DEFAULT_MAX_RUN_DURATION_SEC,
  );
}

export function getScheduleChatPressureDelaySec(): number {
  return readIntConfig(
    "SCHEDULE_CHAT_PRESSURE_DELAY_SEC",
    SETTINGS_KEYS.SCHEDULE_CHAT_PRESSURE_DELAY_SEC,
    DEFAULT_CHAT_PRESSURE_DELAY_SEC,
  );
}
