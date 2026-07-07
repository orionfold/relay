import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getAppRoot } from "@/lib/utils/app-root";
import {
  STATIC_SITE_SETTING_OPTIONS,
  type StaticSiteSettings,
} from "./static-site-settings";

export const STATIC_SITE_TEMPLATE_PACK_ID = "relay-web-templates";
export const CURRENT_STATIC_SITE_TEMPLATE_COMPATIBILITY = "static-site-template/v1";

const SectionKindSchema = z.enum(["hero", "features", "cta", "text"]);

const TemplateControlsSchema = z
  .object({
    theme: z.array(z.enum(STATIC_SITE_SETTING_OPTIONS.theme)).min(1).optional(),
    density: z.array(z.enum(STATIC_SITE_SETTING_OPTIONS.density)).min(1).optional(),
    heroLayout: z.array(z.enum(STATIC_SITE_SETTING_OPTIONS.heroLayout)).min(1).optional(),
    accent: z.array(z.enum(STATIC_SITE_SETTING_OPTIONS.accent)).min(1).optional(),
    showCtas: z.array(z.boolean()).min(1).optional(),
    sectionStyle: z.array(z.enum(STATIC_SITE_SETTING_OPTIONS.sectionStyle)).min(1).optional(),
  })
  .strict()
  .default({});

const TemplateLayoutSchema = z
  .object({
    bodyClass: z.string().regex(/^[a-z0-9 -]+$/).optional(),
    sectionLabels: z.record(SectionKindSchema, z.string().min(1)).optional(),
  })
  .strict()
  .default({});

const PreviewFixtureSchema = z
  .object({
    kind: SectionKindSchema,
    heading: z.string().min(1),
    body: z.string().optional(),
    order: z.number().optional(),
    ctaLabel: z.string().optional(),
    ctaUrl: z.string().optional(),
    imageUrl: z.string().optional(),
    status: z.literal("published").default("published"),
  })
  .strict();

export const StaticSiteTemplateSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    version: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    provenance: z
      .object({
        source: z.literal("orionfold-bundled"),
        synthetic: z.literal(true),
        note: z.string().min(1),
      })
      .strict(),
    compatibility: z
      .object({
        generator: z.literal("static-site"),
        version: z.literal(CURRENT_STATIC_SITE_TEMPLATE_COMPATIBILITY),
      })
      .strict(),
    supportedSectionKinds: z.array(SectionKindSchema).min(1),
    allowedControls: TemplateControlsSchema,
    previewFixtures: z.array(PreviewFixtureSchema).min(1),
    layout: TemplateLayoutSchema,
  })
  .strict();

export type StaticSiteTemplate = z.infer<typeof StaticSiteTemplateSchema>;

export interface StaticSiteTemplateSummary {
  id: string;
  version: string;
  name: string;
  description: string;
  provenance: StaticSiteTemplate["provenance"];
  supportedSectionKinds: StaticSiteTemplate["supportedSectionKinds"];
}

export class StaticSiteTemplateError extends Error {
  readonly code = "STATIC_SITE_TEMPLATE_INVALID";
  readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = "StaticSiteTemplateError";
    this.issues = issues;
  }
}

function templateSeedPath(): string {
  return path.join(
    getAppRoot(import.meta.dirname, 3),
    "src",
    "lib",
    "packs",
    "templates",
    STATIC_SITE_TEMPLATE_PACK_ID,
    "base",
    "seed",
    "tables",
    "web_templates.json"
  );
}

export function parseStaticSiteTemplate(input: unknown): StaticSiteTemplate {
  const result = StaticSiteTemplateSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const location = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${location}${issue.message}`;
    });
    throw new StaticSiteTemplateError(
      `Static-site template is invalid: ${issues.join("; ")}`,
      issues
    );
  }
  return result.data;
}

export function listStaticSiteTemplates(): StaticSiteTemplate[] {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(templateSeedPath(), "utf-8")) as unknown;
  } catch (err) {
    throw new StaticSiteTemplateError(
      `Static-site template catalog could not be loaded: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  if (!Array.isArray(raw)) {
    throw new StaticSiteTemplateError("Static-site template catalog must be a list");
  }
  return raw.map(parseStaticSiteTemplate);
}

export function getStaticSiteTemplate(templateId: string): StaticSiteTemplate {
  const template = listStaticSiteTemplates().find((row) => row.id === templateId);
  if (!template) {
    throw new StaticSiteTemplateError(`Unknown static-site template: ${templateId}`, [
      `templateId: Unknown static-site template "${templateId}"`,
    ]);
  }
  return template;
}

export function assertTemplateSupportsSettings(
  template: StaticSiteTemplate,
  settings: StaticSiteSettings
): void {
  const controls = template.allowedControls;
  const checks: Array<[keyof typeof controls, unknown]> = [
    ["theme", settings.theme],
    ["density", settings.density],
    ["heroLayout", settings.heroLayout],
    ["accent", settings.accent],
    ["showCtas", settings.showCtas],
    ["sectionStyle", settings.sectionStyle],
  ];
  const issues = checks.flatMap(([key, value]) => {
    const allowed = controls[key] as unknown[] | undefined;
    return allowed && !allowed.includes(value)
      ? [`${key}: Template "${template.id}" does not support "${String(value)}"`]
      : [];
  });

  if (issues.length > 0) {
    throw new StaticSiteTemplateError(
      `Static-site template settings are incompatible: ${issues.join("; ")}`,
      issues
    );
  }
}

export function staticSiteTemplateSummary(
  template: StaticSiteTemplate
): StaticSiteTemplateSummary {
  return {
    id: template.id,
    version: template.version,
    name: template.name,
    description: template.description,
    provenance: template.provenance,
    supportedSectionKinds: template.supportedSectionKinds,
  };
}
