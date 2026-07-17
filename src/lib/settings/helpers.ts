import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

/** Read a single setting from DB */
export async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, key));
  return rows[0]?.value ?? null;
}

/** Read a single setting from DB (synchronous — safe with better-sqlite3) */
export function getSettingSync(key: string): string | null {
  const rows = db.select().from(settings).where(eq(settings.key, key)).all();
  return rows[0]?.value ?? null;
}

/** Upsert a setting in DB */
export async function setSetting(key: string, value: string): Promise<void> {
  const now = new Date();
  const existing = await getSetting(key);
  if (existing !== null) {
    await db.update(settings)
      .set({ value, updatedAt: now })
      .where(eq(settings.key, key));
  } else {
    await db.insert(settings)
      .values({ key, value, updatedAt: now });
  }
}

/** Delete a single setting. Missing keys are already in the desired state. */
export async function deleteSetting(key: string): Promise<void> {
  await db.delete(settings).where(eq(settings.key, key));
}

/**
 * Apply a related group of setting upserts/deletes in one SQLite transaction.
 * A null value deletes the key. Use this for multi-field forms so a storage
 * error cannot leave a partially updated provider configuration behind.
 */
export async function applySettingsPatch(
  patch: Readonly<Record<string, string | null>>
): Promise<void> {
  const entries = Object.entries(patch);
  if (entries.length === 0) return;
  const now = new Date();
  db.transaction((tx) => {
    for (const [key, value] of entries) {
      if (value === null) {
        tx.delete(settings).where(eq(settings.key, key)).run();
      } else {
        tx.insert(settings)
          .values({ key, value, updatedAt: now })
          .onConflictDoUpdate({
            target: settings.key,
            set: { value, updatedAt: now },
          })
          .run();
      }
    }
  });
}

// ---------------------------------------------------------------------------
// TDR-037 plugin trust model setting
// ---------------------------------------------------------------------------

/**
 * Plugin trust model (TDR-037 §5). Controls how `isCapabilityAccepted`
 * branches for a given plugin bundle:
 *
 *   - "auto" (default) — path split via classifier. Self-extension bundles
 *     bypass the lockfile; third-party bundles get the full M3 machinery.
 *   - "strict"          — force all bundles through the third-party path
 *     (lockfile consulted even for ainative-internal bundles). Training
 *     wheels for operators who want explicit accept on their own code.
 *   - "off"             — trust-on-first-use for all bundles. Matches
 *     Claude Code / Codex CLI freedom with no capability ceremony.
 *
 * Settings key: `plugin-trust-model`.
 */
export type PluginTrustModelSetting = "auto" | "strict" | "off";

const PLUGIN_TRUST_MODEL_KEY = "plugin-trust-model";
const PLUGIN_TRUST_MODEL_VALUES: readonly PluginTrustModelSetting[] = [
  "auto",
  "strict",
  "off",
];

function coerceTrustModel(raw: string | null): PluginTrustModelSetting {
  if (raw === null) return "auto";
  return PLUGIN_TRUST_MODEL_VALUES.includes(raw as PluginTrustModelSetting)
    ? (raw as PluginTrustModelSetting)
    : "auto";
}

export async function getPluginTrustModel(): Promise<PluginTrustModelSetting> {
  return coerceTrustModel(await getSetting(PLUGIN_TRUST_MODEL_KEY));
}

export function getPluginTrustModelSync(): PluginTrustModelSetting {
  return coerceTrustModel(getSettingSync(PLUGIN_TRUST_MODEL_KEY));
}

export async function setPluginTrustModel(
  value: PluginTrustModelSetting,
): Promise<void> {
  await setSetting(PLUGIN_TRUST_MODEL_KEY, value);
}

// ---------------------------------------------------------------------------
// Onboarding model preference (feature: onboarding-runtime-provider-choice)
// ---------------------------------------------------------------------------

