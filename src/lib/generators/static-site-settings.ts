import { z } from "zod";

export const STATIC_SITE_SETTINGS_KEY_PREFIX = "apps.staticSiteSettings.";

export const STATIC_SITE_SETTING_OPTIONS = {
  templateId: ["relay-default"],
  theme: ["calm", "contrast", "editorial"],
  density: ["comfortable", "compact"],
  heroLayout: ["split", "stacked", "text-first"],
  accent: ["tide", "indigo", "emerald", "coral"],
  showCtas: [true, false],
  sectionStyle: ["cards", "ruled", "banded"],
} as const;

export const staticSiteSettingsSchema = z
  .object({
    templateId: z.string().min(1).default("relay-default"),
    theme: z.enum(STATIC_SITE_SETTING_OPTIONS.theme).default("calm"),
    density: z.enum(STATIC_SITE_SETTING_OPTIONS.density).default("comfortable"),
    heroLayout: z.enum(STATIC_SITE_SETTING_OPTIONS.heroLayout).default("split"),
    accent: z.enum(STATIC_SITE_SETTING_OPTIONS.accent).default("tide"),
    showCtas: z.boolean().default(true),
    sectionStyle: z.enum(STATIC_SITE_SETTING_OPTIONS.sectionStyle).default("cards"),
  })
  .strict();

export type StaticSiteSettings = z.infer<typeof staticSiteSettingsSchema>;

export const DEFAULT_STATIC_SITE_SETTINGS: StaticSiteSettings =
  staticSiteSettingsSchema.parse({});

export class StaticSiteSettingsError extends Error {
  readonly code = "STATIC_SITE_SETTINGS_INVALID";
  readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = "StaticSiteSettingsError";
    this.issues = issues;
  }
}

export function staticSiteSettingsKey(appId: string): string {
  return `${STATIC_SITE_SETTINGS_KEY_PREFIX}${appId}`;
}

export function parseStaticSiteSettings(input: unknown): StaticSiteSettings {
  if (input == null) return DEFAULT_STATIC_SITE_SETTINGS;
  const parsed = staticSiteSettingsSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    });
    throw new StaticSiteSettingsError(
      `Static-site settings are invalid: ${issues.join("; ")}`,
      issues
    );
  }
  return parsed.data;
}
