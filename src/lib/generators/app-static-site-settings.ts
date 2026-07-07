import { getSetting, setSetting } from "@/lib/settings/helpers";
import {
  DEFAULT_STATIC_SITE_SETTINGS,
  parseStaticSiteSettings,
  staticSiteSettingsKey,
  StaticSiteSettingsError,
  type StaticSiteSettings,
} from "./static-site-settings";
import {
  assertTemplateSupportsSettings,
  getStaticSiteTemplate,
} from "./static-site-templates";

export async function getAppStaticSiteSettings(appId: string): Promise<StaticSiteSettings> {
  const raw = await getSetting(staticSiteSettingsKey(appId));
  if (raw === null) return DEFAULT_STATIC_SITE_SETTINGS;

  try {
    return parseStaticSiteSettings(JSON.parse(raw) as unknown);
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new StaticSiteSettingsError(
        `Static-site settings are invalid JSON for app ${appId}: ${err.message}`,
        [err.message]
      );
    }
    throw err;
  }
}

export async function setAppStaticSiteSettings(
  appId: string,
  input: unknown
): Promise<StaticSiteSettings> {
  const settings = parseStaticSiteSettings(input);
  assertTemplateSupportsSettings(getStaticSiteTemplate(settings.templateId), settings);
  await setSetting(staticSiteSettingsKey(appId), JSON.stringify(settings));
  return settings;
}