/**
 * User's stated chat-model priority captured at first-launch onboarding.
 * Persisted alongside `chat.defaultModel` so future onboarding updates can
 * re-resolve the recommended model if the user hasn't pinned one themselves.
 *
 * - "quality"  — best output (e.g. Opus / GPT-5.4)
 * - "cost"     — cheapest cloud (e.g. Haiku / GPT-5.4 Mini)
 * - "privacy"  — operator-verified privacy-focused Ollama endpoint
 * - "balanced" — default middle path (Sonnet)
 *
 * Settings key: `chat.modelPreference`. A null value (skipped onboarding or
 * never asked) means "use whatever the user picked in settings, no implicit
 * preference recorded."
 */
export type ModelPreference = "quality" | "cost" | "privacy" | "balanced";

const MODEL_PREFERENCE_KEY = "chat.modelPreference";
const DEFAULT_MODEL_KEY = "chat.defaultModel";
const MODEL_PREFERENCE_PROMPT_IMPRESSION_KEY =
  "onboarding.modelPreferencePromptImpression";
const MODEL_PREFERENCE_VALUES: readonly ModelPreference[] = [
  "quality",
  "cost",
  "privacy",
  "balanced",
];

function coerceModelPreference(raw: string | null): ModelPreference | null {
  if (raw === null) return null;
  return MODEL_PREFERENCE_VALUES.includes(raw as ModelPreference)
    ? (raw as ModelPreference)
    : null;
}

export async function getModelPreference(): Promise<ModelPreference | null> {
  return coerceModelPreference(await getSetting(MODEL_PREFERENCE_KEY));
}

export async function setModelPreference(
  value: ModelPreference | null,
): Promise<void> {
  if (value === null) {
    // Treat null as "clear the preference" — write the literal "" so the
    // record exists but coerces back to null on read. We keep the row to
    // signal "the user has been asked at least once" (used by the bootstrapper
    // to suppress the modal after a Skip).
    await setSetting(MODEL_PREFERENCE_KEY, "");
    return;
  }
  await setSetting(MODEL_PREFERENCE_KEY, value);
}

/**
 * True when the user has been asked at least once — either picked a
 * preference or explicitly skipped. Used by the onboarding bootstrapper
 * to decide whether to show the modal.
 */
export async function hasSeenModelPreferencePrompt(): Promise<boolean> {
  return (await getSetting(MODEL_PREFERENCE_KEY)) !== null;
}

export const MODEL_PREFERENCE_PROMPT_IMPRESSION_WRITE_FAILED =
  "MODEL_PREFERENCE_PROMPT_IMPRESSION_WRITE_FAILED";

/** The instance-local onboarding prompt impression could not be claimed. */
export class ModelPreferencePromptImpressionWriteError extends Error {
  readonly code = MODEL_PREFERENCE_PROMPT_IMPRESSION_WRITE_FAILED;

  constructor(cause: unknown) {
    super("Relay could not record the default-model prompt impression.", {
      cause,
    });
    this.name = "ModelPreferencePromptImpressionWriteError";
  }
}

/**
 * Atomically claim the one automatic model-preference prompt for this Relay
 * instance. The settings database lives below RELAY_DATA_DIR, so the marker is
 * naturally cell/instance-local and survives browser sessions and restarts.
 *
 * Existing installs are grandfathered: either a saved default model or the
 * legacy preference/Skip row means the operator has already configured or
 * answered this prompt. The read and insert share one SQLite transaction so
 * concurrent browser sessions cannot both win the claim.
 */
export async function claimModelPreferencePromptImpression(): Promise<boolean> {
  try {
    return db.transaction((tx) => {
      const existing = tx
        .select({ key: settings.key })
        .from(settings)
        .where(
          inArray(settings.key, [
            MODEL_PREFERENCE_PROMPT_IMPRESSION_KEY,
            DEFAULT_MODEL_KEY,
            MODEL_PREFERENCE_KEY,
          ])
        )
        .all();

      if (existing.length > 0) return false;

      const now = new Date();
      const result = tx
        .insert(settings)
        .values({
          key: MODEL_PREFERENCE_PROMPT_IMPRESSION_KEY,
          value: now.toISOString(),
          updatedAt: now,
        })
        .onConflictDoNothing()
        .run();

      return result.changes === 1;
    });
  } catch (cause) {
    throw new ModelPreferencePromptImpressionWriteError(cause);
  }
}
