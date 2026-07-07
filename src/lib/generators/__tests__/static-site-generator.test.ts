import { describe, expect, it } from "vitest";
import { staticSiteGenerator } from "../static-site-generator";

/** Convenience: a published section row with sane defaults. */
function section(
  over: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    kind: "text",
    heading: "A heading",
    body: "Some body copy.",
    order: 0,
    status: "published",
    ...over,
  };
}

async function html(
  rows: Array<Record<string, unknown>>,
  config: Record<string, unknown> = {}
): Promise<string> {
  const artifact = await staticSiteGenerator.generate(rows, config);
  return String(artifact.files[0]!.content);
}

describe("static-site generator — Artifact shape", () => {
  it("emits a single self-contained index.html Artifact", async () => {
    const artifact = await staticSiteGenerator.generate(
      [section({ kind: "hero", heading: "Welcome" })],
      { siteTitle: "Acme" }
    );
    expect(artifact.files).toHaveLength(1);
    expect(artifact.files[0]!.path).toBe("index.html");
    expect(artifact.entryPoint).toBe("index.html");
    expect(typeof artifact.hash).toBe("string");
    expect(artifact.hash.length).toBeGreaterThan(0);
    const doc = String(artifact.files[0]!.content);
    expect(doc).toContain("<!doctype html>");
    expect(doc).toContain("<title>Acme</title>");
    expect(doc).toContain("Welcome");
    // Self-contained: no external stylesheet/script references.
    expect(doc).not.toContain("<link rel=\"stylesheet\"");
    expect(doc).not.toContain("src=\"http");
  });

  it("produces a deterministic hash for identical input", async () => {
    const rows = [section({ heading: "One" }), section({ heading: "Two", order: 1 })];
    const a = await staticSiteGenerator.generate(rows, { siteTitle: "X" });
    const b = await staticSiteGenerator.generate(rows, { siteTitle: "X" });
    expect(a.hash).toBe(b.hash);
  });

  it("changes the hash when content changes", async () => {
    const a = await staticSiteGenerator.generate([section({ heading: "One" })], {});
    const b = await staticSiteGenerator.generate([section({ heading: "Two" })], {});
    expect(a.hash).not.toBe(b.hash);
  });
});

describe("static-site generator — site settings", () => {
  it("uses the current default settings when settings are absent", async () => {
    const doc = await html([section({ kind: "hero", heading: "Welcome" })]);
    expect(doc).toContain(
      'class="template-relay-default theme-calm density-comfortable hero-split accent-tide sections-cards"'
    );
  });

  it("applies validated theme/layout settings to generated output", async () => {
    const doc = await html(
      [
        section({
          kind: "hero",
          heading: "Welcome",
          ctaLabel: "Start",
          ctaUrl: "https://example.com",
        }),
      ],
      {
        staticSiteSettings: {
          templateId: "editorial-proof",
          theme: "contrast",
          density: "compact",
          heroLayout: "stacked",
          accent: "indigo",
          showCtas: false,
          sectionStyle: "ruled",
        },
      }
    );
    expect(doc).toContain("template-editorial-proof");
    expect(doc).toContain("theme-contrast");
    expect(doc).toContain("density-compact");
    expect(doc).toContain("hero-stacked");
    expect(doc).toContain("accent-indigo");
    expect(doc).toContain("sections-ruled");
    expect(doc).not.toContain('class="cta"');
  });

  it("fails with a named template error for an unknown template id", async () => {
    await expect(
      staticSiteGenerator.generate([section()], {
        staticSiteSettings: {
          templateId: "does-not-exist",
          theme: "calm",
          density: "comfortable",
          heroLayout: "split",
          accent: "tide",
          showCtas: true,
          sectionStyle: "cards",
        },
      })
    ).rejects.toMatchObject({
      name: "StaticSiteTemplateError",
      code: "STATIC_SITE_TEMPLATE_INVALID",
      message: expect.stringContaining("does-not-exist"),
    });
  });

  it("fails with a named settings error for unsupported settings", async () => {
    await expect(
      staticSiteGenerator.generate([section()], {
        staticSiteSettings: {
          theme: "neon",
          density: "comfortable",
          heroLayout: "split",
          accent: "tide",
          showCtas: true,
          sectionStyle: "cards",
        },
      })
    ).rejects.toMatchObject({
      name: "StaticSiteSettingsError",
      code: "STATIC_SITE_SETTINGS_INVALID",
      message: expect.stringContaining("theme"),
    });
  });
});

describe("static-site generator — draft gate (fail-safe)", () => {
  it("renders only status === 'published'", async () => {
    const doc = await html([
      section({ heading: "LIVE", status: "published" }),
      section({ heading: "DRAFTY", status: "draft" }),
    ]);
    expect(doc).toContain("LIVE");
    expect(doc).not.toContain("DRAFTY");
  });

  it("excludes rows with null/missing/unknown status", async () => {
    const doc = await html([
      section({ heading: "KEEP", status: "published" }),
      section({ heading: "NOSTATUS", status: undefined }),
      section({ heading: "WEIRD", status: "archived" }),
    ]);
    expect(doc).toContain("KEEP");
    expect(doc).not.toContain("NOSTATUS");
    expect(doc).not.toContain("WEIRD");
  });
});

