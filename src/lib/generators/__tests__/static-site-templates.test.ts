import { describe, expect, it } from "vitest";
import {
  CURRENT_STATIC_SITE_TEMPLATE_COMPATIBILITY,
  assertTemplateSupportsSettings,
  getStaticSiteTemplate,
  listStaticSiteTemplates,
  parseStaticSiteTemplate,
} from "../static-site-templates";
import { DEFAULT_STATIC_SITE_SETTINGS } from "../static-site-settings";

describe("static-site templates", () => {
  it("loads the bundled synthetic template catalog", () => {
    const templates = listStaticSiteTemplates();
    expect(templates.map((template) => template.id)).toContain("relay-default");
    expect(templates.length).toBeGreaterThanOrEqual(3);
    for (const template of templates) {
      expect(template.provenance).toMatchObject({
        source: "orionfold-bundled",
        synthetic: true,
      });
      expect(template.compatibility.version).toBe(CURRENT_STATIC_SITE_TEMPLATE_COMPATIBILITY);
    }
  });

  it("rejects unsafe executable-code fields", () => {
    const base = getStaticSiteTemplate("relay-default");
    expect(() =>
      parseStaticSiteTemplate({
        ...base,
        code: "alert('nope')",
      })
    ).toThrowError(/Unrecognized key/);
  });

  it("rejects unsupported section slots", () => {
    const base = getStaticSiteTemplate("relay-default");
    expect(() =>
      parseStaticSiteTemplate({
        ...base,
        supportedSectionKinds: ["hero", "carousel"],
      })
    ).toThrowError(/supportedSectionKinds/);
  });

  it("rejects incompatible generator template versions", () => {
    const base = getStaticSiteTemplate("relay-default");
    expect(() =>
      parseStaticSiteTemplate({
        ...base,
        compatibility: { generator: "static-site", version: "static-site-template/v99" },
      })
    ).toThrowError(/compatibility.version/);
  });

  it("refuses settings outside a template's declared control support", () => {
    const base = getStaticSiteTemplate("relay-default");
    expect(() =>
      assertTemplateSupportsSettings(
        { ...base, allowedControls: { theme: ["contrast"] } },
        DEFAULT_STATIC_SITE_SETTINGS
      )
    ).toThrowError(/does not support/);
  });
});