describe("static-site generator — ordering", () => {
  it("sorts sections by ascending order", async () => {
    const doc = await html([
      section({ heading: "THIRD", order: 3 }),
      section({ heading: "FIRST", order: 1 }),
      section({ heading: "SECOND", order: 2 }),
    ]);
    expect(doc.indexOf("FIRST")).toBeLessThan(doc.indexOf("SECOND"));
    expect(doc.indexOf("SECOND")).toBeLessThan(doc.indexOf("THIRD"));
  });

  it("sorts missing/non-numeric order last, stably", async () => {
    const doc = await html([
      section({ heading: "NOORDER", order: undefined }),
      section({ heading: "HASORDER", order: 1 }),
    ]);
    expect(doc.indexOf("HASORDER")).toBeLessThan(doc.indexOf("NOORDER"));
  });
});

describe("static-site generator — unknown kind (fail-safe)", () => {
  it("skips a row with an unknown kind without failing the page", async () => {
    const doc = await html([
      section({ kind: "hero", heading: "GOODHERO" }),
      section({ kind: "carousel", heading: "BADKIND", order: 1 }),
    ]);
    expect(doc).toContain("GOODHERO");
    expect(doc).not.toContain("BADKIND");
  });
});

describe("static-site generator — escaping (XSS defense)", () => {
  it("HTML-escapes heading and body text", async () => {
    const doc = await html([
      section({ heading: "<script>alert(1)</script>", body: "a & b < c" }),
    ]);
    expect(doc).not.toContain("<script>alert(1)</script>");
    expect(doc).toContain("&lt;script&gt;");
    expect(doc).toContain("a &amp; b &lt; c");
  });

  it("attr-escapes URLs and strips javascript: schemes", async () => {
    const doc = await html([
      section({
        kind: "cta",
        heading: "Buy",
        ctaLabel: "Go",
        ctaUrl: "javascript:alert(1)",
      }),
    ]);
    expect(doc).not.toContain("javascript:alert(1)");
    // Stripped to a safe placeholder href.
    expect(doc).toContain('href="#"');
  });

  it("strips javascript: obfuscated with control chars / embedded whitespace", async () => {
    // Regression (post-0.35.0 security review): a browser ignores ASCII control
    // chars and whitespace while parsing a URL scheme, so a blocklist that reads
    // the raw string is bypassable. These MUST all collapse to href="#".
    const CTRL = String.fromCharCode(1); // \x01
    const vectors = [
      `${CTRL}javascript:alert(1)`,
      `java${String.fromCharCode(9)}script:alert(1)`, // embedded tab
      `java${String.fromCharCode(10)}script:alert(1)`, // embedded newline
      `java${String.fromCharCode(13)}script:alert(1)`, // embedded CR
      `${String.fromCharCode(0)}data:text/html,<script>`, // NUL + data:
      "vbscript:msgbox(1)",
    ];
    for (const url of vectors) {
      const doc = await html([
        section({ kind: "cta", heading: "X", ctaLabel: "Go", ctaUrl: url }),
      ]);
      expect(doc).toContain('href="#"');
      expect(doc.toLowerCase()).not.toContain("javascript:");
      expect(doc.toLowerCase()).not.toContain("vbscript:");
      // No lingering "...script:" after whitespace/control removal either.
      expect(doc.replace(/\s/g, "").toLowerCase()).not.toContain("script:alert");
    }
  });

  it("strips control-char obfuscation in a hero imageUrl too", async () => {
    const doc = await html([
      section({
        kind: "hero",
        heading: "H",
        imageUrl: `java${String.fromCharCode(9)}script:alert(1)`,
      }),
    ]);
    expect(doc).toContain('src="#"');
    expect(doc.replace(/\s/g, "").toLowerCase()).not.toContain("script:alert");
  });

  it("keeps a safe http(s) cta url", async () => {
    const doc = await html([
      section({
        kind: "cta",
        heading: "Buy",
        ctaLabel: "Go",
        ctaUrl: "https://example.com/x?a=1&b=2",
      }),
    ]);
    expect(doc).toContain("https://example.com/x?a=1&amp;b=2");
  });
});

describe("static-site generator — empty input (never broken)", () => {
  it("emits a valid placeholder page when no rows are published", async () => {
    const artifact = await staticSiteGenerator.generate(
      [section({ status: "draft" })],
      { siteTitle: "Empty Co" }
    );
    const doc = String(artifact.files[0]!.content);
    expect(doc).toContain("<!doctype html>");
    expect(doc).toContain("</html>");
    expect(doc.toLowerCase()).toContain("no content yet");
  });

  it("emits a valid page for a totally empty row set", async () => {
    const artifact = await staticSiteGenerator.generate([], {});
    const doc = String(artifact.files[0]!.content);
    expect(doc).toContain("<!doctype html>");
    expect(doc).toContain("</html>");
  });
});

describe("static-site generator — per-kind rendering", () => {
  it("renders a hero with its heading, body, image and cta", async () => {
    const doc = await html([
      section({
        kind: "hero",
        heading: "Big Title",
        body: "Subtitle here",
        imageUrl: "https://cdn.example.com/hero.png",
        ctaLabel: "Start",
        ctaUrl: "https://example.com/start",
      }),
    ]);
    expect(doc).toContain("Big Title");
    expect(doc).toContain("Subtitle here");
    expect(doc).toContain("https://cdn.example.com/hero.png");
    expect(doc).toContain("Start");
  });

  it("renders a features section", async () => {
    const doc = await html([
      section({ kind: "features", heading: "Why us", body: "Fast. Cheap. Good." }),
    ]);
    expect(doc).toContain("Why us");
    expect(doc).toContain("Fast. Cheap. Good.");
  });
});
